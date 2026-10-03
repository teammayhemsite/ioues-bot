const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

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
                ephemeral: true
            });
        }

        const botMember =
            interaction.guild.members.me;

        if (!botMember) {

            return interaction.reply({
                content: "❌ Não consegui verificar minhas permissões.",
                ephemeral: true
            });
        }

        if (membro.id === interaction.guild.ownerId) {

            return interaction.reply({
                content: "❌ Não é possível banir o dono do servidor.",
                ephemeral: true
            });
        }

        if (
            membro.roles.highest.position >=
            botMember.roles.highest.position
        ) {

            return interaction.reply({
                content:
                    "❌ Meu cargo precisa estar acima do cargo desse usuário.",
                ephemeral: true
            });
        }

        try {

            await membro.ban({
                reason:
                    `${motivo} | Por ${interaction.user.tag}`
            });

            await interaction.reply({
                content:
                    `🔨 **${usuario.tag}** foi banido.\n` +
                    `📝 Motivo: ${motivo}`
            });

        } catch (error) {

            console.error(error);

            await interaction.reply({
                content:
                    "❌ Não consegui banir esse usuário.",
                ephemeral: true
            });
        }
    }
};