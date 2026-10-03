const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

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
                ephemeral: true
            });
        }

        const botMember =
            interaction.guild.members.me;

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

            await membro.kick(
                `${motivo} | Por ${interaction.user.tag}`
            );

            await interaction.reply({
                content:
                    `👢 **${usuario.tag}** foi expulso.\n` +
                    `📝 Motivo: ${motivo}`
            });

        } catch (error) {

            console.error(error);

            await interaction.reply({
                content:
                    "❌ Não consegui expulsar esse usuário.",
                ephemeral: true
            });
        }
    }
};