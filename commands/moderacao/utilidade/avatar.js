const {
    SlashCommandBuilder
} = require("discord.js");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("avatar")
        .setDescription("Mostra o avatar de um usuário.")

        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuário.")
                .setRequired(false)
        ),

    async execute(interaction) {

        const usuario =
            interaction.options.getUser("usuario") ||
            interaction.user;

        const avatar =
            usuario.displayAvatarURL({
                size: 4096,
                extension: "png"
            });

        await interaction.reply({
            embeds: [
                {
                    title: `Avatar de ${usuario.username}`,
                    image: {
                        url: avatar
                    },
                    color: 0x5865F2
                }
            ]
        });
    }
};
