const {
    SlashCommandBuilder,
    EmbedBuilder
} = require("discord.js");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("servidor")
        .setDescription("Mostra informações do servidor."),

    async execute(interaction) {

        const guild =
            interaction.guild;

        const embed =
            new EmbedBuilder()
                .setTitle(`🏠 ${guild.name}`)
                .setColor(0x5865F2)
                .setThumbnail(
                    guild.iconURL({
                        size: 512
                    })
                )
                .addFields(
                    {
                        name: "👥 Membros",
                        value:
                            `${guild.memberCount}`,
                        inline: true
                    },
                    {
                        name: "💬 Canais",
                        value:
                            `${guild.channels.cache.size}`,
                        inline: true
                    },
                    {
                        name: "🎭 Cargos",
                        value:
                            `${guild.roles.cache.size}`,
                        inline: true
                    },
                    {
                        name: "🆔 ID",
                        value:
                            `\`${guild.id}\``,
                        inline: false
                    },
                    {
                        name: "📅 Criado em",
                        value:
                            `<t:${Math.floor(
                                guild.createdTimestamp / 1000
                            )}:F>`,
                        inline: false
                    }
                )
                .setTimestamp();

        await interaction.reply({
            embeds: [embed]
        });
    }
};
