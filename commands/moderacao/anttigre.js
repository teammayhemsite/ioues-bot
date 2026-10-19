const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const CANAL_AVISO_ID = "1559996459603075212";
const SETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;
const VINTE_QUATRO_HORAS_MS = 24 * 60 * 60 * 1000;

module.exports = {

    data: new SlashCommandBuilder()
        .setName("anttigre")
        .setDescription("Apaga mensagens das últimas 24h do usuário, aplica castigo de 7 dias e envia aviso.")
        .addUserOption(option =>
            option
                .setName("usuario")
                .setDescription("Usuário que receberá a punição.")
                .setRequired(true)
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.Administrator
        ),

    async execute(interaction) {

        if (
            !interaction.memberPermissions ||
            !interaction.memberPermissions.has(PermissionFlagsBits.Administrator)
        ) {
            return interaction.reply({
                content: "❌ Apenas administradores podem usar este comando.",
                ephemeral: true
            });
        }

        const usuario = interaction.options.getUser("usuario");

        await interaction.deferReply({
            ephemeral: true
        });

        const membro = await interaction.guild.members
            .fetch(usuario.id)
            .catch(() => null);

        if (!membro) {
            return interaction.editReply({
                content: "❌ Esse usuário não está no servidor."
            });
        }

        const botMember = interaction.guild.members.me;

        if (!botMember) {
            return interaction.editReply({
                content: "❌ Não consegui verificar minhas permissões."
            });
        }

        if (membro.id === interaction.guild.ownerId) {
            return interaction.editReply({
                content: "❌ Não é possível aplicar castigo no dono do servidor."
            });
        }

        if (
            membro.roles.highest.position >=
            botMember.roles.highest.position
        ) {
            return interaction.editReply({
                content: "❌ Meu cargo precisa estar acima do cargo desse usuário."
            });
        }

        if (!membro.moderatable) {
            return interaction.editReply({
                content: "❌ Não tenho permissão para aplicar castigo nesse usuário (ele pode ser Administrador)."
            });
        }

        try {
            // 1. Aplicar castigo (timeout) de 7 dias / 1 semana
            await membro.timeout(
                SETE_DIAS_MS,
                `Divulgação de tigrinho (/anttigre) | Por ${interaction.user.tag}`
            );

            // 2. Apagar mensagens enviadas pelo usuário nas últimas 24 horas nos canais do servidor
            const limiteTempo = Date.now() - VINTE_QUATRO_HORAS_MS;
            let totalApagadas = 0;

            const canais = await interaction.guild.channels.fetch();

            for (const [, canal] of canais) {
                if (!canal || !canal.isTextBased() || !canal.messages) {
                    continue;
                }

                const permissoes = canal.permissionsFor(botMember);
                if (
                    !permissoes ||
                    !permissoes.has(PermissionFlagsBits.ViewChannel) ||
                    !permissoes.has(PermissionFlagsBits.ReadMessageHistory) ||
                    !permissoes.has(PermissionFlagsBits.ManageMessages)
                ) {
                    continue;
                }

                try {
                    const mensagens = await canal.messages.fetch({ limit: 100 });
                    const mensagensUsuario = mensagens.filter(
                        msg =>
                            msg.author.id === usuario.id &&
                            msg.createdTimestamp >= limiteTempo
                    );

                    if (mensagensUsuario.size > 0) {
                        const apagadas = await canal.bulkDelete(mensagensUsuario, true);
                        totalApagadas += apagadas.size;
                    }
                } catch (err) {
                    // Ignora erro em canais individuais sem interromper os demais
                }
            }

            // 3. Enviar mensagem no canal 1559996459603075212 marcando o usuário
            const canalAviso = await interaction.client.channels
                .fetch(CANAL_AVISO_ID)
                .catch(() => null);

            if (canalAviso && canalAviso.isTextBased()) {
                await canalAviso.send({
                    content: `Sem ficar divulgando tigrinho aqui! ${usuario}`
                });
            }

            await interaction.editReply({
                content:
                    `🐯 **Punição aplicada em ${usuario.tag}!**\n` +
                    `⏳ Castigo: **7 dias**\n` +
                    `🧹 Mensagens apagadas (últimas 24h): **${totalApagadas}**`
            });

        } catch (error) {
            console.error("Erro no comando /anttigre:", error);

            await interaction.editReply({
                content: "❌ Ocorreu um erro ao aplicar a punição no usuário."
            });
        }
    }
};
