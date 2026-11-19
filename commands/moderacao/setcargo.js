const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const { EPHEMERAL, checkHierarchy, checkRoleManageable } = require("../../src/utils/interactions");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("setcargo")
        .setDescription("Adiciona um cargo a um usuário.")

        .addRoleOption(option =>
            option
                .setName("cargo")
                .setDescription("Cargo que será adicionado.")
                .setRequired(true)
        )

        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuário que receberá o cargo.")
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

        const hierarchyError = checkHierarchy(interaction, membro, "atribuir cargo a");
        if (hierarchyError) {
            return interaction.reply({
                content: hierarchyError,
                flags: EPHEMERAL
            });
        }

        if (membro.roles.cache.has(cargo.id)) {

            return interaction.reply({
                content:
                    `⚠️ ${usuario} já possui o cargo ${cargo}.`,
                flags: EPHEMERAL
            });
        }

        try {

            await membro.roles.add(
                cargo,
                `Cargo adicionado por ${interaction.user.tag || interaction.user.username}`
            );

            await interaction.reply({
                content:
                    `✅ O cargo ${cargo} foi adicionado a ${usuario}.`
            });

        } catch (error) {

            console.error("❌ Erro ao adicionar cargo:", error);

            await interaction.reply({
                content:
                    "❌ Não consegui adicionar o cargo. Verifique minhas permissões e hierarquia.",
                flags: EPHEMERAL
            });
        }
    }
};
