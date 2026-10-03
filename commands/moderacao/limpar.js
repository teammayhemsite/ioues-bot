const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("limpar")
        .setDescription("Apaga mensagens do canal.")

        .addIntegerOption(option =>
            option
                .setName("quantidade")
                .setDescription("Quantidade de mensagens.")
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true)
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageMessages
        ),

    async execute(interaction) {

        const quantidade =
            interaction.options.getInteger("quantidade");

        await interaction.deferReply({
            ephemeral: true
        });

        try {

            const mensagens =
                await interaction.channel.bulkDelete(
                    quantidade,
                    true
                );

            await interaction.editReply({
                content:
                    `🧹 ${mensagens.size} mensagens foram apagadas.`
            });

        } catch (error) {

            console.error(error);

            await interaction.editReply({
                content:
                    "❌ Não consegui apagar as mensagens."
            });
        }
    }
};