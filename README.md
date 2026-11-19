[README.md](https://github.com/user-attachments/files/35094302/README.md)
# 🤖 Discord Bot — Aevix Management & Tickets

Bot completo para o Discord desenvolvido com **discord.js v14**, operando em **Node.js 20+** com arquitetura modular, persistência de tickets resiliente a reinicializações (ideal para ambientes em nuvem como **GitHub + Render + UptimeRobot**), moderação avançada, canal de voz 24/7 e receptor seguro de logs do sistema **Aevix Keys**.

---

## 🚀 Funcionalidades Principais

### 1. 🎫 Sistema Completo de Atendimento (Tickets)
- **Painel Visual Permanente:** Publicado no canal `1433174225153298513` ("Central de Atendimento") com Select Menu interativo e emojis.
- **Categorias Automáticas:** Cada ticket é criado estritamente na categoria correspondente:
  - 🛒 **Compras:** Categoria `1572982188096356445`
  - 🎧 **Suporte:** Categoria `1572981922009841665`
  - ⚠️ **Denúncias:** Categoria `1572982012195770510`
  - 🤝 **Parcerias:** Categoria configurável via `TICKET_CATEGORY_PARCERIAS` (ou detecção inteligente pelo nome).
- **Nomenclatura Sequencial Persistente:** Formato `ticket-1-usuario`, `ticket-2-usuario`, etc. O contador sobrevive a reinicializações e recupera números automaticamente via canais e logs.
- **Prevenção de Duplicatas e Spam:** O usuário não consegue abrir múltiplos tickets do mesmo tipo e há um cooldown de proteção contra cliques repetidos.
- **Permissões Rigorosas:** Canal privado acessível exclusivamente pelo autor, cargos administrativos/equipe e pelo próprio bot.
- **Ações no Ticket:**
  - 🔒 **Fechar Ticket:** Com confirmação em duas etapas para evitar cliques acidentais.
  - 🙋 **Assumir Atendimento:** Permite a um membro da equipe reivindicar o atendimento.
  - 📄 **Transcript HTML Completo:** Gera arquivo `.html` estilizado (tema escuro Discord) com todo o histórico de mensagens, links, anexos e avatares, enviado no canal de logs e na DM do usuário.
- **Comando Administrativo `/ticket`:**
  - `/ticket painel [recriar]`: Publica ou sincroniza o painel interativo.
  - `/ticket fechar [motivo]`: Encerra o ticket atual.
  - `/ticket adicionar [usuario]`: Adiciona um membro ao ticket.
  - `/ticket remover [usuario]`: Remove um membro do ticket.

---

### 2. 🛡️ Moderação & Segurança Aprimorada
- `/anttigre`: Castigo de 7 dias no usuário, exclusão de mensagens das últimas 24h em todos os canais e aviso público no canal configurado (`1559996459603075212`).
- `/banir` & `/kick`: Com validação completa de hierarquia de cargos (impede abusos entre moderadores e protege administradores/dono).
- `/desbanir`: Desbane com validação estrita de Snowflake ID (17 a 20 dígitos).
- `/limpar`: Exclusão em massa segura de mensagens com tratamento contra mensagens com mais de 14 dias (limitação do Discord).
- `/setcargo` & `/removercargo`: Adiciona e remove cargos com verificação de cargos gerenciados por integrações e hierarquia de cargos do executor e do bot.

---

### 3. 📢 Mensagens Personalizadas & Utilidades
- `/anuncio`: Cria e envia comunicados padronizados com títulos, imagens, cores e botões de link.
- `/bemvindo`: Envia mensagens estilizadas de boas-vindas com avatar e menção do novo membro.
- `/embed`: Construtor flexível de embeds com suporte a autor, rodapé, miniatura e botões.
- `/avatar` & `/banner`: Visualização em alta resolução (4096px) de perfis.
- `/servidor` & `/usuario`: Painéis com estatísticas detalhadas e datas formatadas com carimbo de tempo nativo do Discord (`<t:timestamp:F>`).

---

### 4. 🏷️ Sistema Automático de Cargo por Tag (Primary Guild)
- Detecta a ativação da tag do servidor no perfil do usuário (`user.primary_guild` / `user.clan`) em tempo real via Gateway raw packets, `guildMemberUpdate` e `userUpdate`.
- Atribui automaticamente o cargo configurado (`1555852510139383919`) e remove quando o usuário desativa a tag.
- Registra cada alteração em canal exclusivo de logs (`1559996459603075212`).

---

### 5. 🔊 Canal de Voz 24/7
- Permanência contínua no canal de voz especificado com reconexão automática com backoff exponencial se houver queda de rede ou desconexão manual.

---

### 6. 🌐 Servidor HTTP Integrado (Render Web Service + UptimeRobot)
- **Rotas:**
  - `GET /` e `GET /health`: Responde com status online, uptime e servidores (usado pelo UptimeRobot para manter o bot sempre ativo sem dormir no Render).
  - `POST /api/log`: Endpoint seguro com token `x-aevix-secret` para receber eventos externos do sistema Aevix Keys e despachar diretamente no canal de auditoria do Discord (`1558873432769298522`).

---

## 🛠️ Como Iniciar e Configurar

### 1. Instalação Local
```bash
npm install
npm test
npm start
```

### 2. Registrar Comandos Slash
Os comandos slash são registrados automaticamente ao iniciar o bot. Caso queira forçar a sincronização imediata manualmente:
```bash
npm run deploy
```

### 3. Variáveis de Ambiente (.env)
Consulte o arquivo [.env.example](.env.example) para a lista detalhada de todas as variáveis disponíveis.
