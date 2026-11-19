const {
    SlashCommandBuilder
} = require("discord.js");

const { EPHEMERAL } = require("../../../src/utils/interactions");

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

        try {
            const usuarioCompleto =
                await usuario.fetch();

            if (!usuarioCompleto.banner) {

                return interaction.reply({
                    content:
                        "❌ Esse usuário não possui um banner.",
                    flags: EPHEMERAL
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
        } catch (error) {
            console.error("❌ Erro ao buscar banner:", error);
            await interaction.reply({
                content: "❌ Não foi possível carregar as informações do banner.",
                flags: EPHEMERAL
            });
        }
    }
};
