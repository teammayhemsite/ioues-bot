const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    StringSelectMenuBuilder,
    StringSelectMenuOptionBuilder
} = require("discord.js");

// IDs fixos (estáticos) dos componentes: continuam funcionando após reinicializações,
// pois são tratados pelo handler global de interações e não por coletores em memória.
const IDS = {
    OPEN_SELECT: "ticket:open",
    CLOSE: "ticket:close",
    CLOSE_CONFIRM: "ticket:close-confirm",
    CLOSE_CANCEL: "ticket:close-cancel",
    CLAIM: "ticket:claim",
    TRANSCRIPT: "ticket:transcript"
};

const COLORS = {
    PANEL: 0x5865F2,
    OPEN: 0x38D39F,
    CLAIMED: 0xE8B65A,
    CLOSED: 0xEF4444
};

function buildPanel(guild, types) {
    const embed = new EmbedBuilder()
        .setColor(COLORS.PANEL)
        .setTitle("🎫 Central de Atendimento")
        .setDescription(
            [
                `Bem-vindo(a) à central de atendimento${guild ? ` do **${guild.name}**` : ""}!`,
                "Aqui você fala diretamente com a nossa equipe em um canal **privado**.",
                "",
                "**📌 Como funciona**",
                "**1.** Selecione no menu abaixo o tipo de atendimento desejado.",
                "**2.** Um canal privado será criado só para você e a equipe.",
                "**3.** Explique sua solicitação e aguarde o retorno da equipe.",
                "",               
                "> ⚠️ Abra tickets apenas quando necessário. Abusos podem resultar em punições."
            ].join("\n")
        )
        .setFooter({
            text: `${guild?.name || "Aevix"} • Atendimento`,
            iconURL: guild?.iconURL() || undefined
        });

    const icon = guild?.iconURL({ size: 256 });
    if (icon) embed.setThumbnail(icon);

    const select = new StringSelectMenuBuilder()
        .setCustomId(IDS.OPEN_SELECT)
        .setPlaceholder("📩 Selecione o tipo de atendimento...")
        .setMinValues(1)
        .setMaxValues(1)
        .addOptions(
            types.map(t =>
                new StringSelectMenuOptionBuilder()
                    .setLabel(t.label)
                    .setValue(t.id)
                    .setDescription(t.description.slice(0, 100))
                    .setEmoji(t.emoji)
            )
        );

    return {
        embeds: [embed],
        components: [new ActionRowBuilder().addComponents(select)]
    };
}

function statusText(ticket) {
    if (ticket.status === "closed") return "🔴 Fechado";
    if (ticket.claimedBy) return `🟡 Em atendimento por <@${ticket.claimedBy}>`;
    return "🟢 Aberto";
}

function buildTicketButtons(ticket, { disabled = false } = {}) {
    return [
        new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId(IDS.CLOSE)
                .setLabel("Fechar Ticket")
                .setEmoji("🔒")
                .setStyle(ButtonStyle.Danger)
                .setDisabled(disabled),
            new ButtonBuilder()
                .setCustomId(IDS.CLAIM)
                .setLabel(ticket.claimedBy ? "Assumido" : "Assumir")
                .setEmoji("🙋")
                .setStyle(ButtonStyle.Primary)
                .setDisabled(disabled || Boolean(ticket.claimedBy)),
            new ButtonBuilder()
                .setCustomId(IDS.TRANSCRIPT)
                .setLabel("Transcript")
                .setEmoji("📄")
                .setStyle(ButtonStyle.Secondary)
                .setDisabled(disabled)
        )
    ];
}

function buildTicketWelcome(ticket, type, guild) {
    const createdTs = Math.floor(new Date(ticket.createdAt).getTime() / 1000);

    const embed = new EmbedBuilder()
        .setColor(ticket.claimedBy ? COLORS.CLAIMED : (type?.color ?? COLORS.OPEN))
        .setTitle("🎫 Atendimento criado com sucesso!")
        .setDescription(
            [
                `Olá, <@${ticket.ownerId}>!`,
                "",
                "Seu ticket foi aberto. Nossa equipe estará disponível para ajudá-lo em breve.",
                type?.welcome ? `\n💬 ${type.welcome}` : ""
            ].join("\n")
        )
        .addFields(
            { name: "👤 Usuário", value: `<@${ticket.ownerId}>`, inline: true },
            { name: "📂 Categoria", value: `${type?.emoji || "🎫"} ${type?.label || ticket.type}`, inline: true },
            { name: "📌 Status", value: statusText(ticket), inline: true },
            { name: "🔢 Ticket", value: `#${ticket.number}`, inline: true },
            { name: "🕒 Aberto em", value: `<t:${createdTs}:F>`, inline: true }
        )
        .setFooter({
            text: `${guild?.name || "Aevix"} • Use o botão 🔒 para encerrar o atendimento`,
            iconURL: guild?.iconURL() || undefined
        })
        .setTimestamp(new Date(ticket.createdAt));

    return {
        embeds: [embed],
        components: buildTicketButtons(ticket)
    };
}

function buildCloseConfirm() {
    return {
        content: "⚠️ **Tem certeza que deseja fechar este ticket?**\nO canal será excluído e o histórico salvo em transcript.",
        components: [
            new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(IDS.CLOSE_CONFIRM)
                    .setLabel("Confirmar fechamento")
                    .setEmoji("✅")
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId(IDS.CLOSE_CANCEL)
                    .setLabel("Cancelar")
                    .setEmoji("✖️")
                    .setStyle(ButtonStyle.Secondary)
            )
        ]
    };
}

function buildClosingEmbed(closedById, reason, delaySeconds) {
    return new EmbedBuilder()
        .setColor(COLORS.CLOSED)
        .setTitle("🔒 Ticket sendo encerrado")
        .setDescription(
            [
                `Encerrado por <@${closedById}>.`,
                reason ? `**Motivo:** ${reason}` : null,
                "",
                `O histórico será salvo (transcript) e este canal será excluído em **${delaySeconds} segundos**.`
            ].filter(line => line !== null).join("\n")
        )
        .setTimestamp();
}

function buildGoToTicketRow(channel) {
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setLabel("Ir para o ticket")
            .setEmoji("🎫")
            .setStyle(ButtonStyle.Link)
            .setURL(channel.url)
    );
}

module.exports = {
    IDS,
    COLORS,
    buildPanel,
    buildTicketWelcome,
    buildTicketButtons,
    buildCloseConfirm,
    buildClosingEmbed,
    buildGoToTicketRow,
    statusText
};
