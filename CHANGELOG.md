# Changelog — TechStore (`ecommerce-eletronica_v2.0`)

Formato: `tipo(escopo): descricao` (Conventional Commits). Historico completo em `git log`.

## v1.7.1 — 2026-09-19 — PagSeguro real (sandbox)
- Credenciais reais ativadas (só `backend/.env` local, ignorado pelo git): token válido no **sandbox** (`PGS_SANDBOX=true`), 401 na produção
- Payload alinhado à Orders API oficial: `tax_id` (CPF/CNPJ obrigatório, erro 400 claro), `phones`, `reference_id` por item, `notification_urls` só com `API_PUBLIC_URL` https (localhost é rejeitado pela API)
- Checkout exige CPF antes de gerar cobrança PagSeguro (volta ao formulário com foco)
- E2E `12-pagseguro` cobre modo real + caso sem CPF; **49 unit + 78 E2E verdes em modo real**

## v1.7.0 — 2026-09-19 — Mensagens com status, clientes bloqueáveis, pedidos enxutos
- Mensagens: modal Visualizar (texto completo, auto-marca lida, responder por e-mail) + status nova/lida/respondida (`PUT /contato/:id/status`, filtro `?status=`) + filtros Todas/Não lidas/Lidas/Respondidas
- Clientes: status ativo/inativo/bloqueado (`PUT /api/clientes/:id/status` admin, bloqueado derruba sessões e impede login) + botões Ativar/Bloquear + badges
- Pedidos (dashboard): tabela enxuta — Número, Cliente, Status, Ações (Ver + Status mantidos; detalhe completo no modal)
- 49 unit + 77 E2E verdes (novos `13-clientes-status.test.js`, fluxo de status em `11-contato-sociais.test.js`)

## v1.6.0 — 2026-09-19 — Pedidos no padrão, mensagens CRUD, auditoria de pagamentos
- `pedidos.html` no padrão PlacaCerta (sem Bootstrap, modal próprio, provedor do pagamento, links p/ `produto.html`)
- Mensagens CRUD completo: `DELETE /api/contato/:id` (admin) + botão Excluir no dashboard + E2E
- Auditoria de pagamentos: `GET /api/pagamentos` (admin, filtros provedor/status/modo, com dados do pedido) + E2E
- 49 unit + 72 E2E verdes

## v1.5.0 — 2026-09-19 — Carrinho +/-, checkout com cadastro e PagSeguro
- Carrinho: botões −/+ funcionais via lib compartilhada (`cartStep/cartSetQty`) + delegação; mesmos controles no resumo do checkout
- Checkout busca perfil fresco em `/auth/me` (nome, e-mail, telefone) e lista endereços do cadastro; opção "Enviar para outro endereço" + "Salvar como endereço secundário" (campo `rotulo`)
- PagSeguro (PagBank Orders API): `POST /api/pagamentos/pagseguro/intent` (QR PIX), webhook com token, modo mock sem credenciais; tela de pagamento com abas MP/PagSeguro, copia-e-cola e "Já paguei — verificar status" (`GET /api/pagamentos/:pedidoId`)
- 49 unit + 70 E2E verdes (novo `12-pagseguro.test.js`)

## v1.4.0 — 2026-09-18 — Detalhe ubíquo, carrossel vivo, mensagens, checkout e conta
- Links p/ `produto.html` em categoria, finder e detalhe de pedidos
- Carrossel: 5 visíveis (bordas removidas) + sorteio aleatório a cada 5 min entre cadastrados
- Admin: aba Mensagens (filtros todas/não lidas/lidas, marcar lida, badge de pendentes)
- `checkout.html` no padrão PlacaCerta + etapa de pagamento dedicada (MP, WhatsApp, pedidos)
- `minha-conta.html` no padrão (tabs e modal próprios, sem Bootstrap)

## v1.3.0 — 2026-09-18 — Detalhe, contato, sociais + mobile
- Links p/ `produto.html` em categoria, finder e detalhe de pedidos
- Carrossel: 5 visíveis (bordas removidas) + sorteio aleatório a cada 5 min entre cadastrados
- Admin: aba Mensagens (filtros todas/não lidas/lidas, marcar lida, badge de pendentes)
- `checkout.html` no padrão PlacaCerta + etapa de pagamento dedicada (MP, WhatsApp, pedidos)
- `minha-conta.html` no padrão (tabs e modal próprios, sem Bootstrap)
- `produto.html` (nova): ficha completa, qtd, adicionar/comprar agora, relacionados; cards da landing/loja linkam para ela
- Nome do usuário clicável por papel (`roleHome/userLink` no config.js): admin → dashboard, cliente → minha conta
- Carrossel coverflow centralizado com respiro lateral + modo mobile (só ativo + vizinhos ≤640px); **limitado a 5 itens, bordas ocultas**
- RNF-06 mobile: grids 4→2→1, finder/formulários em coluna, CTA preservado, tabelas admin com scroll
- Redes sociais no rodapé via admin (instagram/facebook/youtube/tiktok; ícone oculto se vazio) + `renderSocial` compartilhado
- `contato.html` (nova) + `POST /contato` (rate-limit, validação) + `GET/PUT /contato` admin; protocolo de retorno
- Loja: **landings antigas excluídas** (`frontend/index.html` + `docs/prototipo/`); raiz e nginx servem a PlacaCerta; links "Loja completa" → catálogo
- Admin: **e-mail da loja + horário de atendimento** configuráveis (público no contato, validado no PUT)
- Docs: ref. oficial Mercado Pago (https://www.mercadopago.com.br/developers/pt/reference) no SRS §6 + comentário no `server.js`
- SRS: RF-003a/004a/011a/016a/019a/019b/020 + RNF-06 + rastreabilidade e2e-11
- Testes: `11-contato-sociais.test.js` (5 casos, incl. email/horário) — 49 unit + 65 E2E verdes
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
