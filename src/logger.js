const config = require("./config");
let EmbedBuilder;
try {
    EmbedBuilder = require("discord.js").EmbedBuilder;
} catch (e) {
    // EmbedBuilder será carregado quando discord.js estiver instalado
}

// Cores seguindo a identidade visual dos logs de referência
const LOG_COLORS = {
    SUCCESS: 0x38D39F, // Verde
    WARNING: 0xE8B65A, // Amarelo/Dourado
    DANGER: 0xEF4444,  // Vermelho
    INFO: 0x5865F2,    // Azul Discord
    NEUTRAL: 0x2B2D31  // Escuro
};

/**
 * Envia um embed padronizado de log para o canal do Discord especificado
 * @param {import('discord.js').Client} client 
 * @param {object} logData
 */
async function sendDiscordLog(client, logData) {
    if (!client || !client.isReady()) {
        console.warn("⚠️ [Aevix Logger] Discord client ainda não está pronto para enviar log.");
        return false;
    }

    const channelId = config.logChannelId;
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
            footer = "Aevix Security & Management"
        } = logData;

        const color = LOG_COLORS[status] || LOG_COLORS.INFO;

        // Construção do Embed estruturado idêntico às referências do Discord
        const embed = new EmbedBuilder()
            .setColor(color)
            .setTimestamp(new Date());

        if (title) {
            embed.setTitle(title);
        }

        // Autor / Cabeçalho com ícone e nome do sistema/usuário
        embed.setAuthor({
            name: `Aevix Keys • ${action || "Registro de Atividade"}`,
            iconURL: client.user.displayAvatarURL()
        });

        // Adiciona campos organizados
        if (user) {
            embed.addFields({ name: "👤 Usuário", value: `\`${user}\``, inline: true });
        }
        if (admin) {
            embed.addFields({ name: "🛡️ Administrador", value: `\`${admin}\``, inline: true });
        }
        if (action) {
            embed.addFields({ name: "⚡ Ação", value: `${action}`, inline: true });
        }

        if (details) {
            embed.addFields({ name: "📋 Detalhes", value: `${details}`, inline: false });
        }

        // Campos adicionais customizados
        if (Array.isArray(fields) && fields.length > 0) {
            embed.addFields(fields);
        }

        embed.setFooter({
            text: `${footer} • ID do Evento: ${Math.floor(Date.now() / 1000)}`,
            iconURL: client.user.displayAvatarURL()
        });

        await channel.send({ embeds: [embed] });
        console.log(`✅ [Aevix Logger] Log enviado ao canal ${channelId}: ${action}`);
        return true;
    } catch (err) {
        console.error("❌ [Aevix Logger] Erro ao enviar log para o Discord:", err.message);
        return false;
    }
}

module.exports = {
    sendDiscordLog,
    LOG_COLORS
};
