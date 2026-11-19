const { MessageFlags, PermissionFlagsBits } = require("discord.js");

// Flag padrão para respostas visíveis apenas para quem executou a interação
// (substitui a opção `ephemeral: true`, depreciada no discord.js 14.27+).
const EPHEMERAL = MessageFlags.Ephemeral;

/**
 * Responde uma interação de forma segura, independente de já ter sido respondida/adiada.
 * Nunca lança exceções (interações expiradas, canal apagado etc.).
 */
async function safeReply(interaction, payload) {
    const data = typeof payload === "string"
        ? { content: payload, flags: EPHEMERAL }
        : payload;

    try {
        if (interaction.deferred && !interaction.replied) {
            // editReply não aceita flags (a visibilidade foi definida no defer)
            const { flags, ...rest } = data;
            return await interaction.editReply(rest);
        }
        if (interaction.replied) {
            return await interaction.followUp(data);
        }
        return await interaction.reply(data);
    } catch (err) {
        // 10062 = Unknown interaction (expirada) | 40060 = já reconhecida
        if (![10062, 40060].includes(err?.code)) {
            console.error("❌ [Interações] Falha ao responder interação:", err.message);
        }
        return null;
    }
}

/**
 * Verifica se o executor pode agir sobre o membro alvo respeitando a hierarquia de cargos.
 * Impede que um moderador use o bot para punir/alterar alguém com cargo igual ou superior ao seu.
 *
 * @returns {string|null} mensagem de erro ou null se permitido
 */
function checkHierarchy(interaction, targetMember, actionLabel = "realizar esta ação") {
    const guild = interaction.guild;
    const executor = interaction.member;
    const botMember = guild?.members?.me;

    if (!guild || !executor || !botMember) {
        return "❌ Não consegui verificar as permissões neste servidor.";
    }

    if (targetMember.id === interaction.user.id) {
        return `❌ Você não pode ${actionLabel} em si mesmo.`;
    }

    if (targetMember.id === guild.ownerId) {
        return `❌ Não é possível ${actionLabel} no dono do servidor.`;
    }

    if (targetMember.id === botMember.id) {
        return `❌ Não posso ${actionLabel} em mim mesmo.`;
    }

    if (targetMember.roles.highest.position >= botMember.roles.highest.position) {
        return "❌ Meu cargo precisa estar acima do cargo desse usuário.";
    }

    const executorIsOwner = interaction.user.id === guild.ownerId;
    const executorHighest = executor.roles?.highest?.position ?? 0;

    if (!executorIsOwner && targetMember.roles.highest.position >= executorHighest) {
        return "❌ Você não pode realizar esta ação em alguém com cargo igual ou superior ao seu.";
    }

    return null;
}

/**
 * Verifica se o executor pode gerenciar (atribuir/remover) um cargo específico.
 * @returns {string|null} mensagem de erro ou null se permitido
 */
function checkRoleManageable(interaction, role) {
    const guild = interaction.guild;
    const botMember = guild?.members?.me;
    const executor = interaction.member;

    if (!guild || !botMember || !executor) {
        return "❌ Não consegui verificar as permissões neste servidor.";
    }

    if (role.id === guild.id) {
        return "❌ O cargo @everyone não pode ser atribuído ou removido.";
    }

    if (role.managed) {
        return "❌ Esse cargo é gerenciado por uma integração e não pode ser alterado.";
    }

    if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return "❌ Eu não tenho a permissão **Gerenciar Cargos**.";
    }

    if (role.position >= botMember.roles.highest.position) {
        return "❌ Meu cargo precisa estar acima desse cargo.";
    }

    const executorIsOwner = interaction.user.id === guild.ownerId;
    const executorHighest = executor.roles?.highest?.position ?? 0;

    if (!executorIsOwner && role.position >= executorHighest) {
        return "❌ Você não pode gerenciar um cargo igual ou superior ao seu maior cargo.";
    }

    return null;
}

module.exports = {
    EPHEMERAL,
    safeReply,
    checkHierarchy,
    checkRoleManageable
};
