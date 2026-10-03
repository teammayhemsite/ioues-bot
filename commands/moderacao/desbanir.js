const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("desbanir")
        .setDescription("Desbane um usuário.")
        .addStringOption(option =>
            option
                .setName("id")
                .setDescription("ID do usuário.")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.BanMembers
        ),

    async execute(interaction) {

        const id =
            interaction.options.getString("id").trim();

        if (!/^\d{17,20}$/.test(id)) {

            return interaction.reply({
                content: "❌ Informe um ID de usuário válido.",
                ephemeral: true
            });
        }

        try {

            await interaction.guild.members.unban(
                id,
                `Desbanido por ${interaction.user.tag}`
            );

            await interaction.reply({
                content:
                    `✅ O usuário \`${id}\` foi desbanido.`
            });

        } catch (error) {

            console.error(error);

            await interaction.reply({
                content:
                    "❌ Esse usuário não está banido ou não foi possível desbanir.",
                ephemeral: true
            });
        }
    }
};