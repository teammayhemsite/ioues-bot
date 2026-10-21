try {
    require("dotenv").config();
} catch (e) {
    // dotenv opcional em ambientes onde as variáveis já vêm injetadas no process.env (como Render)
}

// Toda configuração do bot fica aqui (lida de variáveis de ambiente).
module.exports = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
    voiceChannelId: process.env.VOICE_CHANNEL_ID,
    logChannelId: process.env.LOG_CHANNEL_ID || "1558873432769298522",
    logApiSecret: process.env.AEVIX_LOG_SECRET,
    port: Number(process.env.PORT) || 3000,
    // Intervalos de reconexão de voz (ms)
    reconnectMinMs: 5000,
    reconnectMaxMs: 60000,

    // ==========================================
    // SISTEMA AUTOMÁTICO DE CARGO POR TAG DO SERVIDOR (PRIMARY GUILD)
    // ==========================================
    // ID do servidor onde o cargo será gerenciado (reutiliza GUILD_ID ou permite definir TAG_GUILD_ID separado)
    tagGuildId: process.env.TAG_GUILD_ID || process.env.GUILD_ID || "",
    // Identificador da tag monitorada:
    // Na API oficial do Discord (user.primary_guild), a tag é identificada pelo ID do servidor dono da tag (identity_guild_id).
    // Se deixado em branco, o bot usará automaticamente o próprio ID do servidor (GUILD_ID).
    // Você também pode preencher com o ID do servidor da tag (Snowflake) ou com o texto da tag (ex: "AEVX") caso queira filtrar pela sigla.
    serverTagId: process.env.SERVER_TAG_ID || "",
    // ID do cargo que será adicionado quando o membro ativar a tag e removido quando desativar
    tagRoleId: process.env.TAG_ROLE_ID || "1555852510139383919",
    // ID do canal exclusivo para logs de adição/remoção de cargo da tag
    tagLogChannelId: process.env.TAG_LOG_CHANNEL_ID || "1559996459603075212"
};
