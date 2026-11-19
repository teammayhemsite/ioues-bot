const { EmbedBuilder } = require("discord.js");
const config = require("./config");

// Cores seguindo a identidade visual dos logs de referência
const LOG_COLORS = {
    SUCCESS: 0x38D39F, // Verde
    WARNING: 0xE8B65A, // Amarelo/Dourado
    DANGER: 0xEF4444,  // Vermelho
    INFO: 0x5865F2,    // Azul Discord
    NEUTRAL: 0x2B2D31  // Escuro
};

// Limites oficiais de embeds do Discord
const LIMITS = {
    title: 256,
    author: 256,
    fieldName: 256,
    fieldValue: 1024,
    footer: 2048,
    maxFields: 25
};

function truncate(value, max) {
    const text = String(value ?? "");
    return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function sanitizeFields(fields) {
    if (!Array.isArray(fields)) return [];
    return fields
        .filter(f => f && f.name && f.value !== undefined && f.value !== null && String(f.value).trim() !== "")
        .map(f => ({
            name: truncate(f.name, LIMITS.fieldName),
            value: truncate(f.value, LIMITS.fieldValue),
            inline: Boolean(f.inline)
        }));
}

/**
 * Envia um embed padronizado de log para o canal do Discord especificado.
 * Nunca lança exceções: retorna true/false.
 *
 * @param {import('discord.js').Client} client
 * @param {object} logData
 * @param {string} [logData.channelId] Canal de destino (padrão: LOG_CHANNEL_ID)
 * @param {Array}  [logData.files] Anexos opcionais (ex: transcript)
 */
async function sendDiscordLog(client, logData = {}) {
    if (!client || !client.isReady()) {
        console.warn("⚠️ [Aevix Logger] Discord client ainda não está pronto para enviar log.");
        return false;
    }

    const channelId = logData?.channelId || config.logChannelId;
    if (!channelId) {
        console.warn("⚠️ [Aevix Logger] LOG_CHANNEL_ID não configurado.");
        return false;
    }

    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
            console.error(`❌ [Aevix Logger] Canal de logs não encontrado ou não é de texto: ${channelId}`);
            return false;
        }

        const {
            title,
            action,
            user,
            admin,
            details,
            status = "SUCCESS",
            fields = [],
            footer = "Aevix Security & Management",
            files = []
        } = logData;

        const color = LOG_COLORS[status] || LOG_COLORS.INFO;

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTimestamp(new Date());

        if (title) {
            embed.setTitle(truncate(title, LIMITS.title));
        }

        embed.setAuthor({
            name: truncate(`Aevix Keys • ${action || "Registro de Atividade"}`, LIMITS.author),
            iconURL: client.user.displayAvatarURL()
        });

        const allFields = [];
        if (user) allFields.push({ name: "👤 Usuário", value: `\`${user}\``, inline: true });
        if (admin) allFields.push({ name: "🛡️ Administrador", value: `\`${admin}\``, inline: true });
        if (action) allFields.push({ name: "⚡ Ação", value: `${action}`, inline: true });
        if (details) allFields.push({ name: "📋 Detalhes", value: `${details}`, inline: false });
        allFields.push(...(Array.isArray(fields) ? fields : []));

        const safeFields = sanitizeFields(allFields).slice(0, LIMITS.maxFields);
        if (safeFields.length > 0) {
            embed.addFields(safeFields);
        }

        embed.setFooter({
            text: truncate(`${footer} • ID do Evento: ${Math.floor(Date.now() / 1000)}`, LIMITS.footer),
            iconURL: client.user.displayAvatarURL()
        });

        await channel.send({
            embeds: [embed],
            files: Array.isArray(files) ? files : [],
            // Logs nunca devem mencionar/pingar ninguém
            allowedMentions: { parse: [] }
        });
        console.log(`✅ [Aevix Logger] Log enviado ao canal ${channelId}: ${action || title || "sem título"}`);
        return true;
    } catch (err) {
        console.error("❌ [Aevix Logger] Erro ao enviar log para o Discord:", err.message);
        return false;
    }
}

module.exports = {
    sendDiscordLog,
    LOG_COLORS,
    truncate
};
