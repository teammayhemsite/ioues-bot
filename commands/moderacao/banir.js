const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const { EPHEMERAL, checkHierarchy } = require("../../src/utils/interactions");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("banir")
        .setDescription("Bane um usuário do servidor.")
        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuário que será banido.")
                .setRequired(true)
        )
        .addStringOption(option =>
            option
                .setName("motivo")
                .setDescription("Motivo do banimento.")
                .setRequired(false)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.BanMembers
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

        const hierarchyError = checkHierarchy(interaction, membro, "banir");
        if (hierarchyError) {
            return interaction.reply({
                content: hierarchyError,
                flags: EPHEMERAL
            });
        }

        if (!membro.bannable) {
            return interaction.reply({
                content: "❌ Não tenho permissão para banir esse usuário (ele pode possuir cargo superior ou protegido).",
                flags: EPHEMERAL
            });
        }

        try {

            await membro.ban({
                reason:
                    `${motivo} | Por ${interaction.user.tag || interaction.user.username}`
            });

            await interaction.reply({
                content:
                    `🔨 **${usuario.tag || usuario.username}** foi banido.\n` +
                    `📝 Motivo: ${motivo}`
            });

        } catch (error) {

            console.error("❌ Erro ao banir usuário:", error);

            await interaction.reply({
                content:
                    "❌ Não consegui banir esse usuário.",
                flags: EPHEMERAL
            });
        }
    }
};
