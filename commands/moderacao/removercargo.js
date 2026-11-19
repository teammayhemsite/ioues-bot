const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const { EPHEMERAL, checkHierarchy, checkRoleManageable } = require("../../src/utils/interactions");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("removercargo")
        .setDescription("Remove um cargo de um usuário.")

        .addRoleOption(option =>
            option
                .setName("cargo")
                .setDescription("Cargo que será removido.")
                .setRequired(true)
        )

        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuário.")
                .setRequired(true)
        )

        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageRoles
        ),

    async execute(interaction) {

        const cargo =
            interaction.options.getRole("cargo");

        const usuario =
            interaction.options.getUser("usuario");

        const membro =
            await interaction.guild.members
                .fetch(usuario.id)
                .catch(() => null);

        if (!membro) {

            return interaction.reply({
                content: "❌ Usuário não encontrado no servidor.",
                flags: EPHEMERAL
            });
        }

        const roleError = checkRoleManageable(interaction, cargo);
        if (roleError) {
            return interaction.reply({
                content: roleError,
                flags: EPHEMERAL
            });
        }

        const hierarchyError = checkHierarchy(interaction, membro, "remover cargo de");
        if (hierarchyError) {
            return interaction.reply({
                content: hierarchyError,
                flags: EPHEMERAL
            });
        }

        if (!membro.roles.cache.has(cargo.id)) {

            return interaction.reply({
                content:
                    `⚠️ ${usuario} não possui o cargo ${cargo}.`,
                flags: EPHEMERAL
            });
        }

        try {

            await membro.roles.remove(
                cargo,
                `Cargo removido por ${interaction.user.tag || interaction.user.username}`
            );

            await interaction.reply({
                content:
                    `✅ O cargo ${cargo} foi removido de ${usuario}.`
            });

        } catch (error) {

            console.error("❌ Erro ao remover cargo:", error);

            await interaction.reply({
                content:
                    "❌ Não consegui remover o cargo. Verifique minhas permissões e hierarquia.",
                flags: EPHEMERAL
            });
        }
    }
};
