const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const {
    createEmbed
} = require("../../utils/embedUtils");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("bemvindo")
        .setDescription("Envia uma mensagem de boas-vindas.")

        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuário que será mencionado.")
                .setRequired(true)
        )

        .addStringOption(option =>
            option
                .setName("mensagem")
                .setDescription("Mensagem personalizada.")
                .setRequired(false)
        )

        .addStringOption(option =>
            option
                .setName("imagem")
                .setDescription("Imagem da mensagem.")
                .setRequired(false)
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageMessages
        ),

    async execute(interaction) {

        const usuario =
            interaction.options.getUser("usuario");

        const mensagem =
            interaction.options.getString("mensagem") ||
            `Seja muito bem-vindo(a) ao **${interaction.guild.name}**!`;

        const imagem =
            interaction.options.getString("imagem");

        const embed = createEmbed({
            title: "👋 Seja bem-vindo!",
            description:
                `${usuario}\n\n${mensagem}`,
            color: "#5865F2",
            image: imagem,
            thumbnail: usuario.displayAvatarURL({
                size: 256
            }),
            author: interaction.guild.name,
            authorIcon: interaction.guild.iconURL(),
            footer: "Aproveite o servidor!",
            timestamp: true
        });

        await interaction.channel.send({
            content: `${usuario}`,
            embeds: [embed]
        });

        await interaction.reply({
            content: "✅ Mensagem de boas-vindas enviada!",
            ephemeral: true
        });
    }
};
