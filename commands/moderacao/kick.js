const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const { EPHEMERAL, checkHierarchy } = require("../../src/utils/interactions");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("kick")
        .setDescription("Expulsa um usuário do servidor.")
        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuário que será expulso.")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("motivo")
                .setDescription("Motivo da expulsão.")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.KickMembers
        ),

    async execute(interaction) {

        const usuario =
            interaction.options.getUser("usuario");

        const motivo =
            interaction.options.getString("motivo") ||
            "Nenhum motivo informado.";

        const membro =
            await interaction.guild.members
                .fetch(usuario.id)
                .catch(() => null);

        if (!membro) {

            return interaction.reply({
                content: "❌ Esse usuário não está no servidor.",
                flags: EPHEMERAL
            });
        }

        const hierarchyError = checkHierarchy(interaction, membro, "expulsar");
        if (hierarchyError) {
            return interaction.reply({
                content: hierarchyError,
                flags: EPHEMERAL
            });
        }

        if (!membro.kickable) {
            return interaction.reply({
                content: "❌ Não tenho permissão para expulsar esse usuário (ele pode possuir cargo superior ou protegido).",
                flags: EPHEMERAL
            });
        }

        try {

            await membro.kick(
                `${motivo} | Por ${interaction.user.tag || interaction.user.username}`
            );

            await interaction.reply({
                content:
                    `👢 **${usuario.tag || usuario.username}** foi expulso.\n` +
                    `📝 Motivo: ${motivo}`
            });

        } catch (error) {

            console.error("❌ Erro ao expulsar usuário:", error);

            await interaction.reply({
                content:
                    "❌ Não consegui expulsar esse usuário.",
                flags: EPHEMERAL
            });
        }
    }
};
