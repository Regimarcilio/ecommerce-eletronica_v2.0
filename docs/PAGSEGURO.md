# PagSeguro (PagBank) — Integração

Ref oficial: https://developer.pagbank.com.br/reference/introducao

## Ambientes

| Ambiente | Base URL | Quando usar |
|---|---|---|
| Sandbox (teste) | `https://sandbox.api.pagseguro.com` | Desenvolvimento, E2E, homologação (`PGS_SANDBOX=true`) |
| Produção | `https://api.pagseguro.com` | Loja no ar (`PGS_SANDBOX=false` + token de produção) |

Sandbox e produção usam **tokens distintos** (formato Connect, 5 blocos). Um token válido
retorna `404` num `GET /orders/:id-inexistente` (autenticado); token inválido retorna `401`.

## Variáveis de ambiente (`backend/.env` — nunca commitar)

| Var | Descrição |
|---|---|
| `PGS_EMAIL` | E-mail da conta PagSeguro |
| `PGS_TOKEN` | Token Connect (sandbox ou produção, conforme `PGS_SANDBOX`) |
| `PGS_WEBHOOK_TOKEN` | Segredo do webhook (valida `Authorization: Bearer` ou `?token=`) |
| `PGS_SANDBOX` | `true` = sandbox, `false`/`ausente` = produção |
| `API_PUBLIC_URL` | URL pública **https** do backend (exigida p/ `notification_urls`; `localhost` é rejeitado pela API) |

Alternativa ao `.env`: segredo `pagseguro_token` cifrado via painel admin
(`PUT /api/config/loja` → `segredos`, chave `SETTINGS_KEY` no `.env`).
Prioridade: `PGS_TOKEN` do `.env` primeiro, depois segredo do painel, senão **mock**.

## Fluxo (PIX via Orders API)

```
checkout.html → POST /pedidos → payStep (aba PagSeguro)
  → POST /api/pagamentos/pagseguro/intent { pedidoId }
  → POST {PGS_API}/orders { reference_id, customer{tax_id}, items[], qr_codes[], notification_urls? }
  → QR + copia-e-cola na tela (com validade)
  → cliente paga → webhook (ou polling) → pedido `pendente` → `pago` + WhatsApp
```

## Regras da API (validadas em produção/sandbox)

1. **`customer.tax_id` obrigatório** — CPF (11 dígitos) ou CNPJ (14). Sem ele: `400`.
   O intent retorna `400 "Informe o CPF/CNPJ para pagar com PagSeguro"`;
   o frontend volta ao formulário com foco no campo CPF.
2. **`notification_urls` só com https público** — `localhost` retorna
   `400 "invalid notification url"`. Sem `API_PUBLIC_URL` https, o campo é
   omitido e o status é apurado por polling (`GET /api/pagamentos/:pedidoId`).
3. Valores em **centavos** (`unit_amount`, `amount.value`); `reference_id` ≤ 64 chars.
4. `qr_codes[].expiration_date` ISO (24h a partir da criação); exibida na tela.

## Rotas do backend

| Rota | Acesso | Descrição |
|---|---|---|
| `POST /api/pagamentos/pagseguro/intent` | dono/admin, pedido `pendente` | Cria cobrança; `409` se já processado; `400` sem CPF |
| `POST /api/pagamentos/pagseguro/webhook` | público | Sem `PGS_WEBHOOK_TOKEN`: modo teste `{pedidoId,status}`. Com token: valida Bearer/`?token=`, confirma `PAID/APPROVED/AUTHORIZED` |
| `GET /api/pagamentos/:pedidoId` | dono/admin | Polling ("Já paguei — verificar status") |
| `GET /api/pagamentos?provedor=&status=&modo=` | admin | Auditoria de intents com dados do pedido |
| `GET /api/config/loja/public` | público | Flags `pagseguroAtivo`, `mpAtivo` (sem segredos) |

Confirmação idempotente em `confirmaPagamento(pedidoId, aprovado, ref, 'pagseguro')`.

## Testes

- `test/e2e/12-pagseguro.test.js`: intent (mock `200` / real `200`), caso sem CPF
  (`200` mock / `400` real), visibilidade ao dono, webhook aprova + idempotência, `409`.
- Com token sandbox no `.env`, a suíte roda em **modo real** (gera `ORDE_*` de teste).

## Frontend (`checkout.html`)

Aba PagSeguro na etapa de pagamento: status ativo/demo, botão "Gerar cobrança",
QR + `textarea` copia-e-cola + validade, botão "Já paguei — verificar status",
links WhatsApp da loja e "Meus pedidos".
