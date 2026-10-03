const config = require("./src/config");
const { startVoice, stopVoice } = require("./src/voice");

const {
    Client,
    GatewayIntentBits,
    Collection
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const http = require("http");

// ==========================================
// CONFIGURAÇÃO DO SERVIDOR HTTP
// Necessário para o Render Web Service
// ==========================================

const PORT = config.port;

const server = http.createServer((req, res) => {

    res.writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8"
    });

    res.end(req.url === "/health" ? "OK" : "Bot online");
});

server.listen(PORT, "0.0.0.0", () => {

    console.log(
        `🌐 Servidor HTTP iniciado na porta ${PORT}`
    );

});

// ==========================================
// CRIAÇÃO DO CLIENT DISCORD
// ==========================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates // necessário para voz
    ]
});

// ==========================================
// COLEÇÃO DE COMANDOS
// ==========================================

client.commands = new Collection();

// ==========================================
// CARREGAR COMANDOS AUTOMATICAMENTE
// ==========================================

const commandsPath = path.join(
    __dirname,
    "commands"
);

function loadCommands(directory) {

    if (!fs.existsSync(directory)) {

        console.error(
            `❌ Pasta de comandos não encontrada: ${directory}`
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

        // ==========================================
        // SE FOR UMA PASTA
        // ==========================================

        if (stat.isDirectory()) {

            loadCommands(fullPath);

            continue;
        }

        // ==========================================
        // IGNORAR ARQUIVOS QUE NÃO SÃO JS
        // ==========================================

        if (!file.endsWith(".js")) {
            continue;
        }

        try {

            const command = require(fullPath);

            // ==========================================
            // VERIFICAR SE É UM COMANDO VÁLIDO
            // ==========================================

            if (
                command.data &&
                typeof command.execute === "function"
            ) {

                client.commands.set(
                    command.data.name,
                    command
                );

                console.log(
                    `Comando carregado: ${command.data.name}`
                );

            } else {

                console.log(
                    `⚠️ Comando ignorado: ${file}`
                );

                console.log(
                    `   O arquivo precisa possuir "data" e "execute".`
                );
            }

        } catch (error) {

            console.error(
                `❌ Erro ao carregar o comando ${file}:`
            );

            console.error(error);
        }
    }
}

// ==========================================
// INICIAR CARREGAMENTO
// ==========================================

loadCommands(commandsPath);

// ==========================================
// BOT CONECTADO
// ==========================================

client.once("clientReady", () => {

    console.log("BOT ONLINE");
    console.log("Discord conectado.");
    console.log("");

    console.log("========================================");
    console.log("           BOT CONECTADO");
    console.log("========================================");

    console.log(
        `🤖 Bot: ${client.user.tag}`
    );

    console.log(
        `🆔 ID: ${client.user.id}`
    );

    console.log(
        `🏠 Servidores: ${client.guilds.cache.size}`
    );

    console.log(
        `⚡ Comandos: ${client.commands.size}`
    );

    console.log(
        `🌐 Porta HTTP: ${PORT}`
    );

    console.log("========================================");
    console.log("");

    // ==========================================
    // STATUS DO BOT
    // ==========================================

    client.user.setPresence({

        activities: [
            {
                name: "Gerenciando o servidor",
                type: 3
            }
        ],

        status: "online"

    });

    // Entra e permanece no canal de voz configurado
    startVoice(client);

});

// ==========================================
// INTERAÇÕES
// ==========================================

client.on(
    "interactionCreate",
    async interaction => {

        // ==========================================
        // SOMENTE COMANDOS SLASH
        // ==========================================

        if (!interaction.isChatInputCommand()) {
            return;
        }

        const command =
            client.commands.get(
                interaction.commandName
            );

        // ==========================================
        // COMANDO NÃO ENCONTRADO
        // ==========================================

        if (!command) {

            console.log(
                `⚠️ Comando não encontrado: ${interaction.commandName}`
            );

            return;
        }

        try {

            await command.execute(
                interaction
            );

        } catch (error) {

            console.error(
                `❌ Erro ao executar /${interaction.commandName}:`
            );

            console.error(error);

            // ==========================================
            // SE JÁ RESPONDEU
            // ==========================================

            if (
                interaction.replied ||
                interaction.deferred
            ) {

                await interaction.followUp({

                    content:
                        "❌ Ocorreu um erro ao executar este comando.",

                    flags: 64

                }).catch(() => {});

            }

            // ==========================================
            // SE AINDA NÃO RESPONDEU
            // ==========================================

            else {

                await interaction.reply({

                    content:
                        "❌ Ocorreu um erro ao executar este comando.",

                    flags: 64

                }).catch(() => {});

            }
        }
    }
);

// ==========================================
// ERRO DO CLIENT DISCORD
// ==========================================

client.on(
    "error",
    error => {

        console.error(
            "❌ Erro no Discord Client:"
        );

        console.error(error);

    }
);

// ==========================================
// PROMISE REJEITADA
// ==========================================

process.on(
    "unhandledRejection",
    error => {

        console.error(
            "❌ Promise rejeitada:"
        );

        console.error(error);

    }
);

// ==========================================
// EXCEÇÃO NÃO TRATADA
// ==========================================

process.on(
    "uncaughtException",
    error => {

        console.error(
            "❌ Erro não tratado:"
        );

        console.error(error);

    }
);

// ==========================================
// VERIFICAR TOKEN
// ==========================================

if (!config.token) {

    console.error("");

    console.error(
        "❌ DISCORD_TOKEN NÃO CONFIGURADO!"
    );

    console.error("");

    console.error(
        "Configure DISCORD_TOKEN nas Environment Variables."
    );

    console.error("");

    process.exit(1);
}

// ==========================================
// LOGIN NO DISCORD
// ==========================================

client.login(config.token);

// ==========================================
// DESLIGAMENTO SEGURO (Render envia SIGTERM)
// ==========================================

function shutdown(signal) {
    console.log(`${signal} recebido. Encerrando com segurança...`);
    try { stopVoice(); } catch {}
    server.close();
    client.destroy();
    setTimeout(() => process.exit(0), 500).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));