const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

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
                content: "❌ Usuário não encontrado.",
                ephemeral: true
            });
        }

        const botMember =
            interaction.guild.members.me;

        if (
            cargo.position >=
            botMember.roles.highest.position
        ) {

            return interaction.reply({
                content:
                    "❌ Meu cargo precisa estar acima desse cargo.",
                ephemeral: true
            });
        }

        if (!membro.roles.cache.has(cargo.id)) {

            return interaction.reply({
                content:
                    `⚠️ ${usuario} não possui o cargo ${cargo}.`,
                ephemeral: true
            });
        }

        try {

            await membro.roles.remove(
                cargo,
                `Cargo removido por ${interaction.user.tag}`
            );

            await interaction.reply({
                content:
                    `✅ O cargo ${cargo} foi removido de ${usuario}.`
            });

        } catch (error) {

            console.error(error);

            await interaction.reply({
                content:
                    "❌ Não consegui remover o cargo.",
                ephemeral: true
            });
        }
    }
};