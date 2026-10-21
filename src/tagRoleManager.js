const { PermissionFlagsBits } = require("discord.js");
const config = require("./config");
const { sendDiscordLog } = require("./logger");

let client = null;
let listenersAttached = false;
let shuttingDown = false;
let initialSyncRunning = false;

// Controle de concorrência para evitar operações duplicadas ou loops de eventos no mesmo usuário
const processingUsers = new Set();
// Armazena o último estado processado por usuário para evitar chamadas repetidas em rajadas de eventos (raw + guildMemberUpdate + userUpdate)
const lastProcessedState = new Map();

function logInfo(msg) {
    console.log(`🏷️ [TagRole] ${msg}`);
}

function logWarn(msg) {
    console.warn(`⚠️ [TagRole] ${msg}`);
}

function logError(msg, err) {
    if (err) {
        console.error(`❌ [TagRole] ${msg}`, err.message || err);
    } else {
        console.error(`❌ [TagRole] ${msg}`);
    }
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Obtém a configuração normalizada do sistema de tag.
 */
function getTagConfig() {
    const fallbackGuildId = client?.guilds?.cache?.first()?.id || "";
    const guildId = String(config.tagGuildId || config.guildId || fallbackGuildId).trim();
    const roleId = String(config.tagRoleId || "").trim();
    const rawServerTagId = String(config.serverTagId || "").trim();

    // Na API do Discord (user.primary_guild), o identificador da tag é o ID do servidor (identity_guild_id).
    // Se SERVER_TAG_ID for um Snowflake (17-20 dígitos), usamos como identity_guild_id alvo;
    // se estiver vazio, o identity_guild_id alvo é o próprio guildId do servidor.
    // Se SERVER_TAG_ID for preenchido com a sigla da tag (1 a 4 caracteres), filtramos também pelo texto da tag.
    let targetIdentityGuildId = guildId;
    let targetTagText = null;

    if (rawServerTagId) {
        if (/^\d{17,20}$/.test(rawServerTagId)) {
            targetIdentityGuildId = rawServerTagId;
        } else {
            targetTagText = rawServerTagId;
        }
    }

    return {
        enabled: Boolean(guildId && roleId),
        guildId,
        roleId,
        targetIdentityGuildId,
        targetTagText
    };
}

/**
 * Avalia se o usuário está utilizando a tag do servidor no perfil com base nos dados oficiais da API do Discord.
 *
 * Estrutura oficial na API v10 / discord.js v14.25+:
 * - Raw API (snake_case): user.primary_guild (ou user.clan) -> { identity_guild_id, identity_enabled, tag, badge }
 * - discord.js (camelCase): user.primaryGuild -> { identityGuildId, identityEnabled, tag, badge }
 *
 * Retorna:
 * - { status: "ACTIVE", tag: string | null, identityGuildId: string } -> Tag do servidor ativa no perfil
 * - { status: "INACTIVE", tag: string | null, identityGuildId: string | null } -> Confirmado que NÃO está usando a tag
 * - { status: "UNKNOWN" } -> Dados de primary_guild indisponíveis/inconclusivos no payload parcial
 */
function evaluateUserServerTag(userOrMember, rawUserPayload = null) {
    const { targetIdentityGuildId, targetTagText } = getTagConfig();
    if (!targetIdentityGuildId) {
        return { status: "UNKNOWN" };
    }

    const discordUser = userOrMember?.user || userOrMember || null;
    let primaryGuildData = undefined;

    // 1. Prioriza o payload bruto do Gateway/REST se possuir explicitamente o campo primary_guild ou clan
    if (rawUserPayload && typeof rawUserPayload === "object") {
        if ("primary_guild" in rawUserPayload) {
            primaryGuildData = rawUserPayload.primary_guild;
        } else if ("clan" in rawUserPayload) {
            primaryGuildData = rawUserPayload.clan;
        }
    }

    // 2. Caso contrário, verifica a estrutura User#primaryGuild do discord.js
    if (primaryGuildData === undefined && discordUser && typeof discordUser === "object") {
        if ("primaryGuild" in discordUser && discordUser.primaryGuild !== undefined) {
            primaryGuildData = discordUser.primaryGuild;
        } else if ("primary_guild" in discordUser && discordUser.primary_guild !== undefined) {
            primaryGuildData = discordUser.primary_guild;
        }
    }

    // Se a propriedade não existe no objeto (ex: User parcial ainda não carregado), o estado é inconclusivo
    if (primaryGuildData === undefined) {
        return { status: "UNKNOWN" };
    }

    // Se primary_guild é null, o usuário comprovadamente não possui nenhuma tag de servidor ativa
    if (primaryGuildData === null) {
        return { status: "INACTIVE", tag: null, identityGuildId: null };
    }

    const identityGuildId =
        primaryGuildData.identityGuildId ??
        primaryGuildData.identity_guild_id ??
        null;

    const identityEnabled =
        primaryGuildData.identityEnabled ??
        primaryGuildData.identity_enabled ??
        null;

    const tagText =
        primaryGuildData.tag ??
        null;

    // Para estar ativa: identity_enabled deve ser true e identity_guild_id deve corresponder ao servidor monitorado
    const isEnabled = identityEnabled === true;
    const isTargetGuild =
        identityGuildId !== null &&
        String(identityGuildId) === String(targetIdentityGuildId);

    const matchesTagText =
        !targetTagText ||
        (typeof tagText === "string" &&
            tagText.trim().toLowerCase() === targetTagText.toLowerCase());

    if (isEnabled && isTargetGuild && matchesTagText) {
        return {
            status: "ACTIVE",
            tag: tagText,
            identityGuildId: String(identityGuildId)
        };
    }

    return {
        status: "INACTIVE",
        tag: tagText,
        identityGuildId: identityGuildId ? String(identityGuildId) : null
    };
}

/**
 * Valida se o servidor, o cargo e as permissões/hierarquia do bot estão corretos.
 */
async function validateGuildAndRole() {
    const tagCfg = getTagConfig();
    if (!tagCfg.enabled) {
        return { ok: false, reason: "NOT_CONFIGURED" };
    }

    const guild =
        client.guilds.cache.get(tagCfg.guildId) ||
        (await client.guilds.fetch(tagCfg.guildId).catch(() => null));

    if (!guild) {
        logError(`Servidor configurado (${tagCfg.guildId}) não encontrado ou o bot não está nele.`);
        return { ok: false, reason: "GUILD_NOT_FOUND" };
    }

    const botMember =
        guild.members.me ||
        (await guild.members.fetchMe().catch(() => null));

    if (!botMember) {
        logError(`Não foi possível obter os dados do próprio bot no servidor "${guild.name}".`);
        return { ok: false, reason: "BOT_MEMBER_NOT_FOUND" };
    }

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        logError(
            `O bot não possui a permissão "Gerenciar Cargos" (ManageRoles) no servidor "${guild.name}".`
        );
        return { ok: false, reason: "MISSING_MANAGE_ROLES" };
    }

    const role =
        guild.roles.cache.get(tagCfg.roleId) ||
        (await guild.roles.fetch(tagCfg.roleId).catch(() => null));

    if (!role) {
        logError(
            `O cargo configurado (${tagCfg.roleId}) não existe no servidor "${guild.name}". Verifique TAG_ROLE_ID.`
        );
        return { ok: false, reason: "ROLE_NOT_FOUND" };
    }

    if (role.managed) {
        logError(
            `O cargo "${role.name}" (${role.id}) é gerenciado por uma integração externa e não pode ser atribuído pelo bot.`
        );
        return { ok: false, reason: "ROLE_MANAGED" };
    }

    if (role.position >= botMember.roles.highest.position) {
        logError(
            `Hierarquia insuficiente: o cargo "${role.name}" (posição ${role.position}) está acima ou igual ao maior cargo do bot "${botMember.roles.highest.name}" (posição ${botMember.roles.highest.position}).`
        );
        return { ok: false, reason: "ROLE_HIERARCHY" };
    }

    return { ok: true, guild, botMember, role, tagCfg };
}

/**
 * Reconcilia o cargo de um membro específico conforme o estado atual da sua tag do servidor.
 *
 * @param {import('discord.js').GuildMember} member
 * @param {object|null} rawUserPayload
 * @param {object} options
 */
async function reconcileMemberTagRole(member, rawUserPayload = null, options = {}) {
    if (shuttingDown || !client || !member) return { changed: false };

    const tagCfg = getTagConfig();
    if (!tagCfg.enabled) return { changed: false };

    if (member.guild && member.guild.id !== tagCfg.guildId) {
        return { changed: false };
    }

    const userId = member.id || member.user?.id;
    if (!userId) return { changed: false };

    // Ignora bots
    if (member.user?.bot || rawUserPayload?.bot) {
        return { changed: false };
    }

    // Evita execuções simultâneas para o mesmo membro
    if (processingUsers.has(userId)) {
        return { changed: false };
    }

    processingUsers.add(userId);

    try {
        let evaluation = evaluateUserServerTag(member, rawUserPayload);

        // Se o estado da tag for inconclusivo e for permitido buscar na API, consulta o membro atualizado
        if (evaluation.status === "UNKNOWN" && options.allowFetch !== false && member.guild) {
            const freshMember = await member.guild.members
                .fetch({ user: userId, force: true })
                .catch(() => null);

            if (!freshMember) {
                return { changed: false };
            }
            member = freshMember;
            evaluation = evaluateUserServerTag(member, null);
        }

        // Nunca remove nem altera cargos se a informação sobre a tag continuar indisponível/inconclusiva
        if (evaluation.status === "UNKNOWN") {
            return { changed: false };
        }

        const hasRole = Boolean(member.roles?.cache?.has(tagCfg.roleId));
        const shouldHaveRole = evaluation.status === "ACTIVE";

        // Guarda estado para evitar reprocessamento idêntico em rajadas de eventos
        const stateKey = `${evaluation.status}:${hasRole}`;
        const prev = lastProcessedState.get(userId);
        if (prev && prev.stateKey === stateKey && Date.now() - prev.timestamp < 3000) {
            return { changed: false };
        }
        lastProcessedState.set(userId, { stateKey, timestamp: Date.now() });

        // Se o membro já está no estado correto (já tem o cargo ou já está sem o cargo), não faz nenhuma requisição
        if (shouldHaveRole === hasRole) {
            return { changed: false };
        }

        // Valida permissões e hierarquia antes de tentar alterar o cargo
        const validation = await validateGuildAndRole();
        if (!validation.ok) {
            return { changed: false };
        }

        const { role } = validation;
        const userLabel = member.user?.tag || rawUserPayload?.username || userId;

        if (shouldHaveRole && !hasRole) {
            await member.roles.add(
                role.id,
                `Tag do servidor ativada no perfil (${evaluation.tag || tagCfg.targetIdentityGuildId})`
            );

            lastProcessedState.set(userId, {
                stateKey: `ACTIVE:true`,
                timestamp: Date.now()
            });

            logInfo(
                `Cargo "${role.name}" ADICIONADO a ${userLabel} (${userId}) por utilizar a tag do servidor.`
            );

            if (!options.silentLog && config.tagLogChannelId) {
                sendDiscordLog(client, {
                    channelId: config.tagLogChannelId,
                    title: "🏷️ Cargo por Tag Adicionado",
                    action: "Tag do Servidor Ativada",
                    user: `${userLabel} (${userId})`,
                    details: `O membro ativou a tag do servidor no perfil e recebeu o cargo **${role.name}** (<@&${role.id}>).`,
                    status: "SUCCESS"
                }).catch(() => {});
            }

            return { changed: true, action: "ADDED" };
        }

        if (!shouldHaveRole && hasRole) {
            // Remove SOMENTE o cargo gerenciado por esta funcionalidade
            await member.roles.remove(
                role.id,
                "Tag do servidor removida ou desativada do perfil"
            );

            lastProcessedState.set(userId, {
                stateKey: `INACTIVE:false`,
                timestamp: Date.now()
            });

            logInfo(
                `Cargo "${role.name}" REMOVIDO de ${userLabel} (${userId}) por remover/desativar a tag do servidor.`
            );

            if (!options.silentLog && config.tagLogChannelId) {
                sendDiscordLog(client, {
                    channelId: config.tagLogChannelId,
                    title: "🏷️ Cargo por Tag Removido",
                    action: "Tag do Servidor Removida",
                    user: `${userLabel} (${userId})`,
                    details: `O membro removeu ou desativou a tag do servidor no perfil e perdeu o cargo **${role.name}** (<@&${role.id}>).`,
                    status: "WARNING"
                }).catch(() => {});
            }

            return { changed: true, action: "REMOVED" };
        }

        return { changed: false };
    } catch (err) {
        // Código 10007 = Unknown Member (o membro saiu do servidor durante a operação)
        if (err?.code === 10007) {
            logWarn(`Membro ${userId} saiu do servidor durante a atualização do cargo.`);
            return { changed: false };
        }
        // Código 50013 = Missing Permissions
        if (err?.code === 50013) {
            logError(
                `Sem permissão para alterar o cargo do membro ${userId}. Verifique a permissão "Gerenciar Cargos" e a posição do cargo do bot.`,
                err
            );
            return { changed: false };
        }
        // Código 10011 = Unknown Role
        if (err?.code === 10011) {
            logError(`O cargo configurado (${tagCfg.roleId}) não foi encontrado ao atualizar ${userId}.`, err);
            return { changed: false };
        }

        logError(`Erro ao reconciliar cargo por tag para o membro ${userId}:`, err);
        return { changed: false };
    } finally {
        processingUsers.delete(userId);
    }
}

/**
 * Sincronização inicial ao iniciar o bot:
 * Verifica os membros do servidor, adiciona o cargo a quem usa a tag
 * e remove de quem possui o cargo mas comprovadamente não usa mais a tag.
 */
async function syncAllMembersOnStartup() {
    if (shuttingDown || initialSyncRunning || !client) return;

    const tagCfg = getTagConfig();
    if (!tagCfg.enabled) {
        logInfo(
            "Sistema de cargo por tag ainda não configurado (defina GUILD_ID e TAG_ROLE_ID nas variáveis de ambiente para ativar)."
        );
        return;
    }

    const validation = await validateGuildAndRole();
    if (!validation.ok) {
        return;
    }

    const { guild, role } = validation;
    initialSyncRunning = true;

    try {
        logInfo(
            `Iniciando sincronização de membros no servidor "${guild.name}" para o cargo "${role.name}" (${role.id})...`
        );

        let membersCollection = null;

        // Tenta buscar a lista completa de membros via Gateway/REST
        try {
            membersCollection = await guild.members.fetch();
        } catch (fetchErr) {
            logWarn(
                `Não foi possível buscar todos os membros via Gateway (${fetchErr.message}). Tentando via REST list()...`
            );
            try {
                membersCollection = await guild.members.list({ limit: 1000 });
            } catch (listErr) {
                logWarn(
                    `Não foi possível listar membros via REST (${listErr.message}). Usando membros presentes no cache (${guild.members.cache.size}).`
                );
                membersCollection = guild.members.cache;
            }
        }

        if (!membersCollection || membersCollection.size === 0) {
            logWarn("Nenhum membro retornado para sincronização inicial.");
            return;
        }

        let addedCount = 0;
        let removedCount = 0;
        let checkedCount = 0;

        for (const [, member] of membersCollection) {
            if (shuttingDown) break;
            if (!member || member.user?.bot) continue;

            checkedCount++;

            const evaluation = evaluateUserServerTag(member, null);
            if (evaluation.status === "UNKNOWN") {
                // Não remove nem adiciona se a informação estiver inconclusiva
                continue;
            }

            const hasRole = member.roles.cache.has(role.id);
            const shouldHaveRole = evaluation.status === "ACTIVE";

            if (shouldHaveRole === hasRole) {
                continue;
            }

            const result = await reconcileMemberTagRole(member, null, {
                allowFetch: false,
                silentLog: true
            });

            if (result.changed) {
                if (result.action === "ADDED") addedCount++;
                if (result.action === "REMOVED") removedCount++;
                // Pausa entre alterações de cargo para respeitar os rate limits da API do Discord
                await sleep(1200);
            }
        }

        logInfo(
            `Sincronização inicial concluída! Membros verificados: ${checkedCount} | Cargos adicionados: ${addedCount} | Cargos removidos: ${removedCount}`
        );
    } catch (err) {
        logError("Erro durante a sincronização inicial de cargos por tag:", err);
    } finally {
        initialSyncRunning = false;
    }
}

/**
 * Handler de pacotes brutos do Gateway (RAW):
 * Garante captura em tempo real de alterações em `user.primary_guild` nos eventos
 * GUILD_MEMBER_UPDATE, GUILD_MEMBER_ADD e USER_UPDATE mesmo quando o cache de User
 * do discord.js é mutado in-place.
 */
async function onRawPacket(packet) {
    if (shuttingDown || !client || !packet || !packet.t || !packet.d) return;

    const tagCfg = getTagConfig();
    if (!tagCfg.enabled) return;

    try {
        if (
            packet.t === "GUILD_MEMBER_UPDATE" ||
            packet.t === "GUILD_MEMBER_ADD"
        ) {
            if (String(packet.d.guild_id) !== tagCfg.guildId) return;

            const rawUser = packet.d.user;
            if (!rawUser || rawUser.bot) return;

            // Atualiza o cache interno de User do discord.js com os dados mais recentes (incluindo primary_guild)
            if (typeof client.users?._add === "function") {
                try {
                    client.users._add(rawUser, true);
                } catch {}
            }

            const guild = client.guilds.cache.get(tagCfg.guildId);
            if (!guild) return;

            let member = guild.members.cache.get(rawUser.id);
            if (!member) {
                member = await guild.members.fetch(rawUser.id).catch(() => null);
            }
            if (!member) return;

            await reconcileMemberTagRole(member, rawUser, { allowFetch: true });
            return;
        }

        if (packet.t === "USER_UPDATE") {
            const rawUser = packet.d;
            if (!rawUser || !rawUser.id || rawUser.bot) return;

            const guild = client.guilds.cache.get(tagCfg.guildId);
            if (!guild) return;

            const member =
                guild.members.cache.get(rawUser.id) ||
                (await guild.members.fetch(rawUser.id).catch(() => null));

            if (!member) return;

            await reconcileMemberTagRole(member, rawUser, { allowFetch: true });
        }
    } catch (err) {
        logError(`Erro ao processar evento Gateway (${packet.t}):`, err);
    }
}

/**
 * Listener complementar para entrada de novos membros no servidor.
 */
async function onGuildMemberAdd(member) {
    if (shuttingDown) return;
    await reconcileMemberTagRole(member, null, { allowFetch: true });
}

/**
 * Listener complementar para atualização de membro no servidor.
 */
async function onGuildMemberUpdate(_oldMember, newMember) {
    if (shuttingDown) return;
    await reconcileMemberTagRole(newMember, null, { allowFetch: false });
}

/**
 * Listener complementar para atualização de perfil de usuário.
 */
async function onUserUpdate(_oldUser, newUser) {
    if (shuttingDown || !client || !newUser || newUser.bot) return;

    const tagCfg = getTagConfig();
    if (!tagCfg.enabled) return;

    const guild = client.guilds.cache.get(tagCfg.guildId);
    if (!guild) return;

    const member = guild.members.cache.get(newUser.id);
    if (!member) return;

    await reconcileMemberTagRole(member, null, { allowFetch: false });
}

/**
 * Inicializa o gerenciador automático de cargos por tag do servidor.
 * Reutiliza a instância existente do Client Discord sem duplicar listeners.
 *
 * @param {import('discord.js').Client} discordClient
 */
function startTagRoleManager(discordClient) {
    client = discordClient;
    shuttingDown = false;

    if (!listenersAttached) {
        listenersAttached = true;
        client.on("raw", onRawPacket);
        client.on("guildMemberAdd", onGuildMemberAdd);
        client.on("guildMemberUpdate", onGuildMemberUpdate);
        client.on("userUpdate", onUserUpdate);
        logInfo("Listeners de monitoramento de tag do servidor registrados.");
    }

    // Executa a sincronização inicial em background sem bloquear a inicialização do bot
    syncAllMembersOnStartup().catch(err => {
        logError("Falha ao iniciar sincronização de cargos por tag:", err);
    });
}

/**
 * Encerra o gerenciador com segurança durante o desligamento do bot.
 */
function stopTagRoleManager() {
    shuttingDown = true;
    if (client && listenersAttached) {
        client.off("raw", onRawPacket);
        client.off("guildMemberAdd", onGuildMemberAdd);
        client.off("guildMemberUpdate", onGuildMemberUpdate);
        client.off("userUpdate", onUserUpdate);
        listenersAttached = false;
    }
    processingUsers.clear();
    lastProcessedState.clear();
}

module.exports = {
    startTagRoleManager,
    stopTagRoleManager,
    reconcileMemberTagRole,
    evaluateUserServerTag,
    syncAllMembersOnStartup
};
