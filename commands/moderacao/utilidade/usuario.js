const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("usuario")
        .setDescription("Mostra informações de um usuário.")

        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuário.")
                .setRequired(false)
        ),

    async execute(interaction) {

        const usuario =
            interaction.options.getUser("usuario") ||
            interaction.user;

        const membro =
            await interaction.guild.members
                .fetch(usuario.id)
                .catch(() => null);

        const embed = new EmbedBuilder()
            .setTitle(`👤 ${usuario.username}`)
            .setThumbnail(
                usuario.displayAvatarURL({
                    size: 512
                })
            )
            .setColor(0x5865F2)
            .addFields(
                {
                    name: "🆔 ID",
                    value: `\`${usuario.id}\``,
                    inline: false
                },
                {
                    name: "📅 Conta criada",
                    value:
                        `<t:${Math.floor(
                            usuario.createdTimestamp / 1000
                        )}:F>`,
                    inline: false
                }
            )
            .setTimestamp();

        if (membro) {

            embed.addFields({
                name: "📥 Entrou no servidor",
                value:
                    membro.joinedTimestamp
                        ? `<t:${Math.floor(
                            membro.joinedTimestamp / 1000
                        )}:F>`
                        : "Desconhecido",
                inline: false
            });
        }

        await interaction.reply({
            embeds: [embed]
        });
    }
};
