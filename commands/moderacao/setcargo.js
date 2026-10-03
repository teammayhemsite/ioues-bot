const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

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
                    "❌ Meu cargo precisa estar acima do cargo que será atribuído.",
                ephemeral: true
            });
        }

        if (cargo.managed) {

            return interaction.reply({
                content:
                    "❌ Esse cargo é gerenciado por uma integração e não pode ser atribuído.",
                ephemeral: true
            });
        }

        if (membro.roles.cache.has(cargo.id)) {

            return interaction.reply({
                content:
                    `⚠️ ${usuario} já possui o cargo ${cargo}.`,
                ephemeral: true
            });
        }

        try {

            await membro.roles.add(
                cargo,
                `Cargo adicionado por ${interaction.user.tag}`
            );

            await interaction.reply({
                content:
                    `✅ O cargo ${cargo} foi adicionado a ${usuario}.`
            });

        } catch (error) {

            console.error(error);

            await interaction.reply({
                content:
                    "❌ Não consegui adicionar o cargo.",
                ephemeral: true
            });
        }
    }
};