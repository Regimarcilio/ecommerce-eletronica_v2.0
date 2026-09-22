# Request - Mercado Pago OAuth Flow (Projeto ecommerce-eletronica)

Este documento descreve os requests (requisições) necessários para integrar o Mercado Pago neste projeto,
utilizando o fluxo OAuth implementado no backend.

## Visão Geral

O projeto possui integração OAuth com Mercado Pago, permitindo que o lojista conecte sua conta sem
expor o access token diretamente. Os tokens são armazenados cifrados nos segredos do sistema.

### Endpoints Disponíveis

| Método | Endpoint | Descrição |
|--------|----------|-----------|
| `GET` | `/api/pagamentos/mercadopago/oauth/url` | Retorna URL de autorização para o lojista conectar sua conta |
| `POST` | `/api/pagamentos/mercadopago/oauth/token` | Troca o código de autorização por tokens (access/refresh) |
| `GET` | `/api/pagamentos/mercadopago/oauth/status` | Verifica status da conexão (conectado, expira em...) |

---

## 1. Obter URL de Autorização

### Request
```bash
GET http://localhost:5010/api/pagamentos/mercadopago/oauth/url
```

### Response (200)
```json
{
  "success": true,
  "url": "https://auth.mercadopago.com.br/authorization?client_id=1234567890123456&response_type=code&platform_id=mp&redirect_uri=https%3A%2F%2Fwww.sualoja.com.br%2Fdashboard.html&state=a1b2c3d4e5f6",
  "redirectUri": "https://www.sualoja.com.br/dashboard.html"
}
```

### Fluxo
1. O frontend direciona o lojista para a `url` retornada
2. O lojista autoriza no Mercado Pago
3. O Mercado Pago redireciona de volta para `redirect_uri` com o parâmetro `code`
4. O frontend/envia o `code` para o passo 2

---

## 2. Trocar Código por Tokens

### Request
```bash
POST http://localhost:5010/api/pagamentos/mercadopago/oauth/token
```

**Body (JSON):**
```json
{
  "grant_type": "authorization_code",
  "code": "TG-XXXXXXXX-241983636"
}
```

### Response (200)
```json
{
  "success": true,
  "oauth": {
    "viaEnv": false,
    "conectado": true,
    "temRefresh": true,
    "userIdConfigurado": true,
    "clientConfigurado": true,
    "clientSecretConfigurado": true,
    "expiraEm": "2026-03-15T14:30:00Z"
  }
}
```

### Observações
- Os tokens (`mp_access_token`, `mp_refresh_token`, `mp_user_id`) são armazenados cifrados
- Nunca são retornados ao cliente em texto puro
- `conectado: true` indica que a conta está ativa e pode ser usada nos pagamentos
- `clientConfigurado` e `clientSecretConfigurado` indicam se o Client ID/Secret foram configurados

### Fluxo Refresh (único uso)
```bash
POST http://localhost:5010/api/pagamentos/mercadopago/oauth/token
```
**Body:**
```json
{
  "grant_type": "refresh_token",
  "refresh_token": "TG-XXXXXXXX-241983636"
}
```
- Refresh tokens podem ser usados apenas **uma vez**
- Só funcionam para o `client_id` associado

---

## 3. Verificar Status da Conexão

### Request
```bash
GET http://localhost:5010/api/pagamentos/mercadopago/oauth/status
```

### Response (200)
```json
{
  "success": true,
  "oauth": {
    "conectado": true,
    "temRefresh": true,
    "userId": 241983636,
    "clientConfigurado": true,
    "clientSecretConfigurado": true,
    "expiraEm": "2026-03-15T14:30:00Z"
  }
}
```

### Campos
- `conectado`: `true` quando o token está válido e a conta está ativa
- `temRefresh`: `true` se existe refresh token disponível
- `userId`: ID do usuário na conta Mercado Pago
- `clientConfigurado`: se o Client ID foi configurado (via dashboard ou .env)
- `clientSecretConfigurado`: se o Client Secret foi configurado

---

## Prioridade de Token em Tempo de Execução

1. `MP_ACCESS_TOKEN` do `.env` (token direto `APP_USR-...`)
2. Segredo cifrado `mp_access_token` (gravado via OAuth no painel)
3. **Mock** (modo demonstração, sem token configurado)

Sem token: o checkout roda em demonstração e os intents retornam `modo: 'mock'`.

---

## Exemplos de Curl

### 1. Obter URL de Autorização
```bash
curl -X GET \
  http://localhost:5010/api/pagamentos/mercadopago/oauth/url
```

### 2. Exchanged Code por Tokens
```bash
curl -X POST \
  http://localhost:5010/api/pagamentos/mercadopago/oauth/token \
  -H 'Content-Type: application/json' \
  -d '{"grant_type": "authorization_code", "code": "TG-XXXXXXXX-241983636"}'
```

### 3. Verificar Status
```bash
curl -X GET \
  http://localhost:5010/api/pagamentos/mercadopago/oauth/status
```