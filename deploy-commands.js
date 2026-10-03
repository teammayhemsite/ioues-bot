const config = require("./src/config");

const {
    REST,
    Routes
} = require("discord.js");

const fs = require("fs");
const path = require("path");

// ==========================================
// CONFIGURAÇÕES
// ==========================================

const token = config.token;
const clientId = config.clientId;
const guildId = config.guildId;

// ==========================================
// VALIDAÇÃO
// ==========================================

if (!token) {

    console.error("");
    console.error("❌ DISCORD_TOKEN não encontrado!");
    console.error("Verifique o arquivo .env");
    console.error("");

    process.exit(1);
}

if (!clientId) {

    console.error("");
    console.error("❌ CLIENT_ID não encontrado!");
    console.error("Verifique o arquivo .env");
    console.error("");

    process.exit(1);
}

if (!guildId) {

    console.error("");
    console.error("❌ GUILD_ID não encontrado!");
    console.error("Verifique o arquivo .env");
    console.error("");

    process.exit(1);
}

// ==========================================
// COLETA DE COMANDOS
// ==========================================

const commands = [];

const commandsPath = path.join(
    __dirname,
    "commands"
);

function loadCommands(directory) {

    if (!fs.existsSync(directory)) {

        console.error(
            `❌ Pasta não encontrada: ${directory}`
        );

        return;
    }

    const files = fs.readdirSync(directory);

    for (const file of files) {

        const fullPath = path.join(
            directory,
            file
        );

        const stat = fs.statSync(fullPath);

        // Se for pasta, entrar nela
        if (stat.isDirectory()) {

            loadCommands(fullPath);

            continue;
        }

        // Ignorar arquivos que não sejam JS
        if (!file.endsWith(".js")) {
            continue;
        }

        try {

            const command = require(fullPath);

            if (
                command.data &&
                typeof command.execute === "function"
            ) {

                commands.push(
                    command.data.toJSON()
                );

            } else {

                console.log(
                    `⚠️ Arquivo ignorado: ${file}`
                );

            }

        } catch (error) {

            console.error(
                `❌ Erro ao carregar ${file}:`
            );

            console.error(error);

        }
    }
}

// ==========================================
// CARREGAR COMANDOS
// ==========================================

loadCommands(commandsPath);

// ==========================================
// DISCORD REST
// ==========================================

const rest = new REST({
    version: "10"
}).setToken(token);

// ==========================================
// REGISTRAR COMANDOS
// ==========================================

(async () => {

    try {

        console.log("");
        console.log(
            `Registrando ${commands.length} comandos...`
        );

        await rest.put(

            Routes.applicationGuildCommands(
                clientId,
                guildId
            ),

            {
                body: commands
            }

        );

        console.log(
            "✅ Comandos registrados com sucesso!"
        );

        console.log(
            `📦 Total: ${commands.length}`
        );

    } catch (error) {

        console.error("");
        console.error(
            "❌ Erro ao registrar os comandos:"
        );

        console.error(error);

    }

})();