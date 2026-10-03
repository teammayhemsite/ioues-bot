const {
    joinVoiceChannel,
    getVoiceConnection,
    entersState,
    VoiceConnectionStatus
} = require("@discordjs/voice");
const { ChannelType, PermissionFlagsBits } = require("discord.js");
const config = require("./config");

let client = null;
let retryTimer = null;
let connecting = false;
let attempts = 0;
let shuttingDown = false;

function log(msg) { console.log(msg); }

function nextDelay() {
    const d = Math.min(
        config.reconnectMinMs * 2 ** Math.min(attempts, 4),
        config.reconnectMaxMs
    );
    attempts++;
    return d;
}

function scheduleRetry(reason) {
    if (shuttingDown || retryTimer) return;
    const delay = nextDelay();
    if (reason) log(`⚠️ ${reason}`);
    log(`Tentando novamente em ${Math.round(delay / 1000)} segundos.`);
    retryTimer = setTimeout(() => {
        retryTimer = null;
        connectToVoice();
    }, delay);
}

async function resolveChannel() {
    if (!config.guildId || !config.voiceChannelId) {
        throw new Error(
            "GUILD_ID e/ou VOICE_CHANNEL_ID não configurados. Defina nas variáveis de ambiente."
        );
    }

    const guild = await client.guilds.fetch(config.guildId).catch(() => null);
    if (!guild) {
        throw new Error(
            "Servidor não encontrado. Verifique o GUILD_ID e se o bot foi convidado para o servidor."
        );
    }
    log(`Servidor encontrado: ${guild.name}`);

    const channel = await guild.channels.fetch(config.voiceChannelId).catch(() => null);
    if (!channel) {
        throw new Error(
            "Canal de voz não encontrado. O VOICE_CHANNEL_ID precisa ser corrigido."
        );
    }
    if (
        channel.type !== ChannelType.GuildVoice &&
        channel.type !== ChannelType.GuildStageVoice
    ) {
        throw new Error("O VOICE_CHANNEL_ID não é um canal de voz. Corrija o ID.");
    }
    log(`Canal de voz encontrado: ${channel.name}`);

    const me = guild.members.me || (await guild.members.fetchMe());
    const perms = channel.permissionsFor(me);
    if (
        !perms ||
        !perms.has([PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect])
    ) {
        throw new Error(
            "Não foi possível entrar no canal de voz. Verifique as permissões do bot (Ver Canal e Conectar)."
        );
    }

    return { guild, channel };
}

function attachHandlers(connection, guildId) {
    connection.on(VoiceConnectionStatus.Disconnected, async () => {
        if (shuttingDown) return;
        try {
            // Pode ser só uma troca de canal/reconexão interna: dá uns segundos.
            await Promise.race([
                entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                entersState(connection, VoiceConnectionStatus.Connecting, 5000)
            ]);
        } catch {
            log("Desconectado do canal de voz.");
            if (connection.state.status !== VoiceConnectionStatus.Destroyed) {
                connection.destroy();
            }
            scheduleRetry();
        }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
        if (!shuttingDown) scheduleRetry();
    });

    connection.on("error", err => {
        console.error("❌ Erro na conexão de voz:", err.message);
    });
}

async function connectToVoice() {
    if (shuttingDown || connecting) return;
    connecting = true;

    try {
        const { guild, channel } = await resolveChannel();

        const existing = getVoiceConnection(guild.id);
        if (
            existing &&
            existing.joinConfig.channelId === channel.id &&
            existing.state.status === VoiceConnectionStatus.Ready
        ) {
            attempts = 0;
            return;
        }
        if (existing) existing.destroy();

        log("Conectando ao canal de voz...");
        const connection = joinVoiceChannel({
            channelId: channel.id,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: true,
            selfMute: false
        });
        attachHandlers(connection, guild.id);

        await entersState(connection, VoiceConnectionStatus.Ready, 30000);
        attempts = 0;
        log("Bot conectado ao canal de voz.");
    } catch (err) {
        console.error(`❌ Erro ao conectar ao canal de voz: ${err.message}`);
        const c = config.guildId && getVoiceConnection(config.guildId);
        if (c && c.state.status !== VoiceConnectionStatus.Destroyed) {
            // destroy() dispara scheduleRetry via evento; evita duplicar
            c.destroy();
        } else {
            scheduleRetry();
        }
    } finally {
        connecting = false;
    }
}

// Se o bot for movido/desconectado manualmente, volta ao canal configurado.
function onVoiceStateUpdate(oldState, newState) {
    if (shuttingDown || !client || newState.id !== client.user.id) return;
    if (newState.guild.id !== config.guildId) return;
    if (newState.channelId === config.voiceChannelId) return;
    if (retryTimer || connecting) return; // já há uma rotina ativa

    log("Bot foi movido/removido do canal de voz configurado. Voltando...");
    // Pequeno atraso evita ping-pong com eventos do Discord.
    scheduleRetry();
}

function startVoice(discordClient) {
    client = discordClient;
    client.on("voiceStateUpdate", onVoiceStateUpdate);
    return connectToVoice();
}

function stopVoice() {
    shuttingDown = true;
    if (retryTimer) clearTimeout(retryTimer);
    for (const guild of client?.guilds.cache.values() ?? []) {
        const c = getVoiceConnection(guild.id);
        if (c) c.destroy();
    }
}

module.exports = { startVoice, stopVoice };
