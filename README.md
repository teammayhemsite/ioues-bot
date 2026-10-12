[README.md](https://github.com/user-attachments/files/33354756/README.md)
# Discord Bot (Moderação + Call 24/7 + Logs do Aevix Keys)

Bot de moderação, permanência em canal de voz 24/7 e receptor seguro de logs de atividades do sistema **Aevix Keys**.

## Canal de Logs Configurado

- **Canal de destino:** `1558873432769298522` (padrão configurado em `LOG_CHANNEL_ID`).
- Publica embeds estruturados nas cores verde, amarelo e vermelho com dados reais e formatação idêntica aos padrões de log de auditoria.

## Novas Variáveis de Ambiente no Render

Além das variáveis que você já utilizava no Render:
- `LOG_CHANNEL_ID`: `1558873432769298522` (opcional caso queira mudar no futuro).
- `AEVIX_LOG_SECRET`: Segredo de autenticação HTTP opcional para proteger requisições de log contra acessos não autorizados.

## Endpoint de Auditoria HTTP

O servidor HTTP integrado no bot expõe a rota `POST /api/log`:
- Recebe eventos confirmados pelo painel e despacha instantaneamente para o canal de texto do Discord.
- Trata requisições OPTIONS (CORS) e validação de tokens com proteção contra sobrecarga.
