# Avaliação geral do sistema TechStore / PlacaShop

Data: 2026-09-17 · Base: auditoria de `backend/server.js` (746 linhas, 35 endpoints) e 9 páginas frontend.

## 1. Cobertura funcional

| Área | Situação |
|---|---|
| Catálogo (vitrine, placas, categoria, busca, pager) | Completo e integrado à mesma API |
| Carrinho (`localStorage`, frete/desconto) | Completo; totais finais recalculados no servidor |
| Auth/sessão (login, refresh rotation, logout, reset) | Completo |
| Conta (perfil, senha, endereços CRUD) | Completo, sem mocks locais |
| Pedidos (criação atômica, RBAC, status) | Completo |
| Admin (produtos/categorias/clientes/pedidos/config) | Completo, com biblioteca de ícones e foto por URL |
| Observabilidade (logs JSON, `/api/metrics`, saúde) | Completo |
| Pagamento real (MP intent/webhook) | `[FUTURO]` — só status de pareamento |
| WhatsApp automático (Evolution) | `[FUTURO]` — só status de pareamento |

## 2. Pontos fortes

- RBAC consistente (`auth` + `admin`, usuário ativo validado no banco).
- Regra crítica blindada: totais e estoque calculados/baixados no servidor (anti-adulteração + anti-concorrência).
- Erros padronizados `{success,message,code}` sem vazar stack; segredos fora do git (histórico purgado).
- 39 testes unitários + 38 E2E + CI verde (unit, e2e com Mongo, compose-build) + lint anti-`/api` duplicado.

## 3. Gaps residuais (não bloqueantes)

| # | Gap | Severidade | Destino |
|---|---|---|---|
| G01 | `pedidos.html` define `getHeaders()` local duplicado | Baixa (cosmético) | Limpeza futura |
| G02 | Selects de UF fixos (SP/RJ/MG) mitigados por `setSelectValue` | Baixa | Lista completa de UFs |
| G03 | Transição de status de pedido sem máquina de estados | Média | Workflow `pendente→pago→enviado→entregue` |
| G04 | Exclusão física (sem soft-delete/auditoria) | Média | `deletedAt` + trilha |
| G05 | Reset de senha em modo dev (token via API) | Média | Provedor SMTP |
| G06 | MP/Evolution: só status, sem intent/envio | Alta (demanda aberta) | Etapas MP + WhatsApp |

## 4. Riscos e mitigação

- Segredos antigos do histórico: considerados vazados; atuais rotacionados e fora do git.
- Volume local é efêmero por design de dev (`down -v` reseta); produção exige backup do Mongo.
- `JWT` 15min exige `refreshSession` no frontend (implementado nos guards e retries).
