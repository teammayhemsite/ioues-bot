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
        .setName("embed")
        .setDescription("Cria uma mensagem personalizada.")

        .addStringOption(option =>
            option
                .setName("titulo")
                .setDescription("Título.")
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName("descricao")
                .setDescription("Descrição.")
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName("cor")
                .setDescription("Cor HEX. Ex: #5865F2")
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName("imagem")
                .setDescription("URL da imagem grande.")
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName("icone")
                .setDescription("URL do ícone/thumbnail.")
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName("autor")
                .setDescription("Nome do autor.")
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName("autor_icone")
                .setDescription("URL do ícone do autor.")
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName("rodape")
                .setDescription("Texto do rodapé.")
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName("url")
                .setDescription("URL ao clicar no título.")
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName("botao")
                .setDescription("Nome do botão.")
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName("botao_url")
                .setDescription("URL do botão.")
                .setRequired(false)
        )

        .addBooleanOption(option =>
            option
                .setName("timestamp")
                .setDescription("Mostrar data/hora?")
                .setRequired(false)
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageMessages
        ),

    async execute(interaction) {

        const titulo =
            interaction.options.getString("titulo");

        const descricao =
            interaction.options.getString("descricao");

        const cor =
            interaction.options.getString("cor");

        const imagem =
            interaction.options.getString("imagem");

        const icone =
            interaction.options.getString("icone");

        const autor =
            interaction.options.getString("autor");

        const autorIcon =
            interaction.options.getString("autor_icone");

        const rodape =
            interaction.options.getString("rodape");

        const url =
            interaction.options.getString("url");

        const botao =
            interaction.options.getString("botao");

        const botaoUrl =
            interaction.options.getString("botao_url");

        const timestamp =
            interaction.options.getBoolean("timestamp") || false;

        if (cor && !/^#?[0-9A-Fa-f]{6}$/.test(cor)) {

            return interaction.reply({
                content:
                    "❌ Cor inválida. Use o formato `#5865F2`.",
                ephemeral: true
            });
        }

        if (
            (botao && !botaoUrl) ||
            (!botao && botaoUrl)
        ) {

            return interaction.reply({
                content:
                    "❌ Para criar um botão, informe `botao` e `botao_url`.",
                ephemeral: true
            });
        }

        const embed = createEmbed({
            title: titulo,
            description: descricao,
            color: cor,
            image: imagem,
            thumbnail: icone,
            author: autor,
            authorIcon,
            footer: rodape,
            url,
            timestamp
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
            content: "✅ Embed enviada!",
            ephemeral: true
        });
    }
};
