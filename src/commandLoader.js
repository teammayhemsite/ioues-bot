const fs = require("fs");
const path = require("path");

const COMMANDS_DIR = path.join(__dirname, "..", "commands");

/**
 * Carrega recursivamente todos os comandos da pasta /commands.
 * Um arquivo é um comando válido se exportar `data` (SlashCommandBuilder) e `execute`.
 * Nomes duplicados são ignorados com aviso, evitando conflitos silenciosos.
 *
 * @param {object} [options]
 * @param {boolean} [options.verbose=true]
 * @returns {Map<string, object>} nome -> módulo do comando
 */
function loadCommands({ verbose = true } = {}) {
    const commands = new Map();

    if (!fs.existsSync(COMMANDS_DIR)) {
        console.error(`❌ Pasta de comandos não encontrada: ${COMMANDS_DIR}`);
        return commands;
    }

    const walk = directory => {
        for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
            const fullPath = path.join(directory, entry.name);

            if (entry.isDirectory()) {
                walk(fullPath);
                continue;
            }

            if (!entry.name.endsWith(".js")) continue;

            try {
                const command = require(fullPath);

                if (!command?.data || typeof command.execute !== "function") {
                    console.warn(`⚠️ Comando ignorado: ${entry.name} (precisa exportar "data" e "execute").`);
                    continue;
                }

                const name = command.data.name;
                if (commands.has(name)) {
                    console.warn(`⚠️ Comando duplicado ignorado: /${name} (${entry.name}).`);
                    continue;
                }

                commands.set(name, command);
                if (verbose) console.log(`Comando carregado: ${name}`);
            } catch (error) {
                console.error(`❌ Erro ao carregar o comando ${entry.name}:`, error);
            }
        }
    };

    walk(COMMANDS_DIR);
    return commands;
}

/**
 * Converte os comandos carregados no payload JSON aceito pela API do Discord.
 */
function toPayload(commands) {
    return [...commands.values()].map(cmd => cmd.data.toJSON());
}

module.exports = {
    loadCommands,
    toPayload
};
