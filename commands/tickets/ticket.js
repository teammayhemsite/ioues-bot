const {
    SlashCommandBuilder,
    PermissionFlagsBits
} = require("discord.js");

const tickets = require("../../src/tickets");
const { EPHEMERAL } = require("../../src/utils/interactions");

module.exports = {

    data: new SlashCommandBuilder()
        .setName("ticket")
        .setDescription("Gerencia o sistema de tickets.")
        .addSubcommand(sub =>
            sub
                .setName("painel")
                .setDescription("Publica ou atualiza o painel da Central de Atendimento.")
                .addBooleanOption(option =>
                    option
                        .setName("recriar")
                        .setDescription("Apaga o painel atual e envia um novo.")
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName("fechar")
                .setDescription("Fecha o ticket atual (salvando o transcript).")
                .addStringOption(option =>
                    option
                        .setName("motivo")
                        .setDescription("Motivo do fechamento.")
                        .setMaxLength(500)
                        .setRequired(false)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName("adicionar")
                .setDescription("Adiciona um usuário ao ticket atual.")
                .addUserOption(option =>
                    option
                        .setName("usuario")
                        .setDescription("Usuário que terá acesso ao ticket.")
                        .setRequired(true)
                )
        )
        .addSubcommand(sub =>
            sub
                .setName("remover")
                .setDescription("Remove um usuário do ticket atual.")
                .addUserOption(option =>
                    option
                        .setName("usuario")
                        .setDescription("Usuário que perderá o acesso ao ticket.")
                        .setRequired(true)
                )
        )
        .setDefaultMemberPermissions(
            PermissionFlagsBits.ManageMessages
        ),

    async execute(interaction) {

        const sub = interaction.options.getSubcommand();
        const member = await tickets.resolveMember(interaction);

        // ==========================================
        // /ticket painel
        // ==========================================

        if (sub === "painel") {
            if (!member?.permissions.has(PermissionFlagsBits.ManageGuild)) {
                return interaction.reply({
                    content: "❌ Você precisa da permissão **Gerenciar Servidor** para gerenciar o painel.",
                    flags: EPHEMERAL
                });
            }

            await interaction.deferReply({ flags: EPHEMERAL });

            const result = await tickets.ensurePanel({
                forceNew: interaction.options.getBoolean("recriar") || false
            });

            return interaction.editReply({
                content: result.ok
                    ? `✅ Painel ${result.created ? "publicado" : "atualizado"} em <#${result.channel.id}>.`
                    : result.error
            });
        }

        // As demais ações só funcionam dentro de um ticket
        const ticket = tickets.getTicketForChannel(interaction.channel);

        if (!ticket) {
            return interaction.reply({
                content: "❌ Este comando só pode ser usado dentro de um ticket ativo.",
                flags: EPHEMERAL
            });
        }

        // ==========================================
        // /ticket fechar
        // ==========================================

        if (sub === "fechar") {
            if (!tickets.canManageTicket(member, ticket)) {
                return interaction.reply({
                    content: "❌ Apenas o autor do ticket ou a equipe pode fechá-lo.",
                    flags: EPHEMERAL
                });
            }

            await interaction.reply({
                content: "🔒 Encerrando o ticket...",
                flags: EPHEMERAL
            });

            const result = await tickets.closeTicket(
                interaction.channel,
                interaction.user,
                interaction.options.getString("motivo")
            );

            if (!result.ok && result.error) {
                await interaction.followUp({ content: result.error, flags: EPHEMERAL }).catch(() => {});
            }
            return;
        }

        // ==========================================
        // /ticket adicionar | remover (somente equipe)
        // ==========================================

        if (!tickets.isStaff(member)) {
            return interaction.reply({
                content: "❌ Apenas a equipe pode gerenciar os participantes do ticket.",
                flags: EPHEMERAL
            });
        }

        const usuario = interaction.options.getUser("usuario");

        if (usuario.bot) {
            return interaction.reply({
                content: "❌ Não é possível adicionar ou remover bots do ticket.",
                flags: EPHEMERAL
            });
        }

        try {
            if (sub === "adicionar") {
                const alvo = await interaction.guild.members.fetch(usuario.id).catch(() => null);

                if (!alvo) {
                    return interaction.reply({
                        content: "❌ Esse usuário não está no servidor.",
                        flags: EPHEMERAL
                    });
                }

                await tickets.addUserToTicket(interaction.channel, usuario);

                return interaction.reply({
                    content: `✅ ${usuario} foi adicionado ao ticket por ${interaction.user}.`,
                    allowedMentions: { users: [usuario.id] }
                });
            }

            if (sub === "remover") {
                if (usuario.id === ticket.ownerId) {
                    return interaction.reply({
                        content: "❌ Não é possível remover o autor do ticket. Use `/ticket fechar`.",
                        flags: EPHEMERAL
                    });
                }

                await tickets.removeUserFromTicket(interaction.channel, usuario);

                return interaction.reply({
                    content: `✅ ${usuario} foi removido do ticket.`,
                    allowedMentions: { parse: [] }
                });
            }
        } catch (error) {
            console.error(`❌ Erro em /ticket ${sub}:`, error);

            return interaction.reply({
                content: error?.code === 50013
                    ? "❌ Não tenho permissão para alterar as permissões deste canal (preciso de **Gerenciar Cargos/Permissões**)."
                    : "❌ Não foi possível concluir a ação.",
                flags: EPHEMERAL
            });
        }
    }
};
