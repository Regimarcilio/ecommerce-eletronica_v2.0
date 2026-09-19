# Mercado Pago — Integração (Checkout Pro + OAuth)

Ref de credenciais: `docs/Create and refresh token.md` (endpoint `POST /oauth/token`).
Ref da API: https://www.mercadopago.com.br/developers/pt/reference

## Modos de autenticação

| Modo | Envs | Uso |
|---|---|---|
| Token direto | `MP_ACCESS_TOKEN` | Colar o `APP_USR-...` no `.env`; vale de imediato |
| OAuth (recomendado) | `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_REDIRECT_URI` | Conecta a conta sem expor token; access expira em ~180 dias e renova via refresh |

Prioridade do token em tempo de execução: `MP_ACCESS_TOKEN` do `.env` →
segredo cifrado `mp_access_token` (gravado pelo OAuth) → **mock**.
Sem token: intents retornam `modo: 'mock'` e o checkout avisa "demonstração".

## Fluxo OAuth (admin)

```
1. GET /api/pagamentos/mercadopago/oauth/url  → { url } (auth.mercadopago.com.br/authorization?...&state=...)
2. Lojista autoriza no Mercado Pago → redirect p/ MP_REDIRECT_URI?code=TG-...&state=...
3. POST /api/pagamentos/mercadopago/oauth/token { grant_type:'authorization_code', code }
   → guarda cifrado: mp_access_token, mp_refresh_token, mp_user_id, mp_token_expira_em
   → retorna { user_id, live_mode, expires_in } (nunca os segredos)
4. GET /api/pagamentos/mercadopago/oauth/status → { conectado, temRefresh, expiraEm }
```

Renovação (refresh de uso único, sem interação do lojista):

```
POST /api/pagamentos/mercadopago/oauth/token { grant_type:'refresh_token', refresh_token }
```

`code` do `authorization_code` vale **10 min**. `refresh_token` só pode ser usado
**uma vez** e só para o `client_id` associado.

## Rotas de pagamento (já existentes)

| Rota | Acesso | Descrição |
|---|---|---|
| `POST /api/pagamentos/intent` | dono/admin, pedido `pendente` | Cria preferência Checkout Pro (`initPoint`); `409` se processado |
| `POST /api/pagamentos/webhook` | público | Sem `MP_WEBHOOK_SECRET`: modo teste `{pedidoId,status}`. Com segredo: valida HMAC `x-signature` e busca o pagamento |
| `GET /api/pagamentos/:pedidoId` | dono/admin | Polling de status |
| `GET /api/config/loja/public` | público | Flag `mpAtivo` (token env ou OAuth), `mpPublicKey` |

`notification_url` da preferência só é enviada com `API_PUBLIC_URL` https
(localhost é rejeitado); sem ela, o status chega por polling.
Confirmação idempotente em `confirmaPagamento()` (`pendente` → `pago` + WhatsApp).

## Testes

Sem credenciais, tudo roda em mock (`test/e2e/08-pagamentos.test.js`).
Com token/OAuth válidos, os mesmos intents retornam `modo: 'real'`.
