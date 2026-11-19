const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const config = require("../../src/config");
const { EPHEMERAL, checkHierarchy } = require("../../src/utils/interactions");

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
                flags: EPHEMERAL
            });
        }

        const usuario = interaction.options.getUser("usuario");

        await interaction.deferReply({
            flags: EPHEMERAL
        });

        const membro = await interaction.guild.members
            .fetch(usuario.id)
            .catch(() => null);

        if (!membro) {
            return interaction.editReply({
                content: "❌ Esse usuário não está no servidor."
            });
        }

        const hierarchyError = checkHierarchy(interaction, membro, "aplicar castigo");
        if (hierarchyError) {
            return interaction.editReply({
                content: hierarchyError
            });
        }

        if (!membro.moderatable) {
            return interaction.editReply({
                content: "❌ Não tenho permissão para aplicar castigo nesse usuário (ele pode ser Administrador ou possuir cargo protegido)."
            });
        }

        const botMember = interaction.guild.members.me;

        try {
            // 1. Aplicar castigo (timeout) de 7 dias / 1 semana
            await membro.timeout(
                SETE_DIAS_MS,
                `Divulgação de tigrinho (/anttigre) | Por ${interaction.user.tag}`
            );

            // 2. Apagar mensagens enviadas pelo usuário nas últimas 24 horas nos canais do servidor
            const limiteTempo = Date.now() - VINTE_QUATRO_HORAS_MS;
            let totalApagadas = 0;

            const canais = await interaction.guild.channels.fetch().catch(() => new Map());

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
                    const mensagens = await canal.messages.fetch({ limit: 100 }).catch(() => null);
                    if (!mensagens || mensagens.size === 0) continue;

                    const mensagensUsuario = mensagens.filter(
                        msg =>
                            msg.author.id === usuario.id &&
                            msg.createdTimestamp >= limiteTempo
                    );

                    if (mensagensUsuario.size > 0) {
                        const apagadas = await canal.bulkDelete(mensagensUsuario, true).catch(() => null);
                        if (apagadas) {
                            totalApagadas += apagadas.size;
                        }
                    }
                } catch (err) {
                    // Ignora erro em canais individuais sem interromper os demais
                }
            }

            // 3. Enviar mensagem no canal configurado marcando o usuário
            const canalAvisoId = config.antTigreNoticeChannelId;
            if (canalAvisoId) {
                const canalAviso = await interaction.client.channels
                    .fetch(canalAvisoId)
                    .catch(() => null);

                if (canalAviso && canalAviso.isTextBased()) {
                    await canalAviso.send({
                        content: `Sem ficar divulgando tigrinho aqui! ${usuario}`
                    }).catch(() => {});
                }
            }

            await interaction.editReply({
                content:
                    `🐯 **Punição aplicada em ${usuario.tag || usuario.username}!**\n` +
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
