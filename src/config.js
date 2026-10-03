require("dotenv").config();

// Toda configuração do bot fica aqui (lida de variáveis de ambiente).
module.exports = {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    guildId: process.env.GUILD_ID,
    voiceChannelId: process.env.VOICE_CHANNEL_ID,
    port: Number(process.env.PORT) || 3000,
    // Intervalos de reconexão de voz (ms)
    reconnectMinMs: 5000,
    reconnectMaxMs: 60000
};
