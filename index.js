// Força resolução IPv4 no Node.js (evita que a conexão com a API do Discord congele no Render via IPv6)
const dns = require("dns");
if (dns.setDefaultResultOrder) {
    dns.setDefaultResultOrder("ipv4first");
}

const http = require("http");
const https = require("https");
const {
    Client,
    GatewayIntentBits,
    Events
} = require("discord.js");

const config = require("./src/config");
const { sendDiscordLog } = require("./src/logger");
const { startVoice, stopVoice } = require("./src/voice");
const { startTagRoleManager, stopTagRoleManager } = require("./src/tagRoleManager");
const { startTickets, handleComponent, PREFIX: TICKET_PREFIX } = require("./src/tickets");
const { loadCommands, toPayload } = require("./src/commandLoader");
const { EPHEMERAL, safeReply } = require("./src/utils/interactions");

// ==========================================
// CONFIGURAÇÃO DO SERVIDOR HTTP
// Necessário para o Render Web Service + UptimeRobot
// ==========================================

const PORT = config.port;

const server = http.createServer(async (req, res) => {
    // Headers padrão e CORS para integração segura com o site/painel
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization, x-aevix-secret");

    if (req.method === "OPTIONS") {
        res.writeHead(204);
        return res.end();
    }

    if (req.method === "GET" && (req.url === "/" || req.url === "/health")) {
        res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
        return res.end(JSON.stringify({
            status: "online",
            bot: client.user ? client.user.tag : "connecting",
            ready: client.isReady(),
            guilds: client.guilds.cache.size,
            uptime: Math.floor(process.uptime()),
            timestamp: new Date().toISOString()
        }));
    }

    // Endpoint seguro para receber logs do backend / site Aevix Keys
    if (req.method === "POST" && req.url === "/api/log") {
        const reqSecret = req.headers["x-aevix-secret"] || req.headers["authorization"]?.replace("Bearer ", "");
        if (config.logApiSecret && reqSecret !== config.logApiSecret) {
            res.writeHead(401, { "Content-Type": "application/json" });
            return res.end(JSON.stringify({ error: "Unauthorized: Invalid log secret" }));
        }

        let body = "";
        req.on("data", chunk => {
            body += chunk;
            if (body.length > 1e5) { // Proteção contra payloads grandes (100KB)
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

    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Not Found" }));
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Servidor HTTP iniciado na porta ${PORT}`);
});

// ==========================================
// CRIAÇÃO DO CLIENT DISCORD
// ==========================================

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMembers,      // Necessário para moderação e tag do servidor (Server Members Intent)
        GatewayIntentBits.GuildVoiceStates   // Necessário para permanência em canal de voz
    ]
});

// ==========================================
// CARREGAMENTO DOS COMANDOS
// ==========================================

client.commands = loadCommands({ verbose: true });

// ==========================================
// INICIALIZAÇÃO DO BOT
// ==========================================

let isBotReady = false;

async function onBotReady() {
    if (isBotReady) return;
    isBotReady = true;

    console.log("");
    console.log("========================================");
    console.log("           BOT CONECTADO AO DISCORD");
    console.log("========================================");
    console.log(`🤖 Bot: ${client.user.tag}`);
    console.log(`🆔 ID: ${client.user.id}`);
    console.log(`🏠 Servidores: ${client.guilds.cache.size}`);
    console.log(`⚡ Comandos carregados: ${client.commands.size}`);
    console.log(`🌐 Porta HTTP: ${PORT}`);
    console.log("========================================");
    console.log("");

    // Registra/atualiza os comandos Slash automaticamente no servidor
    try {
        const commandsPayload = toPayload(client.commands);

        if (config.guildId) {
            const targetGuild = client.guilds.cache.get(config.guildId) || await client.guilds.fetch(config.guildId).catch(() => null);
            if (targetGuild) {
                await targetGuild.commands.set(commandsPayload);
                console.log(`✅ ${commandsPayload.length} comandos registrados automaticamente no servidor (${targetGuild.name})!`);
            }
        } else {
            for (const [, guild] of client.guilds.cache) {
                await guild.commands.set(commandsPayload);
                console.log(`✅ ${commandsPayload.length} comandos registrados automaticamente no servidor (${guild.name})!`);
            }
        }
    } catch (err) {
        console.error("❌ Erro ao registrar comandos automaticamente:", err);
    }

    // Define status online e atividade
    client.user.setPresence({
        activities: [
            {
                name: "Central de Atendimento & Moderação",
                type: 3 // Watching
            }
        ],
        status: "online"
    });

    // 1. Entra e permanece no canal de voz configurado (24/7)
    try {
        startVoice(client);
    } catch (err) {
        console.error("❌ Erro ao iniciar voz:", err);
    }

    // 2. Inicia o sistema automático de cargo por tag do servidor (primary_guild)
    try {
        startTagRoleManager(client);
    } catch (err) {
        console.error("❌ Erro ao iniciar gerenciamento de cargo por tag:", err);
    }

    // 3. Inicia o sistema de tickets (reconciliação de canais, publicação de painel e contadores)
    try {
        await startTickets(client);
    } catch (err) {
        console.error("❌ Erro ao iniciar sistema de tickets:", err);
    }
}

// Escuta evento de inicialização de forma compatível
client.once(Events.ClientReady, onBotReady);

// ==========================================
// TRATAMENTO DE INTERAÇÕES (Slash Commands + Tickets)
// ==========================================

client.on(Events.InteractionCreate, async interaction => {
    try {
        // 1. Roteamento de componentes do Sistema de Tickets (Menus e Botões com prefixo "ticket:")
        if (
            (interaction.isStringSelectMenu() || interaction.isButton()) &&
            interaction.customId &&
            interaction.customId.startsWith(TICKET_PREFIX)
        ) {
            return await handleComponent(interaction);
        }

        // 2. Comandos Slash
        if (!interaction.isChatInputCommand()) {
            return;
        }

        console.log(`⚡ [Comando] /${interaction.commandName} executado por ${interaction.user.tag || interaction.user.username} no canal #${interaction.channel?.name || interaction.channelId}`);

        const command = client.commands.get(interaction.commandName);

        if (!command) {
            console.warn(`⚠️ Comando não encontrado: ${interaction.commandName}`);
            return await safeReply(interaction, "❌ Este comando não está registrado ou foi desativado.");
        }

        await command.execute(interaction);

    } catch (error) {
        console.error(`❌ Erro ao executar /${interaction.commandName || "interação"}:`, error);
        await safeReply(interaction, "❌ Ocorreu um erro ao processar esta ação. Tente novamente em instantes.");
    }
});

// ==========================================
// TRATAMENTO DE ERROS GLOBAIS
// ==========================================

client.on("error", error => {
    console.error("❌ Erro no Discord Client:", error);
});

process.on("unhandledRejection", error => {
    console.error("❌ Promise rejeitada não tratada:", error);
});

process.on("uncaughtException", error => {
    console.error("❌ Exceção não tratada:", error);
});

// ==========================================
// VERIFICAR TOKEN E INICIAR
// ==========================================

if (!config.token) {
    console.error("\n❌ DISCORD_TOKEN NÃO CONFIGURADO!\nConfigure DISCORD_TOKEN nas Environment Variables (Render ou .env).\n");
    process.exit(1);
}

// Sanitiza o token (remove possíveis espaços, aspas acidentais ou prefixo 'Bot ')
const rawToken = String(config.token).trim().replace(/^["']|["']$/g, '').replace(/^Bot\s+/i, '');

// Logs de diagnóstico de rede (apenas se DEBUG_DISCORD estiver ativado)
if (config.debugDiscord) {
    client.on("debug", info => {
        if (info.includes("Heartbeat") || info.includes("heartbeat")) return;
        console.log(`🌐 [Discord Debug] ${info}`);
    });

    client.rest.on("response", (req, res) => {
        console.log(`🌐 [Discord REST] ${req.method} ${req.path} -> Status ${res.status}`);
    });
}

client.on("warn", warning => {
    console.warn(`⚠️ [Discord Aviso] ${warning}`);
});

client.rest.on("rateLimited", rateLimitInfo => {
    console.warn(`⏳ [Discord Rate Limit] Limite atingido na rota ${rateLimitInfo.route}. Aguardando ${rateLimitInfo.timeToReset}ms.`);
});

// Teste de conectividade rápida com a API do Discord
const reqTest = https.get("https://discord.com/api/v10/gateway", { timeout: 10000 }, resTest => {
    console.log(`🌐 [Conexão] Discord Gateway acessível: HTTP ${resTest.statusCode}`);
});
reqTest.on("error", err => {
    console.warn(`⚠️ [Conexão] Não foi possível testar https://discord.com: ${err.message}`);
});
reqTest.on("timeout", () => {
    reqTest.destroy();
    console.warn("⚠️ [Conexão] Timeout ao testar gateway do Discord.");
});

// Timeout de segurança: se o bot não conectar em tempo hábil no Render, encerra para reiniciar o container
if (config.readyTimeoutMs > 0) {
    const readyTimeout = setTimeout(() => {
        if (!isBotReady) {
            console.error(`❌ [Timeout] O bot não conectou ao Discord dentro de ${Math.round(config.readyTimeoutMs / 1000)}s.`);
            console.error("Reiniciando o processo para nova tentativa...");
            process.exit(1);
        }
    }, config.readyTimeoutMs);
    readyTimeout.unref();
}

console.log("🔑 Conectando ao Discord com o token configurado...");
client.login(rawToken)
    .then(() => {
        console.log("✅ Autenticação com a API do Discord realizada com sucesso!");
    })
    .catch(error => {
        console.error("❌ ERRO FATAL AO FAZER LOGIN NO DISCORD:", error.message);
        if (error.message.includes("An invalid token was provided")) {
            console.error("👉 Verifique se o DISCORD_TOKEN está com o token correto e atualizado.");
        }
        if (error.message.includes("Used disallowed intents")) {
            console.error("👉 Ative a opção 'SERVER MEMBERS INTENT' em Discord Developer Portal -> Bot -> Privileged Gateway Intents.");
        }
    });

// ==========================================
// DESLIGAMENTO SEGURO (Render envia SIGTERM)
// ==========================================

function shutdown(signal) {
    console.log(`\n🛑 ${signal} recebido. Encerrando com segurança...`);
    try { stopVoice(); } catch {}
    try { stopTagRoleManager(); } catch {}
    try { server.close(); } catch {}
    try { client.destroy(); } catch {}
    setTimeout(() => process.exit(0), 500).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
