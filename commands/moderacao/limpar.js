const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const { EPHEMERAL } = require("../../src/utils/interactions");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("limpar")
        .setDescription("Apaga mensagens do canal.")

        .addIntegerOption(option =>
            option
                .setName("quantidade")
                .setDescription("Quantidade de mensagens (1 a 100).")
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
            flags: EPHEMERAL
        });

        try {

            // bulkDelete com filtro automático para mensagens com menos de 14 dias
            const mensagens =
                await interaction.channel.bulkDelete(
                    quantidade,
                    true
                );

            await interaction.editReply({
                content:
                    `🧹 ${mensagens.size} mensagem(ns) foram apagadas.`
            });

        } catch (error) {

            console.error("❌ Erro ao apagar mensagens com /limpar:", error);

            const msg = error.code === 50034
                ? "❌ Não é possível apagar mensagens com mais de 14 dias em massa."
                : "❌ Não consegui apagar as mensagens. Verifique minhas permissões no canal.";

            await interaction.editReply({
                content: msg
            });
        }
    }
};
