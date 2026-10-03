const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const {
    createEmbed,
    createButtons
} = require("../../utils/embedUtils");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("anuncio")
        .setDescription("Envia um anúncio estilizado.")

        .addStringOption(option =>
            option
                .setName("titulo")
                .setDescription("Título do anúncio.")
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName("mensagem")
                .setDescription("Mensagem do anúncio.")
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName("imagem")
                .setDescription("URL da imagem.")
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName("cor")
                .setDescription("Cor HEX.")
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName("botao")
                .setDescription("Texto do botão.")
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName("botao_url")
                .setDescription("URL do botão.")
                .setRequired(false)
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageMessages
        ),

    async execute(interaction) {

        const titulo =
            interaction.options.getString("titulo");

        const mensagem =
            interaction.options.getString("mensagem");

        const imagem =
            interaction.options.getString("imagem");

        const cor =
            interaction.options.getString("cor");

        const botao =
            interaction.options.getString("botao");

        const botaoUrl =
            interaction.options.getString("botao_url");

        if (cor && !/^#?[0-9A-Fa-f]{6}$/.test(cor)) {

            return interaction.reply({
                content: "❌ Cor inválida.",
                ephemeral: true
            });
        }

        if (
            (botao && !botaoUrl) ||
            (!botao && botaoUrl)
        ) {

            return interaction.reply({
                content:
                    "❌ Informe o texto e a URL do botão.",
                ephemeral: true
            });
        }

        const embed = createEmbed({
            title: `📢 ${titulo}`,
            description: mensagem,
            color: cor || "#5865F2",
            image: imagem,
            author: interaction.guild.name,
            authorIcon: interaction.guild.iconURL(),
            footer: `Anúncio enviado por ${interaction.user.tag}`,
            timestamp: true
        });

        const components = createButtons(
            botao && botaoUrl
                ? [
                    {
                        label: botao,
                        url: botaoUrl
                    }
                ]
                : []
        );

        await interaction.channel.send({
            embeds: [embed],
            components
        });

        await interaction.reply({
            content: "✅ Anúncio enviado!",
            ephemeral: true
        });
    }
};
