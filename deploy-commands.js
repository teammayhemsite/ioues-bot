const { REST, Routes } = require("discord.js");
const config = require("./src/config");
const { loadCommands, toPayload } = require("./src/commandLoader");

const token = config.token;
const clientId = config.clientId;
const guildId = config.guildId;

if (!token) {
    console.error("\n❌ DISCORD_TOKEN não encontrado! Verifique o arquivo .env ou as variáveis do Render.\n");
    process.exit(1);
}

if (!clientId) {
    console.error("\n❌ CLIENT_ID não encontrado! Verifique o arquivo .env ou as variáveis do Render.\n");
    process.exit(1);
}

const commandsMap = loadCommands({ verbose: true });
const commands = toPayload(commandsMap);

const rest = new REST({ version: "10" }).setToken(token);

(async () => {
    try {
        console.log(`\n⏳ Registrando ${commands.length} comando(s) no Discord...`);

        if (guildId) {
            await rest.put(
                Routes.applicationGuildCommands(clientId, guildId),
                { body: commands }
            );
            console.log(`✅ ${commands.length} comando(s) registrados com sucesso no servidor (${guildId})!`);
        } else {
            console.log("ℹ️ GUILD_ID não configurado. Registrando comandos globalmente...");
            await rest.put(
                Routes.applicationCommands(clientId),
                { body: commands }
            );
            console.log(`✅ ${commands.length} comando(s) registrados globalmente com sucesso!`);
        }
    } catch (error) {
        console.error("\n❌ Erro ao registrar comandos no Discord:", error);
        process.exit(1);
    }
})();
