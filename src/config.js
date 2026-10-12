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
    reconnectMaxMs: 60000
};
