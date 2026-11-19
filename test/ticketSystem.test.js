const assert = require("assert");
const fs = require("fs");
const path = require("path");

const { TicketStore } = require("../src/tickets/store");
const { generateTranscript, escapeHtml } = require("../src/tickets/transcript");
const ui = require("../src/tickets/ui");
const { _internal } = require("../src/tickets");
const { loadCommands, toPayload } = require("../src/commandLoader");
const config = require("../src/config");

console.log("🧪 Iniciando bateria de testes...\n");

// ==========================================
// TESTE 1: TicketStore (Persistência e Contador)
// ==========================================
console.log("➡️ Teste 1: TicketStore...");
const testDbPath = path.join(__dirname, "temp-test-tickets.json");
try { if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath); } catch {}

const store = new TicketStore(testDbPath);
assert.strictEqual(store.counter, 0, "Contador inicial deve ser 0");

const n1 = store.nextNumber();
assert.strictEqual(n1, 1, "Primeiro número deve ser 1");
const n2 = store.nextNumber();
assert.strictEqual(n2, 2, "Segundo número deve ser 2");

store.upsert({
    channelId: "111222333444555",
    guildId: "999888777",
    number: 1,
    type: "compras",
    typeLabel: "Comprar",
    ownerId: "123456789012345678",
    ownerTag: "usuario_teste#0000",
    status: "open",
    createdAt: new Date().toISOString()
});

const found = store.findOpen("123456789012345678", "compras");
assert.ok(found, "Ticket deve ser encontrado como aberto");
assert.strictEqual(found.number, 1);

store.bumpCounter(50);
assert.strictEqual(store.counter, 50, "Contador deve ter subido para 50");
assert.strictEqual(store.nextNumber(), 51, "Próximo número deve ser 51");

// Teste de recarga do arquivo
const storeReloaded = new TicketStore(testDbPath);
assert.strictEqual(storeReloaded.counter, 51, "Contador deve persistir após recarga");
assert.ok(storeReloaded.get("111222333444555"), "Ticket deve persistir após recarga");

storeReloaded.markClosed("111222333444555", { closedBy: "admin1", reason: "resolvido" });
assert.strictEqual(storeReloaded.get("111222333444555").status, "closed", "Ticket deve ser fechado");
assert.strictEqual(storeReloaded.listOpen().length, 0, "Não deve haver tickets abertos");

try { if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath); } catch {}
console.log("✅ Teste 1 concluído com sucesso!");

// ==========================================
// TESTE 2: Metadados no tópico e slugify
// ==========================================
console.log("\n➡️ Teste 2: Metadados de tópico e formatação de nomes...");
const mockTicket = { number: 7, ownerId: "123456789012345678", ownerTag: "Maria_Silva" };
const mockType = { id: "suporte", label: "Suporte" };
const topic = _internal.buildTopic(mockTicket, mockType);
assert.ok(topic.includes("ref:ticket:suporte:123456789012345678:7"), "Tópico deve conter os metadados de referência");

const parsed = _internal.parseTopic(topic);
assert.deepStrictEqual(parsed, { type: "suporte", ownerId: "123456789012345678", number: 7 });

assert.strictEqual(_internal.slugify("João da Silva!"), "joao-da-silva");
assert.strictEqual(_internal.slugify("___Lucas___"), "lucas");
assert.strictEqual(_internal.slugify(""), "usuario");
console.log("✅ Teste 2 concluído com sucesso!");

// ==========================================
// TESTE 3: UI e Painel
// ==========================================
console.log("\n➡️ Teste 3: Componentes de UI...");
const panelPayload = ui.buildPanel({ name: "Servidor Exemplo", iconURL: () => null }, config.tickets.types);
assert.ok(panelPayload.embeds.length === 1, "Painel deve conter 1 embed");
assert.ok(panelPayload.components.length === 1, "Painel deve conter 1 row de componentes");
const selectMenu = panelPayload.components[0].components[0];
assert.strictEqual(selectMenu.data.custom_id, ui.IDS.OPEN_SELECT, "CustomId deve ser o fixo de abertura");
assert.strictEqual(selectMenu.options.length, 4, "Deve conter as 4 opções (compras, suporte, denuncias, parcerias)");

const welcome = ui.buildTicketWelcome({
    ownerId: "123",
    number: 1,
    createdAt: new Date().toISOString(),
    status: "open"
}, mockType, { name: "Servidor", iconURL: () => null });
assert.ok(welcome.embeds.length === 1, "Boas-vindas deve conter 1 embed");
assert.ok(welcome.components.length === 1, "Boas-vindas deve conter botões");
const buttons = welcome.components[0].components;
assert.strictEqual(buttons[0].data.custom_id, ui.IDS.CLOSE, "Primeiro botão deve ser fechar");
console.log("✅ Teste 3 concluído com sucesso!");

// ==========================================
// TESTE 4: Transcript HTML
// ==========================================
console.log("\n➡️ Teste 4: Gerador de Transcript HTML...");
const escaped = escapeHtml("<script>alert('xss')</script>&\"'");
assert.strictEqual(escaped, "&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;&amp;&quot;&#39;");

const mockChannel = {
    id: "999000",
    name: "ticket-1-joao",
    messages: {
        fetch: async () => new Map([
            ["m1", {
                id: "m1",
                content: "Olá equipe, preciso de ajuda com um produto!",
                author: { id: "u1", tag: "Joao#0001", username: "joao", bot: false, displayAvatarURL: () => "http://avatar" },
                createdAt: new Date(),
                embeds: [],
                attachments: new Map()
            }]
        ])
    }
};

(async () => {
    const transcript = await generateTranscript(mockChannel, {
        number: 1,
        typeLabel: "Suporte",
        ownerTag: "Joao#0001",
        ownerId: "u1"
    });
    assert.ok(transcript.buffer.length > 0, "Buffer não pode ser vazio");
    assert.strictEqual(transcript.messageCount, 1, "Deve conter 1 mensagem");
    assert.ok(transcript.buffer.toString("utf8").includes("Olá equipe, preciso de ajuda"), "HTML deve conter o texto da mensagem");
    console.log("✅ Teste 4 concluído com sucesso!");

    // ==========================================
    // TESTE 5: Carregamento de comandos
    // ==========================================
    console.log("\n➡️ Teste 5: Carregamento de Comandos...");
    const cmds = loadCommands({ verbose: false });
    assert.ok(cmds.size >= 15, `Deve ter pelo menos 15 comandos (encontrados: ${cmds.size})`);
    assert.ok(cmds.has("ticket"), "Comando /ticket deve existir");
    assert.ok(cmds.has("banir"), "Comando /banir deve existir");
    assert.ok(cmds.has("anttigre"), "Comando /anttigre deve existir");
    assert.ok(cmds.has("anuncio"), "Comando /anuncio deve existir");

    const payload = toPayload(cmds);
    assert.strictEqual(payload.length, cmds.size, "Payload JSON deve coincidir com comandos");
    console.log("✅ Teste 5 concluído com sucesso!");

    console.log("\n🎉 TODOS OS TESTES PASSARAM COM SUCESSO!\n");
})();
