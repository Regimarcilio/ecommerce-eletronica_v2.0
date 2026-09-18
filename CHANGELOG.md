# Changelog — TechStore (`ecommerce-eletronica_v2.0`)

Formato: `tipo(escopo): descricao` (Conventional Commits). Historico completo em `git log`.

## v1.2.0 — 2026-09-18 — Placas de TV (principal/fonte/tcom)
- Produto: `tipoPlaca` (PRINCIPAL/FONTE/TCOM), `marca`, `modeloTV`, `dimensoes {c,l,a}`; filtros `GET /produtos?tipoPlaca=&marca=&modelo=&q=` (q busca nome/sku/modelo)
- Landing `placas.html` **100% nova (PlacaCerta)**: identidade própria sem Bootstrap, busca por modelo na hero, faixa de marcas, cards por tipo com diagnóstico por sintoma, **carrossel coverflow 3D** (autoplay + progresso + arraste + setas), catálogo com pills, **localizador de compatibilidade** (marca→modelo→tipo), depoimentos, garantia, FAQ
- `cart.html` e `auth.html` no tema PlacaCerta (sem Bootstrap; carrinho com badges tipo/compat, stepper, thumb real via API e escape anti-XSS; login com painel lateral)
- Dashboard: modal produto com Tipo/Marca/Modelo TV
- Seed: categoria `Placas de TV` + 9 produtos (LG/Samsung/Philco × principal/fonte/tcom)
- Testes: `10-placas-tv.test.js` (5 casos) — 49 unit + 60 E2E verdes
- Fix env: `EVO_API_URL` → `http://evolution:8080` (localhost dentro do container não alcança o Evolution; causava 502 no `/whatsapp/status`)
- Dashboard no padrão PlacaCerta (tokens âmbar/noite, Space Grotesk, logo nova; tabela de produtos com coluna Tipo + compatibilidade)

## v1.1.0 — 2026-09-16 — Hardening + sessao + observabilidade
- Seguranca backend: `helmet`, CORS restrito, rate-limit por rota (login/register 20, refresh 30, forgot+reset 10/15min), validacao de schemas, erros `{success,message,code}` sem vazar stack
- Pedidos calculados no servidor (frete/desconto/total) + baixa atomica de estoque
- Auth: access 15m + refresh opaco com rotacao, logout com revogacao, reset de senha (anti-enumeracao, uso unico)
- Conta real: `PUT /auth/me`, `PUT /auth/password`, CRUD `/auth/enderecos` (isolado por usuario)
- Frontend: `js/config.js` (API dinamica, `escapeHtml`/`safeIcon`, `apiFetch` c/ refresh, `logoutAll`), guards via `/auth/me`, pager em catalogo/categoria/dashboard/pedidos, checkout com enderecos salvos
- Infra: Dockerfiles, compose com healthchecks, `mongo:7`, `env_file` opcional, segredos fora do git (historico purgado + rotacionados)
- Qualidade: 31 testes unitarios + 31 E2E (`mongo:7` em servico no CI), CI verde (unit, e2e, compose-build)

## v1.0.0 — base
- Catalogo, carrinho (`localStorage`), checkout, pedidos, auth JWT, dashboard admin (conforme SDS inicial)
