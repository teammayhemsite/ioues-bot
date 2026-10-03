# Discord Bot (moderação + call 24/7)

Bot de moderação/mensagens que também entra e **permanece em um canal de voz** automaticamente, com reconexão.

## Configuração local
1. Instale o [Node.js](https://nodejs.org) 20+.
2. `npm install`
3. Copie `.env.example` para `.env` e preencha `DISCORD_TOKEN`, `GUILD_ID`, `VOICE_CHANNEL_ID`, `CLIENT_ID` e `PORT`.
4. Registre os slash commands no servidor: `npm run deploy`
5. Inicie: `npm start`

## Como descobrir os IDs
Discord > Configurações > Avançado > ative **Modo Desenvolvedor**. Depois clique com o botão direito no **servidor** (GUILD_ID) ou no **canal de voz** (VOICE_CHANNEL_ID) > **Copiar ID**.

## GitHub
Envie: `index.js`, `deploy-commands.js`, `src/`, `commands/`, `package.json`, `package-lock.json`, `.gitignore`, `.env.example`, `README.md`.
**Nunca** envie: `.env`, token, `node_modules/`.

## Render
1. New > **Web Service** > conecte o GitHub e escolha o repositório.
2. Runtime: Node. **Build Command:** `npm install` — **Start Command:** `npm start`
3. Em Environment Variables: `DISCORD_TOKEN`, `GUILD_ID`, `VOICE_CHANNEL_ID`, `CLIENT_ID`. (`PORT` o Render define sozinho.)
4. Deploy.

## UptimeRobot
Monitor HTTP(s) apontando para `https://SEU-ENDERECO-DO-RENDER/` ou `https://SEU-ENDERECO-DO-RENDER/health`. O bot não depende dele para funcionar.

## Permissões no Discord
O bot precisa estar no servidor com **Ver Canal** e **Conectar** no canal de voz (além das permissões de moderação dos comandos). Intents usados: `Guilds` e `GuildVoiceStates` (nenhum privilegiado).
