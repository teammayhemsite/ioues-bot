const {
    SlashCommandBuilder
} = require("discord.js");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("banner")
        .setDescription("Mostra o banner de um usuário.")

        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuário.")
                .setRequired(false)
        ),

    async execute(interaction) {

        const usuarioSelecionado =
            interaction.options.getUser("usuario");

        const usuario =
            usuarioSelecionado || interaction.user;

        const usuarioCompleto =
            await usuario.fetch();

        if (!usuarioCompleto.banner) {

            return interaction.reply({
                content:
                    "❌ Esse usuário não possui um banner.",
                ephemeral: true
            });
        }

        const banner =
            usuarioCompleto.bannerURL({
                size: 4096,
                extension: "png"
            });

        await interaction.reply({
            embeds: [
                {
                    title: `Banner de ${usuario.username}`,
                    image: {
                        url: banner
                    },
                    color: 0x5865F2
                }
            ]
        });
    }
};
