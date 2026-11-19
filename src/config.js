try {
    require("dotenv").config({ quiet: true });
} catch (e) {
    // dotenv opcional em ambientes onde as variáveis já vêm injetadas no process.env (como Render)
}

// ==========================================
// HELPERS DE LEITURA DE VARIÁVEIS DE AMBIENTE
// ==========================================

function env(name, fallback = "") {
    const value = process.env[name];
    if (value === undefined || value === null) return fallback;
    const trimmed = String(value).trim();
    return trimmed === "" ? fallback : trimmed;
}

function envBool(name, fallback = false) {
    const value = env(name, "");
    if (!value) return fallback;
    return ["1", "true", "yes", "sim", "on"].includes(value.toLowerCase());
}

function envNumber(name, fallback) {
    const value = Number(env(name, ""));
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

function envList(name) {
    return env(name, "")
        .split(/[\s,;]+/)
        .map(item => item.trim())
        .filter(item => /^\d{17,20}$/.test(item));
}

// Toda configuração do bot fica aqui (lida de variáveis de ambiente, com padrões seguros).
// NUNCA coloque tokens, senhas ou chaves diretamente neste arquivo.
module.exports = {
    token: env("DISCORD_TOKEN"),
    clientId: env("CLIENT_ID"),
    guildId: env("GUILD_ID"),
    voiceChannelId: env("VOICE_CHANNEL_ID"),
    logChannelId: env("LOG_CHANNEL_ID", "1558873432769298522"),
    logApiSecret: env("AEVIX_LOG_SECRET"),
    port: Number(process.env.PORT) || 3000,

    // Ativa logs detalhados do gateway/REST do Discord (útil apenas para diagnosticar conexão no Render)
    debugDiscord: envBool("DEBUG_DISCORD", false),

    // Se o bot não ficar pronto nesse tempo após iniciar, o processo é encerrado para o Render reiniciá-lo.
    readyTimeoutMs: envNumber("READY_TIMEOUT_MS", 5 * 60 * 1000),

    // Intervalos de reconexão de voz (ms)
    reconnectMinMs: 5000,
    reconnectMaxMs: 60000,

    // Canal onde o /anttigre envia o aviso público
    antTigreNoticeChannelId: env("ANTTIGRE_CHANNEL_ID", "1559996459603075212"),

    // ==========================================
    // SISTEMA AUTOMÁTICO DE CARGO POR TAG DO SERVIDOR (PRIMARY GUILD)
    // ==========================================
    // ID do servidor onde o cargo será gerenciado (reutiliza GUILD_ID ou permite definir TAG_GUILD_ID separado)
    tagGuildId: env("TAG_GUILD_ID", env("GUILD_ID")),
    // Identificador da tag monitorada:
    // Na API oficial do Discord (user.primary_guild), a tag é identificada pelo ID do servidor dono da tag (identity_guild_id).
    // Se deixado em branco, o bot usará automaticamente o próprio ID do servidor (GUILD_ID).
    // Você também pode preencher com o ID do servidor da tag (Snowflake) ou com o texto da tag (ex: "AEVX") caso queira filtrar pela sigla.
    serverTagId: env("SERVER_TAG_ID"),
    // ID do cargo que será adicionado quando o membro ativar a tag e removido quando desativar
    tagRoleId: env("TAG_ROLE_ID", "1555852510139383919"),
    // ID do canal exclusivo para logs de adição/remoção de cargo da tag
    tagLogChannelId: env("TAG_LOG_CHANNEL_ID", "1559996459603075212"),

    // ==========================================
    // SISTEMA DE TICKETS
    // ==========================================
    tickets: {
        enabled: envBool("TICKETS_ENABLED", true),

        // Canal onde o painel "Central de Atendimento" fica publicado
        panelChannelId: env("TICKET_PANEL_CHANNEL_ID", "1433174225153298513"),

        // Canal que recebe os registros de abertura/fechamento e os transcripts.
        // Recomendado: um canal privado exclusivo para a equipe. Padrão: canal de logs geral.
        logChannelId: env("TICKET_LOG_CHANNEL_ID", env("LOG_CHANNEL_ID", "1558873432769298522")),

        // Cargos da equipe que podem ver/responder todos os tickets (IDs separados por vírgula).
        // Se vazio, o bot detecta automaticamente cargos com permissões de moderação
        // (Gerenciar Servidor, Gerenciar Mensagens ou Castigar Membros). Administradores sempre têm acesso.
        staffRoleIds: envList("TICKET_STAFF_ROLE_IDS"),

        // Menciona (pinga) os cargos da equipe quando um ticket é aberto
        pingStaff: envBool("TICKET_PING_STAFF", false),

        // Envia o transcript por DM ao autor do ticket quando ele for fechado
        dmTranscript: envBool("TICKET_DM_TRANSCRIPT", true),

        // Segundos entre a confirmação de fechamento e a exclusão do canal
        closeDelaySeconds: envNumber("TICKET_CLOSE_DELAY_SECONDS", 5),

        // Intervalo mínimo (segundos) entre aberturas de ticket pelo mesmo usuário (anti-spam)
        openCooldownSeconds: envNumber("TICKET_OPEN_COOLDOWN_SECONDS", 10),

        // Caminho do arquivo de persistência. No Render (plano gratuito) o disco é efêmero:
        // o bot reconstrói automaticamente o estado a partir dos canais e dos logs ao reiniciar.
        // Se usar um Persistent Disk no Render, aponte para ele (ex: /var/data/tickets.json).
        dataFile: env("TICKET_DATA_FILE", ""),

        // Tipos de atendimento. A ordem aqui é a ordem exibida no menu.
        types: [
            {
                id: "compras",
                label: "Comprar",
                emoji: "<:loja:1573035694572445746>",
                description: "Para usuários interessados em comprar produtos.",
                categoryId: env("TICKET_CATEGORY_COMPRAS", "1572982188096356445"),
                categoryNameHints: ["compra", "venda", "loja"],
                color: 0x38D39F,
                welcome: "Conte para nós qual produto você deseja adquirir e, se possível, a forma de pagamento preferida."
            },
            {
                id: "suporte",
                label: "Suporte",
                emoji: "<:suporte:1573035780102684903>",
                description: "Precisa de ajuda, tem dúvidas ou está enfrentando algum problema.",
                categoryId: env("TICKET_CATEGORY_SUPORTE", "1572981922009841665"),
                categoryNameHints: ["suporte", "ajuda"],
                color: 0x5865F2,
                welcome: "Descreva seu problema ou dúvida com o máximo de detalhes possível (prints ajudam bastante)."
            },
            {
                id: "denuncias",
                label: "Denúncias",
                emoji: "⚠️",
                description: "Denunciar membros, comportamentos inadequados ou irregularidades.",
                categoryId: env("TICKET_CATEGORY_DENUNCIAS", "1572982012195770510"),
                categoryNameHints: ["denuncia"],
                color: 0xEF4444,
                welcome: "Informe quem você deseja denunciar, o que aconteceu e envie provas (prints, links ou vídeos)."
            },
            {
                id: "parcerias",
                label: "Parcerias",
                emoji: "<:parceria:1573035876554899456>",
                description: "Interessado em estabelecer uma parceria com o servidor.",
                // Pendente: defina TICKET_CATEGORY_PARCERIAS. Se vazio, o bot procura uma categoria
                // cujo nome contenha "parceria" e, se não encontrar, avisa que a opção está indisponível.
                categoryId: env("TICKET_CATEGORY_PARCERIAS", ""),
                categoryNameHints: ["parceria", "partner"],
                color: 0xE8B65A,
                welcome: "Apresente seu servidor/projeto (link, número de membros e proposta de parceria)."
            }
        ]
    }
};
