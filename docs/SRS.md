# SRS — Software Requirements Specification: TechStore / PlacaShop

Versão 1.0 · 2026-09-17 · Estilo IEEE 830 (técnico direto).
Escopo: sistema implementado + itens `[FUTURO]` (MP intent, envio WhatsApp).
Referências de design: `docs/SDS_ABNT.md`. Avaliação: `docs/AVALIACAO.md`. Protótipos: `docs/prototipo/`.

## 1. Introdução

### 1.1 Propósito
Especificar os requisitos do e-commerce TechStore (vitrine) e da landing-exemplo PlacaShop (multi-ramo), cobrindo catálogo, carrinho, checkout, pedidos, conta, admin e observabilidade, para guiar uso, testes e evolução.

### 1.2 Escopo
Dentro: tudo da seção 3 marcado sem tag. `[FUTURO]`: cobrança real e disparo WhatsApp (só pareamento existe).

### 1.3 Definições
`RF` funcional, `RNF` não-funcional, `RN` regra de negócio, RBAC por `role`, access JWT 15min + refresh opaco rotativo.

### 1.4 Atores
Visitante (catalogo), Cliente (conta/pedidos), Administrador (gestão total).

## 2. Descrição geral

### 2.1 Perspectiva
Cliente-servidor: frontend estático (HTML/JS/Bootstrap, `js/config.js` com `API_BASE` dinâmica) + API REST Node/Express + MongoDB. Sem SSR, sem cache de frontend (revalidação por deploy).

### 2.2 Restrições
Node 20, Mongo 7, `express.json` máx 100kb, payload validado, segredos só em `.env` (nunca via API).

### 2.3 Premissas
Admin bootstrap via `ADMIN_*`; `SETTINGS_KEY` (64 hex) p/ cifrar segredos do dashboard; Evolution/MP configurados fora do código.

## 3. Requisitos funcionais

### 3.1 Catálogo
- RF-001: listar categorias ativas com ícone e paginação.
- RF-002: listar produtos ativos com paginação (`page/limit`, meta `total/pages`), filtro por categoria e busca por nome/SKU.
- RF-003: exibir ficha (título, descrição, foto URL ou ícone, valor, estoque) e badge de disponibilidade.
- RF-004: carrossel de `destaque` (máx 5, oculto se vazio) na landing PlacaShop.
- RF-005: landing separada por ramo sobre a mesma API (prova multi-ramo).

### 3.2 Carrinho e checkout
- RF-006: carrinho local com merge de quantidade, limite 1–99 e frete (grátis > R$100, senão R$20).
- RF-007: checkout autenticado com validação (e-mail, pagamento, endereço completo), endereço salvo selecionável e condições dinâmicas (`/config/loja/public`).
- RF-008: pedido criado com totais **recalculados no servidor** e baixa atômica de estoque (409 se insuficiente/concorrente).
- RF-009 `[FUTURO]`: cobrança Mercado Pago (intent → `init_point`/QR → webhook `pendente→pago`).
- RF-010 `[FUTURO]`: resumo do pedido no WhatsApp do cliente via Evolution (retry, sem quebrar o pedido).

### 3.3 Conta e sessão
- RF-011: cadastro/login com JWT; senha mín 8 e hash bcrypt.
- RF-012: sessão com access 15min + refresh rotativo de uso único; logout revoga; guards renovam proativamente.
- RF-013: recuperar senha por token único (anti-enumeração; entrega por e-mail em produção).
- RF-014: perfil (nome/telefone; e-mail imutável), troca de senha com atual, CRUD de endereços (CEP/UF validados, isolamento por usuário).

### 3.4 Pedidos do cliente
- RF-015: listar próprios pedidos paginados + detalhe (itens, endereço, pagamento, totais); 403 contra acesso cruzado.

### 3.5 Administração
- RF-016: CRUD produtos (ficha completa + foto URL + destaque) e categorias (slug, ícone da `ICON_LIB` ~130/12 segmentos, também no cadastro rápido).
- RF-017: listar pedidos (todos), detalhe e troca de status (whitelist).
- RF-018: listar clientes (sem senha) e ver indicadores + saúde da API (`/metrics`).
- RF-019: página Configurações (WhatsApp, condições/pagar, segredos cifrados mascarados) + status de pareamento MP/WhatsApp.

## 4. Requisitos não-funcionais

- RNF-01 Segurança: hash bcrypt(10), RBAC + usuário ativo, helmet, CORS restrito, rate-limit (login/register 20, refresh 30, forgot+reset 10/15min), erros sem stack, segredos fora do git (histórico purgado).
- RNF-02 Robustez frontend: `escapeHtml`/`safeIcon`/`safeImg`/`truncate`, null-safe, `ObjectId` validado, `innerHTML` sem interpolação crua.
- RNF-03 Paginação em todas as listagens com back-step e meta.
- RNF-04 Observabilidade: logs JSON por request, contadores, `/health` público, `/api/metrics` admin.
- RNF-05 Portabilidade: compose com healthchecks; CI (unit, E2E c/ Mongo, build, lint anti-`/api` duplicado).

## 5. Regras de negócio (resumo; íntegra no SDS §13)

RN01 e-mail único · RN02 hash · RN03 novo usuário `user` · RN04 admin bootstrap · RN05 SKU único · RN06 categoria única · RN07 pedido ao autenticado · RN08-10 visibilidade/status · RN11 `pendente` inicial · RN12 frete (>100 grátis senão 20) · RN13 desconto PIX por `descontoPix` do Settings (padrão 5) · RN14 métodos pix/card/boleto · RN15 carrinho local · RN16 descrição opcional máx 2000 escapada · RN17 publicação imediata · RN18 foto URL validada · RN19 ícone allowlist · RN20 segredos cifrados/mascarados · RN21 paginação ubíqua · RN22 rate-limits · RN23 refresh uso único · RN24 reset uso único + anti-enumeração.

## 6. Interfaces externas

- MongoDB via Mongoose; Evolution (`/instance/connectionState`, `/message/sendText`) `[FUTURO envio]`; Mercado Pago (users/me, preferências, webhooks) `[FUTURO]`; navegador moderno.

## 7. Rastreabilidade (amostra; matriz E2E completa no SDS §17)

| RF | Endpoint(s) | Tela(s) | Teste |
|---|---|---|---|
| RF-002/003 | `GET /produtos`, `/categorias` | index, placas, categoria | e2e-02 |
| RF-008 | `POST /pedidos` | checkout | e2e-03 |
| RF-012/013 | `/auth/*` | auth, guards | e2e-01/05 |
| RF-014 | `/auth/me`, `/password`, `/enderecos` | minha-conta | e2e-01/03 |
| RF-016 | `/produtos`, `/categorias` | dashboard | e2e-02 |
| RF-019 | `/config/*` | dashboard config, checkout | e2e-06 |
| RF-004 | (filtro client) | placas | unit carrossel |
