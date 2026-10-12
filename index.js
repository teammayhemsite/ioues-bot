const config = require("./src/config");
const { startVoice, stopVoice } = require("./src/voice");

const {
    Client,
    GatewayIntentBits,
    Collection,
    EmbedBuilder
} = require("discord.js");

const fs = require("fs");
const path = require("path");
const http = require("http");

// ==========================================
// SISTEMA DE LOGS DO AEVIX KEYS (INTEGRADO)
// ==========================================
const LOG_COLORS = {
    SUCCESS: 0x38D39F, // Verde
    WARNING: 0xE8B65A, // Amarelo/Dourado
    DANGER: 0xEF4444,  // Vermelho
    INFO: 0x5865F2,    // Azul Discord
    NEUTRAL: 0x2B2D31  // Escuro
};

async function sendDiscordLog(client, logData) {
    if (!client || !client.isReady()) {
        console.warn("⚠️ [Aevix Logger] Discord client ainda não está pronto para enviar log.");
        return false;
    }

    const channelId = config.logChannelId || process.env.LOG_CHANNEL_ID || "1558873432769298522";

    try {
        const channel = await client.channels.fetch(channelId).catch(() => null);
        if (!channel || !channel.isTextBased()) {
            console.error(`❌ [Aevix Logger] Canal de logs não encontrado ou sem permissão: ${channelId}`);
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

        const embed = new EmbedBuilder()
            .setColor(color)
            .setTimestamp(new Date());

        if (title) {
            embed.setTitle(title);
        }

        embed.setAuthor({
            name: `Aevix Keys • ${action || "Registro de Atividade"}`,
            iconURL: client.user.displayAvatarURL()
        });

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

        if (Array.isArray(fields) && fields.length > 0) {
            embed.addFields(fields);
        }

        embed.setFooter({
            text: `${footer} • ID: ${Math.floor(Date.now() / 1000)}`,
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

// ==========================================
// CONFIGURAÇÃO DO SERVIDOR HTTP
// Necessário para o Render Web Service
// ==========================================

const PORT = config.port;

const server = http.createServer(async (req, res) => {
    // Configura headers padrão e CORS para integração segura com o site
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-aevix-secret");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
    }

    if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
        res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
        return res.end("OK - Aevix Discord Bot Online");
    }

    // Endpoint seguro para receber logs do backend / site Aevix Keys
    if (req.method === "POST" && req.url === "/api/log") {
        // Validação de segurança via Secret configurado em AEVIX_LOG_SECRET se definido
        const reqSecret = req.headers["x-aevix-secret"] || req.headers["authorization"]?.replace("Bearer ", "");
        if (config.logApiSecret && reqSecret !== config.logApiSecret) {
            res.writeHead(401, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Unauthorized: Invalid log secret" }));
        }

        let body = "";
        req.on("data", chunk => {
            body += chunk;
            if (body.length > 1e5) { // Proteção contra payloads grandes
                req.destroy();
            }
        });

        req.on("end", async () => {
            try {
                const logData = JSON.parse(body || "{}");
                const sent = await sendDiscordLog(client, logData);

                res.writeHead(sent ? 200 : 500, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ success: sent }));
            } catch (err) {
                res.writeHead(400, { "Content-Type": "application/json" });
                return res.end(JSON.stringify({ error: "Invalid JSON payload" }));
            }
        });
        return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
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
