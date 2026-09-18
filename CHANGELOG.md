# Changelog — TechStore (`ecommerce-eletronica_v2.0`)

Formato: `tipo(escopo): descricao` (Conventional Commits). Historico completo em `git log`.

## v1.2.0 — 2026-09-18 — Placas de TV (principal/fonte/tcom)
- Produto: `tipoPlaca` (PRINCIPAL/FONTE/TCOM), `marca`, `modeloTV`, `dimensoes {c,l,a}`; filtros `GET /produtos?tipoPlaca=&marca=&modelo=&q=` (q busca nome/sku/modelo)
- Landing `placas.html` vira **PlacaTV**: chips por tipo, chips por marca, busca por modelo, badges + compatibilidade nos cards, carrossel só de placas em destaque, guia "como achar sua placa"
- Dashboard: modal produto com Tipo/Marca/Modelo TV
- Seed: categoria `Placas de TV` + 9 produtos (LG/Samsung/Philco × principal/fonte/tcom)
- Testes: `10-placas-tv.test.js` (5 casos) — 49 unit + 60 E2E verdes

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
