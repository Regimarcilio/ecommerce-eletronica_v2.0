# E-mail de notificação de venda (SMTP ou Gmail API)

O backend envia o e-mail de venda em `confirmaPagamento()` (após o WhatsApp).
Sem credenciais, só registra `warn` no log — o pagamento **não quebra**.

## Opções (`emailService` em Configurações → Loja, ou `backend/.env`)

| Serviço | Onde configura | Envio |
|---|---|---|
| `smtp` (padrão) | `SMTP_HOST/PORT/USER/PASS` no `backend/.env` (+ `smtp_pass` cifrado vale) e `emailLoja` no painel | nodemailer |
| `google` | `GOOGLE_CLIENT_ID/SECRET/REFRESH_TOKEN` no `backend/.env` **ou** Client ID no painel + `google_client_secret`/`google_refresh_token` cifrados | Gmail REST `users.messages.send` |
| `outlook` | ainda não implementado (cai para SMTP com aviso) | — |

Remetente: `EMAIL_FROM` do `.env` ou **e-mail da loja** do painel.

## Gmail passo a passo (só Gmail nesta fase)

1. O arquivo `docs/client_secret*.json` (baixado do Google Cloud) já está no projeto — **nunca commitar** (está no `.gitignore`).
2. Copie para `backend/.env`:
   `GOOGLE_CLIENT_ID=<client_id do arquivo>`
   `GOOGLE_CLIENT_SECRET=<client_secret do arquivo>`
3. Ative a **Gmail API** no projeto (Google Cloud → APIs e serviços → Biblioteca → Gmail API → Ativar).
4. Gere o refresh token (escopo `https://www.googleapis.com/auth/gmail.send`):
   - Abra https://developers.google.com/oauthplayground
   - Engrenagem → marque "Use your own OAuth credentials" → cole Client ID e Secret
   - Na lista, ache **Gmail API v1** → marque `https://www.googleapis.com/auth/gmail.send` → Authorize APIs → faça login na conta da loja → Exchange authorization code for tokens
   - Copie o **Refresh token** para `GOOGLE_REFRESH_TOKEN` no `backend/.env`
     (ou cole no painel: Configurações → Loja → Google Refresh Token — fica cifrado)
5. No painel, selecione serviço **Gmail (API Google)** e salve. No próximo pagamento aprovado, o log mostra `[email] enviado via Gmail API: <id>`.

## Testes sem enviar e-mail de verdade

Sem `GOOGLE_REFRESH_TOKEN` (ou sem `SMTP_USER/SMTP_PASS`), o envio só registra aviso e retorna — os testes E2E validam esse caminho.
