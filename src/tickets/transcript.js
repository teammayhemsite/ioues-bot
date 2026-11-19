const { AttachmentBuilder } = require("discord.js");

const MAX_MESSAGES = 5000;

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function formatDate(date) {
    try {
        return new Date(date).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    } catch {
        return new Date(date).toISOString();
    }
}

/**
 * Busca todas as mensagens de um canal (paginando de 100 em 100), em ordem cronológica.
 */
async function fetchAllMessages(channel, limit = MAX_MESSAGES) {
    const collected = [];
    let before;

    while (collected.length < limit) {
        const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) });
        const items = batch ? (typeof batch.values === "function" ? [...batch.values()] : Array.from(batch)) : [];
        if (items.length === 0) break;
        collected.push(...items);
        const lastItem = items[items.length - 1];
        before = lastItem?.id;
        if (items.length < 100 || !before) break;
    }

    return collected.reverse();
}

/**
 * Substitui menções cruas (<@id>, <@&id>, <#id>) por nomes legíveis, já escapados.
 */
function renderContent(message) {
    let text = escapeHtml(message.content || "");

    text = text.replace(/&lt;@!?(\d{17,20})&gt;/g, (_, id) => {
        const user = message.mentions?.users?.get(id) || message.client?.users?.cache?.get(id);
        return `<span class="mention">@${escapeHtml(user?.username || id)}</span>`;
    });
    text = text.replace(/&lt;@&amp;(\d{17,20})&gt;/g, (_, id) => {
        const role = message.guild?.roles?.cache?.get(id);
        return `<span class="mention">@${escapeHtml(role?.name || id)}</span>`;
    });
    text = text.replace(/&lt;#(\d{17,20})&gt;/g, (_, id) => {
        const channel = message.guild?.channels?.cache?.get(id);
        return `<span class="mention">#${escapeHtml(channel?.name || id)}</span>`;
    });

    return text;
}

function renderEmbeds(message) {
    if (!message.embeds?.length) return "";

    return message.embeds.map(embed => {
        const color = embed.hexColor || "#5865F2";
        const parts = [];
        if (embed.author?.name) parts.push(`<div class="embed-author">${escapeHtml(embed.author.name)}</div>`);
        if (embed.title) parts.push(`<div class="embed-title">${escapeHtml(embed.title)}</div>`);
        if (embed.description) parts.push(`<div class="embed-desc">${escapeHtml(embed.description)}</div>`);
        for (const field of embed.fields || []) {
            parts.push(`<div class="embed-field"><b>${escapeHtml(field.name)}</b><br>${escapeHtml(field.value)}</div>`);
        }
        if (embed.footer?.text) parts.push(`<div class="embed-footer">${escapeHtml(embed.footer.text)}</div>`);
        return `<div class="embed" style="border-color:${escapeHtml(color)}">${parts.join("")}</div>`;
    }).join("");
}

function renderAttachments(message) {
    if (!message.attachments?.size) return "";
    return [...message.attachments.values()].map(att =>
        `<div class="attachment">📎 <a href="${escapeHtml(att.url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(att.name || "anexo")}</a> <span class="muted">(${Math.ceil((att.size || 0) / 1024)} KB)</span></div>`
    ).join("");
}

/**
 * Gera o transcript HTML de um canal de ticket.
 *
 * @param {import('discord.js').TextChannel} channel
 * @param {object} ticket Registro do ticket (number, typeLabel, ownerTag...)
 * @returns {Promise<{ attachment: AttachmentBuilder, buffer: Buffer, fileName: string, messageCount: number, participants: string[] }>}
 */
async function generateTranscript(channel, ticket = {}) {
    const messages = await fetchAllMessages(channel);
    const participants = new Map();
    let missingContent = 0;

    const rows = messages.map(message => {
        const author = message.author;
        if (author && !author.bot) participants.set(author.id, author.tag || author.username);

        const content = renderContent(message);
        if (!message.content && !message.embeds?.length && !message.attachments?.size && !message.system) {
            missingContent++;
        }

        const avatar = author?.displayAvatarURL?.({ size: 64, extension: "png" }) || "";
        const botBadge = author?.bot ? `<span class="badge">BOT</span>` : "";

        return `
        <div class="msg">
            <img class="avatar" src="${escapeHtml(avatar)}" alt="">
            <div class="body">
                <div class="head"><span class="name">${escapeHtml(author?.tag || author?.username || "Desconhecido")}</span>${botBadge}<span class="time">${escapeHtml(formatDate(message.createdAt))}</span></div>
                ${content ? `<div class="content">${content}</div>` : ""}
                ${renderEmbeds(message)}
                ${renderAttachments(message)}
            </div>
        </div>`;
    }).join("\n");

    const warning = missingContent > 0
        ? `<div class="warn">⚠️ ${missingContent} mensagem(ns) sem conteúdo visível. Ative a opção <b>Message Content Intent</b> no Discord Developer Portal para registrar o texto das mensagens.</div>`
        : "";

    const title = `Ticket #${ticket.number ?? "?"} • ${ticket.typeLabel || ticket.type || "Atendimento"}`;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
    body { background:#313338; color:#dbdee1; font-family: "gg sans","Segoe UI",Arial,sans-serif; margin:0; padding:24px; }
    .header { background:#2b2d31; border-radius:8px; padding:16px 20px; margin-bottom:20px; }
    .header h1 { margin:0 0 8px; font-size:20px; color:#fff; }
    .header div { font-size:14px; line-height:1.6; }
    .msg { display:flex; gap:14px; padding:8px 4px; border-radius:4px; }
    .msg:hover { background:#2e3035; }
    .avatar { width:40px; height:40px; border-radius:50%; background:#1e1f22; flex-shrink:0; }
    .body { min-width:0; flex:1; }
    .head { margin-bottom:2px; }
    .name { color:#fff; font-weight:600; margin-right:6px; }
    .badge { background:#5865f2; color:#fff; font-size:10px; padding:1px 5px; border-radius:3px; margin-right:6px; }
    .time { color:#949ba4; font-size:12px; }
    .content { white-space:pre-wrap; word-wrap:break-word; }
    .mention { background:rgba(88,101,242,.3); color:#c9cdfb; border-radius:3px; padding:0 2px; }
    .embed { border-left:4px solid #5865f2; background:#2b2d31; border-radius:4px; padding:8px 12px; margin-top:6px; max-width:520px; white-space:pre-wrap; }
    .embed-author { font-size:12px; color:#fff; margin-bottom:4px; }
    .embed-title { font-weight:700; color:#fff; margin-bottom:4px; }
    .embed-field { margin-top:6px; font-size:14px; }
    .embed-footer { font-size:12px; color:#949ba4; margin-top:6px; }
    .attachment a { color:#00a8fc; }
    .muted { color:#949ba4; font-size:12px; }
    .warn { background:#4a3b1a; border-radius:6px; padding:10px 14px; margin-bottom:16px; }
</style>
</head>
<body>
    <div class="header">
        <h1>🎫 ${escapeHtml(title)}</h1>
        <div><b>Canal:</b> #${escapeHtml(channel.name)}</div>
        <div><b>Aberto por:</b> ${escapeHtml(ticket.ownerTag || ticket.ownerId || "Desconhecido")}</div>
        <div><b>Criado em:</b> ${escapeHtml(ticket.createdAt ? formatDate(ticket.createdAt) : "—")}</div>
        <div><b>Transcript gerado em:</b> ${escapeHtml(formatDate(new Date()))}</div>
        <div><b>Mensagens:</b> ${messages.length}${messages.length >= MAX_MESSAGES ? ` (limite de ${MAX_MESSAGES} atingido)` : ""}</div>
    </div>
    ${warning}
    ${rows || '<div class="muted">Nenhuma mensagem encontrada.</div>'}
</body>
</html>`;

    const buffer = Buffer.from(html, "utf8");
    const fileName = `transcript-ticket-${ticket.number ?? channel.id}.html`;

    return {
        attachment: new AttachmentBuilder(buffer, { name: fileName }),
        buffer,
        fileName,
        messageCount: messages.length,
        participants: [...participants.values()]
    };
}

module.exports = {
    generateTranscript,
    escapeHtml
};
