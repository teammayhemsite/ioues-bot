const {
    ChannelType,
    Events,
    OverwriteType,
    PermissionFlagsBits,
    PermissionsBitField,
    AttachmentBuilder,
    EmbedBuilder
} = require("discord.js");

const config = require("../config");
const { sendDiscordLog } = require("../logger");
const { EPHEMERAL, safeReply } = require("../utils/interactions");
const { TicketStore } = require("./store");
const { generateTranscript } = require("./transcript");
const ui = require("./ui");

const cfg = config.tickets;
const store = new TicketStore(cfg.dataFile || undefined);

let client = null;
let listenerAttached = false;

// Travas em memória contra cliques duplos/condições de corrida (não precisam sobreviver a reinícios)
const creationLocks = new Set();
const closingChannels = new Set();
const openCooldowns = new Map();

// Metadados gravados no tópico do canal: permitem reconstruir os tickets mesmo se o arquivo de dados se perder
const TOPIC_REGEX = /ref:ticket:([a-z]+):(\d{17,20}):(\d+)/;
const NAME_REGEX = /^ticket-(\d+)-/;

const P = PermissionFlagsBits;
const REQUIRED_BOT_PERMS = [P.ViewChannel, P.ManageChannels, P.SendMessages, P.EmbedLinks, P.ReadMessageHistory];
const STAFF_DETECTION_PERMS = [P.Administrator, P.ManageGuild, P.ManageMessages, P.ModerateMembers];

// ==========================================
// HELPERS
// ==========================================

function log(msg) { console.log(`🎫 [Tickets] ${msg}`); }
function warn(msg) { console.warn(`⚠️ [Tickets] ${msg}`); }
function error(msg, err) { console.error(`❌ [Tickets] ${msg}`, err?.message || err || ""); }

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function getType(id) {
    return cfg.types.find(t => t.id === id) || null;
}

function normalize(text) {
    return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

function slugify(name) {
    const slug = normalize(name).replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70);
    return slug || "usuario";
}

function permNames(perms) {
    return new PermissionsBitField(perms).toArray().join(", ");
}

function buildTopic(ticket, type) {
    const meta = `ref:ticket:${type.id}:${ticket.ownerId}:${ticket.number}`;
    const prefix = `🎫 Ticket #${ticket.number} • ${type.label} • Aberto por ${ticket.ownerTag} (${ticket.ownerId}) • `;
    return `${prefix.slice(0, 1024 - meta.length)}${meta}`;
}

function parseTopic(topic) {
    const match = TOPIC_REGEX.exec(topic || "");
    if (!match) return null;
    return { type: match[1], ownerId: match[2], number: Number(match[3]) };
}

/**
 * Localiza a categoria de um tipo de ticket.
 * Usa o ID configurado; se não houver ID (ex.: Parcerias pendente), tenta detectar pelo nome.
 */
function resolveCategory(guild, type) {
    const isCategory = c => c?.type === ChannelType.GuildCategory;

    if (type.categoryId) {
        const channel = guild.channels.cache.get(type.categoryId);
        return isCategory(channel) ? channel : null;
    }

    const hints = (type.categoryNameHints || []).map(normalize);
    if (hints.length === 0) return null;

    const candidates = guild.channels.cache.filter(c => isCategory(c) && hints.some(h => normalize(c.name).includes(h)));
    // Prefere categorias claramente de atendimento (ex.: "🎫 Tickets Parcerias")
    return candidates.find(c => /ticket|atendimento/.test(normalize(c.name))) || candidates.first() || null;
}

/**
 * Cargos da equipe com acesso aos tickets.
 * Usa TICKET_STAFF_ROLE_IDS; se vazio, detecta cargos com permissões de moderação.
 */
function getStaffRoleIds(guild) {
    const configured = cfg.staffRoleIds.filter(id => guild.roles.cache.has(id));
    if (configured.length > 0) return configured;

    return guild.roles.cache
        .filter(role =>
            !role.managed &&
            role.id !== guild.id &&
            STAFF_DETECTION_PERMS.some(perm => role.permissions.has(perm))
        )
        .sort((a, b) => b.position - a.position)
        .first(15)
        .map(role => role.id);
}

function isStaff(member) {
    if (!member?.guild) return false;
    if (member.permissions.has(P.Administrator) || member.permissions.has(P.ManageChannels)) return true;
    const staffRoles = getStaffRoleIds(member.guild);
    return member.roles.cache.some(role => staffRoles.includes(role.id));
}

async function resolveMember(interaction) {
    if (interaction.member?.roles?.cache) return interaction.member;
    return interaction.guild?.members.fetch(interaction.user.id).catch(() => null) ?? null;
}

/**
 * Retorna o registro do ticket de um canal (store ou, como fallback, metadados do tópico).
 */
function getTicketForChannel(channel) {
    if (!channel) return null;

    const stored = store.get(channel.id);
    // Durante o fechamento o registro já está "closed": não reabrir pelo tópico
    if (closingChannels.has(channel.id)) return stored;
    if (stored && stored.status === "open") return stored;

    const meta = parseTopic(channel.topic);
    if (!meta) return null;

    const type = getType(meta.type);
    store.bumpCounter(meta.number);
    return store.upsert({
        channelId: channel.id,
        guildId: channel.guild?.id,
        number: meta.number,
        type: meta.type,
        typeLabel: type?.label || meta.type,
        ownerId: meta.ownerId,
        ownerTag: stored?.ownerTag || client?.users.cache.get(meta.ownerId)?.tag || meta.ownerId,
        status: "open",
        createdAt: stored?.createdAt || channel.createdAt?.toISOString() || new Date().toISOString(),
        claimedBy: stored?.claimedBy || null
    });
}

async function findExistingTicketChannel(guild, ownerId, typeId) {
    const stored = store.findOpen(ownerId, typeId);
    if (stored) {
        const channel = guild.channels.cache.get(stored.channelId);
        if (channel) return channel;
        store.markClosed(stored.channelId, { reason: "Canal não encontrado" });
    }

    // Fallback: procura pelos metadados no tópico (cobre perda do arquivo de dados)
    const found = guild.channels.cache.find(c => {
        if (c.type !== ChannelType.GuildText) return false;
        const meta = parseTopic(c.topic);
        return meta && meta.ownerId === ownerId && meta.type === typeId;
    });
    if (found) getTicketForChannel(found);
    return found || null;
}

function buildOverwrites(guild, category, botMember, ownerId, staffRoleIds) {
    const botPerms = category.permissionsFor(botMember);
    const optional = perm => (botPerms?.has(perm) ? [perm] : []);

    const ownerAllow = [P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.EmbedLinks, ...optional(P.AttachFiles)];
    const staffAllow = [...ownerAllow, ...optional(P.ManageMessages)];
    const botAllow = [
        P.ViewChannel, P.SendMessages, P.ReadMessageHistory, P.EmbedLinks, P.ManageChannels,
        ...optional(P.AttachFiles), ...optional(P.ManageMessages)
    ];

    return [
        { id: guild.roles.everyone.id, type: OverwriteType.Role, deny: [P.ViewChannel] },
        { id: botMember.id, type: OverwriteType.Member, allow: botAllow },
        { id: ownerId, type: OverwriteType.Member, allow: ownerAllow },
        ...staffRoleIds.map(id => ({ id, type: OverwriteType.Role, allow: staffAllow }))
    ];
}

function logTicketEvent(payload) {
    return sendDiscordLog(client, { channelId: cfg.logChannelId, footer: "Aevix • Sistema de Tickets", ...payload });
}

// ==========================================
// ABERTURA
// ==========================================

/**
 * Cria um ticket para o usuário. Retorna { channel, ticket } | { existing } | { error }.
 */
async function openTicket(guild, user, type) {
    const existing = await findExistingTicketChannel(guild, user.id, type.id);
    if (existing) return { existing };

    const category = resolveCategory(guild, type);
    if (!category) {
        warn(`Categoria indisponível para "${type.label}" (ID configurado: ${type.categoryId || "nenhum"}).`);
        return {
            error: type.categoryId
                ? `❌ A categoria de **${type.label}** não foi encontrada. Avise a equipe do servidor.`
                : `❌ O atendimento de **${type.label}** ainda não está disponível. Tente novamente mais tarde.`
        };
    }

    const botMember = guild.members.me || await guild.members.fetchMe().catch(() => null);
    if (!botMember) return { error: "❌ Não consegui verificar minhas permissões neste servidor." };

    const botPerms = category.permissionsFor(botMember);
    const missing = REQUIRED_BOT_PERMS.filter(perm => !botPerms?.has(perm));
    if (missing.length > 0) {
        error(`Permissões ausentes na categoria "${category.name}": ${permNames(missing)}`);
        return { error: "❌ Não tenho permissão para criar tickets nessa categoria. Avise a equipe do servidor." };
    }

    if (category.children.cache.size >= 50) {
        return { error: `❌ A categoria de **${type.label}** está cheia no momento. Tente novamente mais tarde.` };
    }

    const staffRoleIds = getStaffRoleIds(guild);
    const number = store.nextNumber();
    const ticket = {
        channelId: null,
        guildId: guild.id,
        number,
        type: type.id,
        typeLabel: type.label,
        ownerId: user.id,
        ownerTag: user.tag || user.username,
        status: "open",
        createdAt: new Date().toISOString(),
        claimedBy: null
    };

    const channel = await guild.channels.create({
        name: `ticket-${number}-${slugify(user.username)}`,
        type: ChannelType.GuildText,
        parent: category.id,
        topic: buildTopic(ticket, type),
        permissionOverwrites: buildOverwrites(guild, category, botMember, user.id, staffRoleIds),
        reason: `Ticket #${number} (${type.label}) aberto por ${ticket.ownerTag}`
    });

    ticket.channelId = channel.id;
    store.upsert(ticket);

    const pingRoles = cfg.pingStaff ? staffRoleIds : [];
    const welcome = await channel.send({
        content: [`<@${user.id}>`, ...pingRoles.map(id => `<@&${id}>`)].join(" "),
        ...ui.buildTicketWelcome(ticket, type, guild),
        allowedMentions: { users: [user.id], roles: pingRoles }
    }).catch(err => {
        error(`Falha ao enviar a mensagem inicial do ticket #${number}:`, err);
        return null;
    });

    if (welcome) store.update(channel.id, { welcomeMessageId: welcome.id });

    log(`Ticket #${number} (${type.label}) criado para ${ticket.ownerTag} → #${channel.name}`);

    logTicketEvent({
        title: `📩 Ticket #${number} aberto`,
        action: "Ticket Aberto",
        user: `${ticket.ownerTag} (${user.id})`,
        status: "SUCCESS",
        fields: [
            { name: "📂 Categoria", value: `${type.emoji} ${type.label}`, inline: true },
            { name: "💬 Canal", value: `<#${channel.id}>`, inline: true }
        ]
    }).catch(() => {});

    return { channel, ticket };
}

function resetPanelSelection(message) {
    // Reeditar o painel limpa a seleção do menu, permitindo escolher a mesma opção novamente depois
    if (!message || message.author?.id !== client?.user?.id) return;
    message.edit(ui.buildPanel(message.guild, cfg.types)).catch(() => {});
}

async function handleOpenSelect(interaction) {
    const type = getType(interaction.values?.[0]);
    if (!type) {
        return safeReply(interaction, "❌ Opção de atendimento inválida.");
    }

    const userId = interaction.user.id;
    const cooldownMs = cfg.openCooldownSeconds * 1000;
    const last = openCooldowns.get(userId) || 0;
    const remaining = last + cooldownMs - Date.now();
    if (remaining > 0) {
        resetPanelSelection(interaction.message);
        return safeReply(interaction, `⏳ Aguarde **${Math.ceil(remaining / 1000)}s** antes de abrir outro ticket.`);
    }

    const lockKey = `${userId}:${type.id}`;
    if (creationLocks.has(lockKey)) {
        return safeReply(interaction, "⏳ Seu ticket já está sendo criado, aguarde um instante...");
    }

    creationLocks.add(lockKey);
    try {
        await interaction.deferReply({ flags: EPHEMERAL });
        resetPanelSelection(interaction.message);

        const result = await openTicket(interaction.guild, interaction.user, type);

        if (result.existing) {
            return safeReply(interaction, {
                content: `⚠️ Você já possui um ticket de **${type.emoji} ${type.label}** aberto: <#${result.existing.id}>`,
                components: [ui.buildGoToTicketRow(result.existing)]
            });
        }

        if (result.error) {
            return safeReply(interaction, { content: result.error });
        }

        openCooldowns.set(userId, Date.now());
        if (openCooldowns.size > 1000) {
            const limit = Date.now() - cooldownMs;
            for (const [id, ts] of openCooldowns) if (ts < limit) openCooldowns.delete(id);
        }

        return safeReply(interaction, {
            content: `✅ Seu ticket de **${type.emoji} ${type.label}** foi criado: <#${result.channel.id}>`,
            components: [ui.buildGoToTicketRow(result.channel)]
        });
    } catch (err) {
        error(`Erro ao criar ticket (${type.id}) para ${interaction.user.tag}:`, err);
        const message = err?.code === 50013
            ? "❌ Não tenho permissão para criar o canal do ticket. Avise a equipe do servidor."
            : "❌ Ocorreu um erro ao criar seu ticket. Tente novamente em instantes.";
        return safeReply(interaction, { content: message });
    } finally {
        creationLocks.delete(lockKey);
    }
}

// ==========================================
// FECHAMENTO
// ==========================================

function canManageTicket(member, ticket) {
    return Boolean(member) && (member.id === ticket.ownerId || isStaff(member));
}

async function dmOwner(ticket, closer, reason, transcript) {
    const user = await client.users.fetch(ticket.ownerId).catch(() => null);
    if (!user) return;

    const guild = client.guilds.cache.get(ticket.guildId);
    const embed = new EmbedBuilder()
        .setColor(ui.COLORS.CLOSED)
        .setTitle("🔒 Seu ticket foi encerrado")
        .setDescription(`Seu atendimento${guild ? ` no servidor **${guild.name}**` : ""} foi finalizado. Obrigado pelo contato!`)
        .addFields(
            { name: "🔢 Ticket", value: `#${ticket.number}`, inline: true },
            { name: "📂 Categoria", value: ticket.typeLabel || ticket.type, inline: true },
            { name: "🔒 Fechado por", value: closer.tag || closer.username, inline: true },
            ...(reason ? [{ name: "📝 Motivo", value: reason.slice(0, 1024) }] : [])
        )
        .setTimestamp();

    const files = cfg.dmTranscript && transcript
        ? [new AttachmentBuilder(transcript.buffer, { name: transcript.fileName })]
        : [];

    await user.send({ embeds: [embed], files }).catch(() => {
        // 50007 = usuário com DMs fechadas: não é um erro do bot
    });
}

/**
 * Encerra um ticket: trava o canal, gera transcript, registra log, avisa o autor e exclui o canal.
 */
async function closeTicket(channel, closer, reason = null) {
    if (!channel) return { ok: false, error: "Canal inválido." };
    if (closingChannels.has(channel.id)) return { ok: false, error: "⏳ Este ticket já está sendo fechado." };

    const ticket = getTicketForChannel(channel);
    if (!ticket) return { ok: false, error: "❌ Este canal não é um ticket ativo." };

    closingChannels.add(channel.id);
    const startedAt = Date.now();
    const delayMs = cfg.closeDelaySeconds * 1000;

    try {
        await channel.send({ embeds: [ui.buildClosingEmbed(closer.id, reason, cfg.closeDelaySeconds)] }).catch(() => {});

        // Impede o autor de continuar enviando mensagens durante o encerramento
        await channel.permissionOverwrites
            .edit(ticket.ownerId, { SendMessages: false }, { type: OverwriteType.Member, reason: "Ticket em fechamento" })
            .catch(() => {});

        let transcript = null;
        try {
            transcript = await generateTranscript(channel, ticket);
        } catch (err) {
            error(`Falha ao gerar transcript do ticket #${ticket.number}:`, err);
        }

        store.markClosed(channel.id, { closedBy: closer.id, reason });

        const createdTs = Math.floor(new Date(ticket.createdAt).getTime() / 1000);
        await logTicketEvent({
            title: `🔒 Ticket #${ticket.number} fechado`,
            action: "Ticket Fechado",
            user: `${ticket.ownerTag} (${ticket.ownerId})`,
            status: "DANGER",
            fields: [
                { name: "📂 Categoria", value: ticket.typeLabel || ticket.type, inline: true },
                { name: "🔒 Fechado por", value: `<@${closer.id}>`, inline: true },
                { name: "🙋 Assumido por", value: ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Ninguém", inline: true },
                { name: "🕒 Aberto em", value: Number.isFinite(createdTs) ? `<t:${createdTs}:F>` : "—", inline: true },
                { name: "💬 Mensagens", value: transcript ? String(transcript.messageCount) : "—", inline: true },
                { name: "#️⃣ Canal", value: `#${channel.name}`, inline: true },
                { name: "👥 Participantes", value: transcript?.participants.join(", ") || "—" },
                { name: "📝 Motivo", value: reason || "Não informado" }
            ],
            files: transcript ? [new AttachmentBuilder(transcript.buffer, { name: transcript.fileName })] : []
        });

        await dmOwner(ticket, closer, reason, transcript);

        const remaining = delayMs - (Date.now() - startedAt);
        if (remaining > 0) await sleep(remaining);

        await channel.delete(`Ticket #${ticket.number} fechado por ${closer.tag || closer.id}`);
        log(`Ticket #${ticket.number} fechado por ${closer.tag || closer.id}.`);
        return { ok: true };
    } catch (err) {
        error(`Erro ao fechar o ticket #${ticket.number}:`, err);
        // Reverte para "aberto" para permitir nova tentativa
        store.update(channel.id, { status: "open", closedAt: null, closedBy: null, closeReason: null });
        await channel.permissionOverwrites
            .edit(ticket.ownerId, { SendMessages: true }, { type: OverwriteType.Member })
            .catch(() => {});
        await channel.send("❌ Não consegui excluir este canal. Verifique minha permissão **Gerenciar Canais** e tente novamente.").catch(() => {});
        return { ok: false, error: "❌ Ocorreu um erro ao fechar o ticket." };
    } finally {
        closingChannels.delete(channel.id);
    }
}

async function handleCloseButton(interaction) {
    const ticket = getTicketForChannel(interaction.channel);
    if (!ticket) return safeReply(interaction, "❌ Este canal não é um ticket ativo.");

    const member = await resolveMember(interaction);
    if (!canManageTicket(member, ticket)) {
        return safeReply(interaction, "❌ Apenas o autor do ticket ou a equipe pode fechá-lo.");
    }
    if (closingChannels.has(interaction.channelId)) {
        return safeReply(interaction, "⏳ Este ticket já está sendo fechado.");
    }

    return interaction.reply({ ...ui.buildCloseConfirm(), flags: EPHEMERAL });
}

async function handleCloseConfirm(interaction) {
    const ticket = getTicketForChannel(interaction.channel);
    if (!ticket) {
        return interaction.update({ content: "❌ Este canal não é mais um ticket ativo.", components: [] });
    }

    const member = await resolveMember(interaction);
    if (!canManageTicket(member, ticket)) {
        return interaction.update({ content: "❌ Você não tem permissão para fechar este ticket.", components: [] });
    }
    if (closingChannels.has(interaction.channelId)) {
        return interaction.update({ content: "⏳ Este ticket já está sendo fechado.", components: [] });
    }

    await interaction.update({ content: "🔒 Encerrando o ticket...", components: [] });
    const result = await closeTicket(interaction.channel, interaction.user, null);
    if (!result.ok && result.error) {
        await interaction.followUp({ content: result.error, flags: EPHEMERAL }).catch(() => {});
    }
}

async function handleCloseCancel(interaction) {
    return interaction.update({ content: "✅ Fechamento cancelado. O ticket continua aberto.", components: [] });
}

// ==========================================
// ASSUMIR / TRANSCRIPT
// ==========================================

async function handleClaim(interaction) {
    const ticket = getTicketForChannel(interaction.channel);
    if (!ticket) return safeReply(interaction, "❌ Este canal não é um ticket ativo.");

    if (closingChannels.has(interaction.channelId)) return safeReply(interaction, "⏳ Este ticket está sendo fechado.");

    const member = await resolveMember(interaction);
    if (!isStaff(member)) return safeReply(interaction, "❌ Apenas a equipe pode assumir tickets.");
    if (ticket.ownerId === interaction.user.id) return safeReply(interaction, "❌ Você não pode assumir o seu próprio ticket.");
    if (ticket.claimedBy) return safeReply(interaction, `ℹ️ Este ticket já foi assumido por <@${ticket.claimedBy}>.`);

    const updated = store.update(ticket.channelId, { claimedBy: interaction.user.id, claimedAt: new Date().toISOString() });
    const type = getType(updated.type);

    await interaction.update(ui.buildTicketWelcome(updated, type, interaction.guild));
    await interaction.channel.send({
        content: `🙋 <@${interaction.user.id}> assumiu este atendimento e irá ajudá-lo, <@${ticket.ownerId}>!`,
        allowedMentions: { users: [ticket.ownerId] }
    }).catch(() => {});
}

async function handleTranscript(interaction) {
    const ticket = getTicketForChannel(interaction.channel);
    if (!ticket) return safeReply(interaction, "❌ Este canal não é um ticket ativo.");

    const member = await resolveMember(interaction);
    if (!canManageTicket(member, ticket)) {
        return safeReply(interaction, "❌ Apenas o autor do ticket ou a equipe pode gerar o transcript.");
    }

    await interaction.deferReply({ flags: EPHEMERAL });
    try {
        const transcript = await generateTranscript(interaction.channel, ticket);
        return safeReply(interaction, {
            content: `📄 Transcript do ticket **#${ticket.number}** (${transcript.messageCount} mensagens).`,
            files: [transcript.attachment]
        });
    } catch (err) {
        error("Falha ao gerar transcript sob demanda:", err);
        return safeReply(interaction, { content: "❌ Não consegui gerar o transcript agora." });
    }
}

// ==========================================
// ROTEADOR DE COMPONENTES (prefixo "ticket:")
// ==========================================

async function handleComponent(interaction) {
    if (!interaction.inGuild() || !interaction.guild) {
        return safeReply(interaction, "❌ Esta ação só pode ser usada dentro do servidor.");
    }

    switch (interaction.customId) {
        case ui.IDS.OPEN_SELECT:
            if (!interaction.isStringSelectMenu()) break;
            return handleOpenSelect(interaction);
        case ui.IDS.CLOSE:
            return handleCloseButton(interaction);
        case ui.IDS.CLOSE_CONFIRM:
            return handleCloseConfirm(interaction);
        case ui.IDS.CLOSE_CANCEL:
            return handleCloseCancel(interaction);
        case ui.IDS.CLAIM:
            return handleClaim(interaction);
        case ui.IDS.TRANSCRIPT:
            return handleTranscript(interaction);
        default:
            break;
    }

    return safeReply(interaction, "⚠️ Esta interação não está mais disponível.");
}

// ==========================================
// AÇÕES USADAS PELO COMANDO /ticket
// ==========================================

async function addUserToTicket(channel, user) {
    await channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true,
        EmbedLinks: true,
        AttachFiles: true
    }, { type: OverwriteType.Member, reason: "Usuário adicionado ao ticket" });
}

async function removeUserFromTicket(channel, user) {
    await channel.permissionOverwrites.delete(user.id, "Usuário removido do ticket");
}

// ==========================================
// PAINEL
// ==========================================

function panelIsUpToDate(message, payload) {
    try {
        const current = message.embeds[0];
        const expected = payload.embeds[0].toJSON();
        const currentOptions = message.components?.[0]?.components?.[0]?.options?.map(o => `${o.value}:${o.label}:${o.description}`) || [];
        const expectedOptions = payload.components[0].toJSON().components[0].options.map(o => `${o.value}:${o.label}:${o.description}`);
        return current?.title === expected.title &&
            current?.description === expected.description &&
            JSON.stringify(currentOptions) === JSON.stringify(expectedOptions);
    } catch {
        return false;
    }
}

/**
 * Garante que o painel exista (e esteja atualizado) no canal configurado.
 * @param {object} [options]
 * @param {boolean} [options.forceNew=false] Apaga o painel antigo e envia um novo
 */
async function ensurePanel({ forceNew = false } = {}) {
    const channel = await client.channels.fetch(cfg.panelChannelId).catch(() => null);
    if (!channel || !channel.isTextBased() || !channel.guild) {
        error(`Canal do painel (${cfg.panelChannelId}) não encontrado ou não é de texto.`);
        return { ok: false, error: `❌ Canal do painel (\`${cfg.panelChannelId}\`) não encontrado.` };
    }

    const botMember = channel.guild.members.me;
    const needed = [P.ViewChannel, P.SendMessages, P.EmbedLinks, P.ReadMessageHistory];
    const missing = needed.filter(perm => !channel.permissionsFor(botMember)?.has(perm));
    if (missing.length > 0) {
        error(`Permissões ausentes no canal do painel: ${permNames(missing)}`);
        return { ok: false, error: `❌ Preciso das permissões ${permNames(missing)} em <#${channel.id}>.` };
    }

    const payload = ui.buildPanel(channel.guild, cfg.types);
    const saved = store.getPanel();
    let message = null;

    if (saved.messageId && saved.channelId === channel.id) {
        message = await channel.messages.fetch(saved.messageId).catch(() => null);
    }
    if (!message) {
        const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null);
        message = recent?.find(m =>
            m.author.id === client.user.id &&
            m.components?.some(row => row.components?.some(c => c.customId === ui.IDS.OPEN_SELECT))
        ) || null;
    }

    if (message && forceNew) {
        await message.delete().catch(() => {});
        message = null;
    }

    let created = false;
    if (message) {
        if (!panelIsUpToDate(message, payload)) {
            await message.edit(payload);
            log("Painel de atendimento atualizado.");
        }
    } else {
        message = await channel.send(payload);
        created = true;
        log(`Painel de atendimento publicado em #${channel.name}.`);
    }

    store.setPanel(channel.id, message.id);
    return { ok: true, message, created, channel };
}

// ==========================================
// RECONSTRUÇÃO DO ESTADO (após reinício / deploy)
// ==========================================

async function recoverCounterFromLogs() {
    const channel = await client.channels.fetch(cfg.logChannelId).catch(() => null);
    if (!channel?.isTextBased()) return;

    let before;
    for (let page = 0; page < 3; page++) {
        const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
        if (!batch || batch.size === 0) break;

        for (const message of batch.values()) {
            if (message.author.id !== client.user.id) continue;
            for (const embed of message.embeds) {
                const match = /Ticket #(\d+)/.exec(embed.title || "");
                if (match) store.bumpCounter(Number(match[1]));
            }
        }

        before = batch.last().id;
        if (batch.size < 100) break;
    }
}

async function reconcile(guild) {
    let recovered = 0;
    let closed = 0;
    const liveTicketChannels = new Set();

    for (const channel of guild.channels.cache.values()) {
        if (channel.type !== ChannelType.GuildText) continue;

        const nameMatch = NAME_REGEX.exec(channel.name);
        if (nameMatch) store.bumpCounter(Number(nameMatch[1]));

        const meta = parseTopic(channel.topic);
        if (!meta) continue;

        liveTicketChannels.add(channel.id);
        const existing = store.get(channel.id);
        if (!existing || existing.status !== "open") {
            getTicketForChannel(channel);
            recovered++;
        }
    }

    for (const ticket of store.listOpen()) {
        if (ticket.guildId === guild.id && !liveTicketChannels.has(ticket.channelId)) {
            store.markClosed(ticket.channelId, { reason: "Canal não encontrado ao reiniciar" });
            closed++;
        }
    }

    await recoverCounterFromLogs().catch(err => warn(`Não foi possível ler os logs de tickets: ${err.message}`));
    store.save();

    log(`Estado sincronizado: ${store.listOpen().length} ticket(s) aberto(s), ${recovered} recuperado(s), ${closed} encerrado(s). Próximo número: #${store.counter + 1}`);
}

function onChannelDelete(channel) {
    const ticket = store.get(channel.id);
    if (!ticket || ticket.status !== "open" || closingChannels.has(channel.id)) return;

    store.markClosed(channel.id, { reason: "Canal excluído manualmente" });
    log(`Ticket #${ticket.number} excluído manualmente (#${channel.name}).`);

    logTicketEvent({
        title: `🗑️ Ticket #${ticket.number} excluído manualmente`,
        action: "Ticket Excluído",
        user: `${ticket.ownerTag} (${ticket.ownerId})`,
        status: "WARNING",
        details: "O canal do ticket foi excluído diretamente, sem usar o botão de fechamento (sem transcript)."
    }).catch(() => {});
}

// ==========================================
// INICIALIZAÇÃO
// ==========================================

async function startTickets(discordClient) {
    client = discordClient;

    if (!cfg.enabled) {
        log("Sistema de tickets desativado (TICKETS_ENABLED=false).");
        return;
    }

    if (!listenerAttached) {
        client.on(Events.ChannelDelete, onChannelDelete);
        listenerAttached = true;
    }

    const panelChannel = await client.channels.fetch(cfg.panelChannelId).catch(() => null);
    const guild = panelChannel?.guild || (config.guildId ? client.guilds.cache.get(config.guildId) : null);

    if (!guild) {
        error(`Não foi possível identificar o servidor dos tickets (canal do painel ${cfg.panelChannelId} inacessível).`);
        return;
    }

    for (const type of cfg.types) {
        const category = resolveCategory(guild, type);
        if (category) {
            const detected = type.categoryId ? "" : " (detectada automaticamente pelo nome)";
            log(`${type.emoji} ${type.label} → categoria "${category.name}" (${category.id})${detected}`);
        } else if (type.categoryId) {
            warn(`${type.label}: categoria ${type.categoryId} não encontrada no servidor "${guild.name}".`);
        } else {
            warn(`${type.label}: nenhuma categoria configurada/encontrada. Defina TICKET_CATEGORY_${type.id.toUpperCase()}.`);
        }
    }

    const staffRoles = getStaffRoleIds(guild);
    const staffSource = cfg.staffRoleIds.length ? "configurados" : "detectados automaticamente";
    log(`Cargos da equipe (${staffSource}): ${staffRoles.map(id => guild.roles.cache.get(id)?.name || id).join(", ") || "nenhum (somente administradores)"}`);

    await reconcile(guild).catch(err => error("Erro ao sincronizar tickets:", err));

    const panel = await ensurePanel().catch(err => {
        error("Erro ao publicar o painel de atendimento:", err);
        return null;
    });
    if (panel?.ok && !panel.created) log("Painel de atendimento verificado.");
}

module.exports = {
    startTickets,
    handleComponent,
    ensurePanel,
    closeTicket,
    getTicketForChannel,
    canManageTicket,
    isStaff,
    resolveMember,
    addUserToTicket,
    removeUserFromTicket,
    PREFIX: "ticket:",
    // expostos para testes
    _internal: { slugify, parseTopic, buildTopic, resolveCategory, getStaffRoleIds, buildOverwrites, store, openTicket, reconcile }
};
