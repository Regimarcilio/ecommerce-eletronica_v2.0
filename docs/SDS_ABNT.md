# TECHSTORE: SISTEMA DE E-COMMERCE PARA COMPONENTES ELETRONICOS

## DOCUMENTO DE ESPECIFICACAO DE DESIGN DE SOFTWARE (SDS)

**Projeto:** ecommerce-eletronica_v2.0  
**Repositorio:** https://github.com/Regimarcilio/ecommerce-eletronica_v2.0  
**Versao do documento:** 1.0  
**Data:** 16 set. 2026

<br><br><br>

**Autor:** Regimarcilio  
**Elaboracao da documentacao:** Apoio tecnico por assistente de IA

<br><br><br>

**Local:** Brasil  
**Ano:** 2026

---

# FOLHA DE ROSTO

REGIMARCILIO

**TECHSTORE: SISTEMA DE E-COMMERCE PARA COMPONENTES ELETRONICOS**

Documento de Especificacao de Design de Software apresentado como artefato tecnico do projeto `ecommerce-eletronica_v2.0`, com a finalidade de descrever a arquitetura, os componentes, os fluxos, os modelos de dados, as interfaces e as decisoes tecnicas utilizadas no desenvolvimento do sistema TechStore.

Orientacao academica: nao informada.

Brasil  
2026

---

# RESUMO

Este documento apresenta a Especificacao de Design de Software (Software Design Specification - SDS) do sistema TechStore, uma aplicacao web de comercio eletronico voltada para venda de componentes eletronicos. O sistema e composto por um frontend desenvolvido em HTML, CSS, JavaScript, Bootstrap e bibliotecas CDN, alem de um backend em Node.js com Express, MongoDB e Mongoose. A solucao contempla catalogo de produtos, categorias, carrinho de compras, autenticacao de usuarios, checkout, pedidos, area do cliente e painel administrativo para gerenciamento de produtos, categorias, clientes, pedidos e indicadores. Este documento descreve o escopo, a arquitetura, os requisitos, os componentes, as interfaces, o modelo de dados, as regras de negocio, os criterios de seguranca, implantacao, manutencao e testes, seguindo uma organizacao textual compativel com a estrutura academica ABNT.

**Palavras-chave:** e-commerce. Node.js. MongoDB. Express. SDS. Engenharia de software.

---

# ABSTRACT

This document presents the Software Design Specification (SDS) for TechStore, a web-based e-commerce system focused on electronic components sales. The system consists of a frontend implemented with HTML, CSS, JavaScript, Bootstrap and CDN libraries, and a backend implemented with Node.js, Express, MongoDB and Mongoose. The solution includes product catalog, categories, shopping cart, user authentication, checkout, orders, customer account area and an administrative dashboard for managing products, categories, customers, orders and business indicators. This document describes scope, architecture, requirements, components, interfaces, data model, business rules, security criteria, deployment, maintenance and testing, following a textual organization compatible with Brazilian ABNT academic structure.

**Keywords:** e-commerce. Node.js. MongoDB. Express. SDS. Software engineering.

---

# LISTA DE ILUSTRACOES

Figura 1 - Visao geral da arquitetura do sistema.  
Figura 2 - Fluxo de autenticacao e autorizacao.  
Figura 3 - Fluxo de compra e geracao de pedido.  
Figura 4 - Relacionamento logico das entidades.

---

# LISTA DE TABELAS

Tabela 1 - Tecnologias utilizadas.  
Tabela 2 - Requisitos funcionais.  
Tabela 3 - Requisitos nao funcionais.  
Tabela 4 - Entidades e atributos principais.  
Tabela 5 - Endpoints da API REST.  
Tabela 6 - Matriz de permissoes.

---

# LISTA DE ABREVIATURAS E SIGLAS

ABNT - Associacao Brasileira de Normas Tecnicas  
API - Application Programming Interface  
CRUD - Create, Read, Update, Delete  
CSS - Cascading Style Sheets  
HTML - HyperText Markup Language  
HTTP - HyperText Transfer Protocol  
JSON - JavaScript Object Notation  
JWT - JSON Web Token  
MVC - Model-View-Controller  
NoSQL - Not Only SQL  
REST - Representational State Transfer  
SDS - Software Design Specification  
SKU - Stock Keeping Unit

---

# SUMARIO

1. Introducao  
2. Caracterizacao do projeto  
3. Referenciais normativos e padrao documental  
4. Visao geral do sistema  
5. Escopo do sistema  
6. Requisitos de software  
7. Arquitetura de software  
8. Design detalhado dos componentes  
9. Modelo de dados  
10. Interfaces externas  
11. Especificacao da API REST  
12. Fluxos principais  
13. Regras de negocio  
14. Seguranca  
15. Tratamento de erros  
16. Implantacao e ambiente de execucao  
17. Testes e validacao  
18. Manutencao e evolucao  
19. Riscos tecnicos e limitacoes  
20. Consideracoes finais  
Referencias

---

# 1 INTRODUCAO

Este documento tem por objetivo registrar a especificacao de design de software do sistema TechStore, desenvolvido no repositorio `ecommerce-eletronica_v2.0`. A SDS descreve como o sistema foi organizado, quais componentes compoem a solucao, quais tecnologias foram utilizadas, quais regras de negocio foram identificadas e como os dados trafegam entre frontend, backend e banco de dados.

A documentacao foi elaborada com base na analise dos arquivos existentes no repositorio, especialmente `backend/server.js`, `backend/package.json`, `docker-compose.yml` e os arquivos HTML do diretorio `frontend/`.

## 1.1 Objetivo geral

Documentar tecnicamente o design do sistema TechStore, de modo a apoiar entendimento, manutencao, evolucao, implantacao e avaliacao academica do projeto.

## 1.2 Objetivos especificos

Descrever a arquitetura geral do sistema.

Especificar os componentes frontend e backend.

Mapear entidades, atributos e relacionamentos logicos.

Documentar endpoints da API REST.

Apresentar requisitos funcionais e nao funcionais.

Registrar fluxos operacionais, regras de negocio e criterios de seguranca.

Indicar procedimentos de implantacao, testes e manutencao.

## 1.3 Publico-alvo

Este documento destina-se a desenvolvedores, avaliadores academicos, mantenedores do projeto, equipe de testes e demais interessados no funcionamento tecnico do sistema TechStore.

## 1.4 Convencoes adotadas

Os nomes de arquivos, diretorios, rotas, variaveis e tecnologias foram mantidos conforme encontrados no repositorio. As secoes foram organizadas em numeracao progressiva, conforme pratica documental academica inspirada na ABNT NBR 6024. As referencias seguem estrutura compativel com ABNT NBR 6023.

---

# 2 CARACTERIZACAO DO PROJETO

O TechStore e um sistema web de e-commerce voltado a comercializacao de componentes eletronicos. A aplicacao permite que usuarios visualizem produtos, filtrem itens por categoria, adicionem produtos ao carrinho, realizem cadastro, efetuem login, finalizem compras e acompanhem pedidos. Administradores podem acessar um painel gerencial para cadastrar, editar e excluir produtos e categorias, visualizar clientes, consultar pedidos e atualizar status de pedidos.

Tabela 1 - Tecnologias utilizadas

| Camada | Tecnologia | Finalidade |
|---|---|---|
| Frontend | HTML5 | Estrutura das paginas web |
| Frontend | CSS3 | Estilizacao visual |
| Frontend | JavaScript | Regras de interface e integracao com API |
| Frontend | Bootstrap 5 | Componentes responsivos e layout |
| Frontend | Font Awesome | Iconografia |
| Backend | Node.js | Ambiente de execucao JavaScript no servidor |
| Backend | Express | Framework HTTP/API REST |
| Backend | Mongoose | Modelagem e acesso ao MongoDB |
| Backend | bcryptjs | Hash de senhas |
| Backend | jsonwebtoken | Emissao e validacao de JWT |
| Backend | cors | Liberacao de requisicoes entre origens |
| Banco de dados | MongoDB | Persistencia NoSQL dos dados |
| Infraestrutura | Docker Compose | Orquestracao de servicos |

Fonte: Elaboracao propria com base no repositorio analisado.

---

# 3 REFERENCIAIS NORMATIVOS E PADRAO DOCUMENTAL

A organizacao deste documento segue uma estrutura compativel com documentos academicos no padrao ABNT, contendo elementos pre-textuais, textuais e pos-textuais. Por estar em formato Markdown, a formatacao final devera ser ajustada na ferramenta de edicao utilizada para exportacao, caso seja exigida entrega em PDF ou DOCX.

## 3.1 Recomendacoes de formatacao ABNT para exportacao

Fonte: Arial ou Times New Roman, tamanho 12 para corpo do texto.

Espacamento entre linhas: 1,5.

Alinhamento: justificado.

Margens: superior e esquerda de 3 cm; inferior e direita de 2 cm.

Paginacao: canto superior direito, a partir da parte textual.

Titulos primarios: caixa alta, negrito, alinhados a esquerda.

Referencias: alinhadas a esquerda, espacamento simples e separadas por uma linha em branco.

## 3.2 Normas relacionadas

ABNT NBR 14724: estrutura de trabalhos academicos.

ABNT NBR 6023: elaboracao de referencias.

ABNT NBR 6024: numeracao progressiva das secoes.

ABNT NBR 6027: elaboracao de sumario.

ABNT NBR 6028: elaboracao de resumo.

IEEE 1016: referencia internacional para descricao de design de software.

---

# 4 VISAO GERAL DO SISTEMA

O sistema e composto por tres blocos principais: cliente web, servidor backend e banco de dados MongoDB.

Figura 1 - Visao geral da arquitetura do sistema

```text
Usuario Navegador
       |
       | HTTP/Fetch
       v
Frontend HTML/CSS/JS
       |
       | Requisicoes REST JSON
       v
Backend Node.js + Express
       |
       | Mongoose
       v
Banco de dados MongoDB
```

Fonte: Elaboracao propria.

O frontend consome a API REST por meio de chamadas `fetch` para `http://localhost:5000/api`. O backend processa as requisicoes, realiza validacoes basicas, autentica usuarios por JWT e persiste os dados no MongoDB usando modelos Mongoose.

---

# 5 ESCOPO DO SISTEMA

## 5.1 Dentro do escopo

Cadastro e login de usuarios.

Autenticacao com token JWT.

Catalogo de produtos.

Cadastro e consulta de categorias.

Carrinho armazenado no navegador via `localStorage`.

Checkout com dados de cliente, endereco e pagamento.

Criacao e consulta de pedidos.

Area de conta do cliente.

Painel administrativo.

CRUD de produtos e categorias pelo administrador.

Consulta de clientes pelo administrador.

Atualizacao de status de pedidos pelo administrador.

Indicadores administrativos de produtos, categorias, clientes, pedidos e total de vendas.

## 5.2 Fora do escopo atual

Integracao real com gateways de pagamento.

Calculo real de frete por transportadora.

Controle transacional de estoque.

Recuperacao de senha por e-mail.

Upload de imagens de produtos.

Controle granular de permissoes por modulo.

Logs estruturados e auditoria completa.

Testes automatizados versionados.

Deploy em ambiente de producao com variaveis de ambiente seguras.

---

# 6 REQUISITOS DE SOFTWARE

## 6.1 Requisitos funcionais

Tabela 2 - Requisitos funcionais

| Codigo | Requisito | Descricao | Prioridade |
|---|---|---|---|
| RF01 | Cadastrar usuario | O sistema deve permitir cadastro com nome, e-mail, telefone e senha. | Alta |
| RF02 | Autenticar usuario | O sistema deve permitir login por e-mail e senha. | Alta |
| RF03 | Emitir token JWT | O sistema deve gerar token para sessoes autenticadas. | Alta |
| RF04 | Listar produtos | O sistema deve listar produtos disponiveis no catalogo. | Alta |
| RF05 | Buscar produto por ID | O sistema deve consultar dados de um produto especifico. | Media |
| RF06 | Gerenciar produtos | O administrador deve criar, editar e excluir produtos com ficha completa: titulo (nome), descricao, foto (URL), valor (preco) e quantidade em estoque; os dados publicados aparecem na pagina principal via mesma API REST. | Alta |
| RF23 | Biblioteca de icones | O dashboard deve oferecer biblioteca de icones por segmento para categorias multi-ramo (busca + preview). | Media |
| RF25 | Pagar via Mercado Pago | O cliente deve pagar o pedido (Pix/cartao/boleto) via preferencia MP e retorno; webhook confirma `pendente→pago`. | Alta |
| RF26 | Avisar pedido no WhatsApp | No aceite: (1) servidor tenta resumo ao WhatsApp informado (checkout, senao cadastro) e retorna mascarado; (2) painel abre `api.whatsapp.com/send?phone=<loja>&text=<resumo>` de pronto + botao (anti-popup). Telefone com mascara e DDD 11-99 validado. | Alta |
| RF24 | Configurar loja | O administrador deve editar WhatsApp, instancia Evolution, condicoes de pagamento e segredos via dashboard; segredos nunca via .env em runtime. | Alta |
| RF07 | Listar categorias | O sistema deve exibir categorias de produtos. | Alta |
| RF08 | Gerenciar categorias | O administrador deve criar, editar e excluir categorias. | Alta |
| RF09 | Adicionar ao carrinho | O usuario deve adicionar produtos ao carrinho. | Alta |
| RF10 | Atualizar carrinho | O usuario deve alterar quantidades e remover itens. | Alta |
| RF11 | Realizar checkout | O usuario autenticado deve finalizar pedido. | Alta |
| RF12 | Criar pedido | O sistema deve registrar pedido com itens, cliente, endereco, pagamento e total. | Alta |
| RF13 | Consultar pedidos | O usuario deve consultar seus pedidos. | Alta |
| RF14 | Consultar todos os pedidos | O administrador deve consultar todos os pedidos. | Alta |
| RF15 | Atualizar status de pedido | O administrador deve alterar status do pedido. | Alta |
| RF16 | Consultar clientes | O administrador deve listar usuarios com perfil de cliente. | Media |
| RF17 | Exibir dashboard | O administrador deve visualizar indicadores do sistema. | Media |
| RF18 | Gerenciar conta | O cliente visualiza dados via `GET /auth/me`, edita nome/telefone via `PUT /auth/me` e gerencia enderecos via CRUD `/auth/enderecos` (sem `localStorage`). | Media |
| RF19 | Trocar senha | O usuario autenticado deve trocar senha via `PUT /auth/password` informando a atual. | Alta |
| RF20 | Paginar listagens | Produtos, categorias, pedidos e clientes suportam `?page&limit` com meta; catalogo (`index`, `categoria`, 12/pagina), dashboard admin (produtos, categorias, pedidos, clientes, 10/pagina) e Meus Pedidos (10/pagina) tem pager Anterior/Proxima com back-step em pagina esvaziada; busca via API. | Media |

Fonte: Elaboracao propria.

## 6.2 Requisitos nao funcionais

Tabela 3 - Requisitos nao funcionais

| Codigo | Requisito | Descricao | Prioridade |
|---|---|---|---|
| RNF01 | Usabilidade | A interface deve ser simples, responsiva e navegavel. | Alta |
| RNF02 | Compatibilidade | O sistema deve funcionar em navegadores modernos. | Alta |
| RNF03 | Desempenho | Consultas basicas devem responder em tempo aceitavel em ambiente local. | Media |
| RNF04 | Seguranca de senha | Senhas devem ser armazenadas com hash bcrypt. | Alta |
| RNF05 | Autenticacao | Rotas sensiveis devem exigir JWT valido. | Alta |
| RNF06 | Autorizacao | Operacoes administrativas devem ser restritas ao perfil `admin`. | Alta |
| RNF07 | Persistencia | Dados principais devem ser armazenados no MongoDB. | Alta |
| RNF08 | Portabilidade | O projeto deve poder executar localmente via Node.js e MongoDB. | Media |
| RNF09 | Manutenibilidade | O codigo deve manter separacao logica entre frontend, backend e banco. | Media |
| RNF10 | Disponibilidade | Em ambiente local, o backend deve disponibilizar endpoint de saude. | Baixa |

Fonte: Elaboracao propria.

---

# 7 ARQUITETURA DE SOFTWARE

## 7.1 Estilo arquitetural

O sistema adota uma arquitetura cliente-servidor com API REST. O frontend e composto por paginas estaticas que consomem recursos do backend. O backend concentra regras de autenticacao, persistencia e operacoes CRUD.

Embora nao exista separacao fisica em camadas internas no backend, o arquivo `server.js` contem responsabilidades equivalentes a:

Modelos: schemas Mongoose de Usuario, Produto, Categoria e Pedido.

Controladores: handlers das rotas Express.

Infraestrutura: conexao com MongoDB, CORS, JSON parser e inicializacao do servidor.

Autenticacao: middleware `auth` para validacao de JWT.

## 7.2 Organizacao de diretorios

```text
ecommerce-eletronica_v2.0/
  backend/
    package.json
    package-lock.json
    server.js
    node_modules/
  frontend/
    index.html
    auth.html
    cart.html
    checkout.html
    categoria.html
    dashboard.html
    minha-conta.html
    pedidos.html
    style.css
  docker-compose.yml
  comando_inicializar.txt
  docs/
    SDS_ABNT.md
```

## 7.3 Dependencias principais

O backend depende de `express`, `mongoose`, `cors`, `bcryptjs` e `jsonwebtoken`. O frontend depende de recursos via CDN, incluindo Bootstrap, Font Awesome e, na pagina de conta, jQuery.

---

# 8 DESIGN DETALHADO DOS COMPONENTES

## 8.1 Frontend

O frontend e formado por paginas HTML independentes com scripts embutidos. Cada pagina possui responsabilidades especificas.

`index.html`: pagina inicial, listagem de categorias, listagem de produtos, busca simples, inclusao de produtos no carrinho e exibicao de menu de autenticacao.

`auth.html`: tela de login e cadastro, armazenamento de token e dados do usuario no `localStorage`.

`cart.html`: exibicao do carrinho, alteracao de quantidade, remocao de itens, calculo de subtotal, frete e total.

`checkout.html`: preenchimento de dados do cliente, endereco de entrega, selecao de pagamento e criacao do pedido.

`categoria.html`: listagem de produtos filtrados por categoria selecionada via parametro `id` na URL.

`dashboard.html`: painel administrativo com indicadores e CRUD de produtos/categorias, pedidos e clientes.

`minha-conta.html`: area do usuario autenticado para dados pessoais, enderecos locais e seguranca visual.

`pedidos.html`: pagina para listagem de pedidos do usuario.

`style.css`: estilos globais utilizados especialmente em telas de autenticacao e componentes compartilhados.

## 8.2 Backend

O backend e implementado em `backend/server.js` e possui as seguintes responsabilidades:

Inicializar servidor Express.

Habilitar CORS.

Interpretar corpo das requisicoes como JSON.

Definir schemas Mongoose.

Registrar modelos do MongoDB.

Gerar e validar JWT.

Criptografar senhas com bcrypt.

Expor endpoints REST.

Criar usuario administrador padrao na inicializacao.

Conectar ao MongoDB.

## 8.3 Banco de dados

O MongoDB e utilizado como banco NoSQL orientado a documentos. A aplicacao define quatro colecoes principais por meio de modelos Mongoose: usuarios, produtos, categorias e pedidos.

---

# 9 MODELO DE DADOS

Figura 4 - Relacionamento logico das entidades

```text
Usuario 1 ---- N Pedido
Categoria 1 ---- N Produto
Pedido N ---- N Produto (por itens embutidos no pedido)
```

Fonte: Elaboracao propria.

Tabela 4 - Entidades e atributos principais

| Entidade | Atributo | Tipo | Observacao |
|---|---|---|---|
| Usuario | nome | String | Nome do usuario |
| Usuario | email | String | Unico no banco |
| Usuario | password | String | Senha com hash bcrypt |
| Usuario | telefone | String | Telefone informado no cadastro |
| Usuario | role | String | `user` por padrao; pode ser `admin` |
| Usuario | status | String | `ativo` por padrao |
| Produto | nome | String | Nome comercial do produto |
| Produto | sku | String | Codigo unico do produto |
| Produto | descricao | String | Descricao detalhada (opcional, max 2000, exibida na principal) |
| Produto | imagemUrl | String | Foto do produto via URL (opcional; exibida no card, fallback p/ icone) |
| Produto | preco | Number | Valor unitario |
| Produto | quantidade | Number | Quantidade em estoque |
| Produto | status | String | `ativo` por padrao |
| Produto | destaque | Boolean | Indica produto em destaque |
| Produto | categoria | ObjectId | Referencia para Categoria |
| Categoria | nome | String | Nome unico da categoria |
| Categoria | slug | String | Identificador textual |
| Categoria | icone | String | Classe Font Awesome |
| Categoria | status | String | `ativo` por padrao |
| Pedido | numero | String | Numero gerado no checkout |
| Pedido | usuarioId | ObjectId | Referencia obrigatoria ao Usuario |
| Pedido | cliente | Object | Dados do cliente no pedido |
| Pedido | endereco | Object | Endereco de entrega |
| Pedido | pagamento | String | `pix`, `card` ou `boleto` |
| Pedido | items | Array | Itens comprados |
| Pedido | subtotal | Number | Soma dos itens |
| Pedido | frete | Number | Valor do frete |
| Pedido | desconto | Number | Desconto aplicado |
| Pedido | total | Number | Total final |
| Pedido | status | String | `pendente` por padrao |

Fonte: Elaboracao propria.

---

# 10 INTERFACES EXTERNAS

## 10.1 Interface com usuario

A interface web e baseada em paginas HTML responsivas com Bootstrap. O usuario interage por formularios, botoes, menus, cards de produto, tabelas administrativas e modais.

## 10.2 Interface com banco de dados

O backend acessa o MongoDB por meio do Mongoose. A string de conexao atual e:

```text
mongodb://<usuario>:<senha>@localhost:27017/ecommerce?authSource=admin
```

## 10.3 Interface HTTP

O frontend realiza chamadas HTTP para a API em `http://localhost:5000/api`. As respostas sao majoritariamente objetos JSON contendo a propriedade `success`.

---

# 11 ESPECIFICACAO DA API REST

Tabela 5 - Endpoints da API REST

| Metodo | Endpoint | Autenticacao | Perfil | Finalidade |
|---|---|---|---|---|
| POST | `/api/auth/register` | Nao | Publico | Cadastrar usuario |
| POST | `/api/auth/login` | Nao | Publico | Autenticar usuario |
| GET | `/api/auth/me` | Sim | Usuario/Admin | Retornar usuario autenticado |
| PUT | `/api/auth/me` | Sim | Usuario/Admin | Atualizar nome/telefone (e-mail imutavel) |
| PUT | `/api/auth/password` | Sim | Usuario/Admin | Trocar senha (exige atual, min 8) |
| POST | `/api/auth/refresh` | Nao | Publico | Renovar par (rotacao, uso unico) |
| POST | `/api/auth/logout` | Sim | Usuario/Admin | Revogar refresh da sessao |
| POST | `/api/auth/forgot` | Nao | Publico | Solicitar reset (anti-enumeracao) |
| POST | `/api/auth/reset` | Nao | Publico | Redefinir com token unico |
| GET | `/api/auth/enderecos` | Sim | Usuario/Admin | Listar enderecos do usuario |
| POST | `/api/auth/enderecos` | Sim | Usuario/Admin | Criar endereco (CEP `NNNNN-NNN`, UF 2 letras) |
| PUT | `/api/auth/enderecos/:id` | Sim | Usuario/Admin | Atualizar endereco proprio |
| DELETE | `/api/auth/enderecos/:id` | Sim | Usuario/Admin | Excluir endereco proprio |
| GET | `/api/produtos` | Nao | Publico | Listar produtos |
| GET | `/api/produtos/:id` | Nao | Publico | Buscar produto por ID |
| POST | `/api/produtos` | Sim | Admin | Criar produto |
| PUT | `/api/produtos/:id` | Sim | Admin | Atualizar produto |
| DELETE | `/api/produtos/:id` | Sim | Admin | Excluir produto |
| GET | `/api/categorias` | Nao | Publico | Listar categorias |
| GET | `/api/categorias/:id` | Nao | Publico | Buscar categoria por ID |
| POST | `/api/categorias` | Sim | Admin | Criar categoria |
| PUT | `/api/categorias/:id` | Sim | Admin | Atualizar categoria |
| DELETE | `/api/categorias/:id` | Sim | Admin | Excluir categoria |
| GET | `/api/pedidos` | Sim | Usuario/Admin | Listar pedidos do usuario ou todos para admin |
| GET | `/api/pedidos/:id` | Sim | Usuario/Admin | Buscar pedido autorizado |
| POST | `/api/pedidos` | Sim | Usuario/Admin | Criar pedido |
| PUT | `/api/pedidos/:id/status` | Sim | Admin | Atualizar status do pedido |
| GET | `/api/clientes` | Sim | Admin | Listar clientes |
| GET | `/api/dashboard/stats` | Sim | Admin | Retornar indicadores administrativos |
| GET | `/health` | Nao | Publico | Verificar saude do backend (liveness) |
| GET | `/api/metrics` | Sim | Admin | Metricas (uptime, req, erros, memoria, mongo). CI com lint anti `/api` duplicado no frontend |
| GET | `/api/config/loja/public` | Nao | Publico | Condicoes, parcelas, desconto, public key |
| GET | `/api/config/loja` | Sim | Admin | Leitura mascarada |
| PUT | `/api/config/loja` | Sim | Admin | Atualizacao parcial + segredos cifrados |
| GET | `/api/config/whatsapp/status` | Sim | Admin | Estado do pareamento Evolution |

Fonte: Elaboracao propria.

Observacao tecnica (atualizado 2026): rotas de produtos/categorias exigem `auth` + `admin`; erros padronizados `{success,message,code}`; listagens suportam `?page&limit` com meta `{page,limit,total,pages}`; `POST /pedidos` recalcula totais no servidor e baixa estoque atomicamente.

---

# 12 FLUXOS PRINCIPAIS

## 12.1 Fluxo de cadastro

O usuario acessa `auth.html`, seleciona a aba de cadastro, informa nome, e-mail, telefone, senha e confirmacao de senha. O frontend valida se as senhas conferem e envia os dados para `POST /api/auth/register`. O backend verifica se o e-mail ja existe, gera hash da senha, cria o usuario e retorna token JWT com dados basicos do usuario.

## 12.2 Fluxo de login

Figura 2 - Fluxo de autenticacao e autorizacao

```text
Usuario -> auth.html -> POST /api/auth/login -> Backend
Backend -> MongoDB: consulta usuario por email
Backend -> bcrypt: compara senha
Backend -> JWT: gera token
Backend -> Frontend: retorna token e usuario
Frontend -> localStorage: armazena token e dados
```

Fonte: Elaboracao propria.

## 12.3 Fluxo de compra

Figura 3 - Fluxo de compra e geracao de pedido

```text
Catalogo -> Adicionar ao carrinho -> Carrinho -> Checkout
Checkout -> Validar autenticacao -> Preencher dados
Checkout -> Calcular frete, desconto e total
Checkout -> POST /api/pedidos
Backend -> MongoDB: salva pedido
Frontend -> Limpa carrinho -> Redireciona para pedidos
```

Fonte: Elaboracao propria.

## 12.4 Fluxo administrativo

O administrador realiza login com credenciais administrativas, acessa `dashboard.html` e pode visualizar indicadores, gerenciar produtos, gerenciar categorias, consultar pedidos, alterar status de pedidos e listar clientes.

---

# 13 REGRAS DE NEGOCIO

RN01 - O e-mail do usuario deve ser unico.

RN02 - A senha deve ser armazenada apenas em formato de hash.

RN03 - Um novo usuario cadastrado recebe o perfil `user`.

RN04 - O sistema cria um administrador padrao se nao existir usuario com e-mail `admin@techstore.com.br`.

RN05 - O produto possui SKU unico.

RN16 - A descricao do produto e opcional (max 2000 caracteres), armazenada sem alteracao e sempre escapada na exibicao (anti-XSS).

RN17 - Todo produto criado/editado pelo administrador via `POST/PUT /api/produtos` fica imediatamente disponivel na pagina principal (mesma API, sem cache de frontend).

RN18 - A foto do produto e uma URL (`http/https` ou caminho relativo); `javascript:` e formatos invalidos sao rejeitados (400) e o card usa `safeImg` com fallback para o icone padrao. Upload de arquivos segue fora do escopo.

RN21 - Pagamento: intent valida dono e `pendente` (409 se processado); webhook valida `x-signature` (HMAC) e e idempotente; sem `MP_WEBHOOK_SECRET`, modo teste aceita corpo direto com aviso.

RN26 - `PUT` e parcial: chaves ausentes preservadas (sem zerar); E2E com `limparPorTag` best-effort; `check-env.sh` valida `.env`; unicidade parcial exige migração `syncIndexes`.

RN22 - WhatsApp: numero normalizado (DDI 55), mensagem ≤1000 chars, `Notificacao` registrada (enviada/falha); Evolution via profile `integracoes`, pareamento por QR.

RN20 - Configuracoes editaveis ficam no banco (`settings/loja`); segredos (`MP_*`, `EVO_*`) somente no `.env` e, se gravados via dashboard, cifrados (AES-256-GCM/`SETTINGS_KEY`), mascarados na leitura e com audit log; `GET /api/config/loja/public` expoe apenas condicoes, parcelas, desconto e public key.

RN19 - O icone da categoria e escolhido em biblioteca curada (`ICON_LIB`, ~130 icones em 12 segmentos) com busca e preview; valor fora do padrao `fa-*` cai para `fa-microchip` (`safeIcon`). Disponivel no modal de categorias e no cadastro rapido dentro do produto. HTML servido com `Cache-Control: no-store` e JS versionado (`config.js?v=N`) para evitar cache travado entre deploys.

RN06 - A categoria possui nome unico.

RN25 - Exclusao de produtos/categorias e logica (`deletedAt`): some de listas, detalhe e PUT (404), bloqueia novos pedidos e gera audit log; sem lixeira na UI. Unicidade de sku/nome vale só p/ visíveis (índice parcial + migração `syncIndexes` no boot).

RN07 - Pedidos devem estar associados ao usuario autenticado.

RN08 - Usuarios comuns visualizam apenas seus proprios pedidos.

RN09 - Administradores visualizam todos os pedidos.

RN10 - Apenas administradores podem atualizar status de pedidos.

RN11 - O status inicial de pedido e `pendente`; transicoes validas: pendente→pago/cancelado, pago→enviado/cancelado, enviado→entregue (fora disso: 422 `TRANSITION`).

RN12 - O frete e gratis para subtotal superior a R$ 100,00; caso contrario, o valor aplicado e R$ 20,00.

RN13 - Pagamento por PIX aplica desconto de 5% sobre o subtotal.

RN14 - Os metodos de pagamento previstos no frontend sao PIX, cartao de credito e boleto bancario.

RN15 - O carrinho e mantido no navegador do usuario por meio do `localStorage`.

---

# 14 SEGURANCA

## 14.1 Autenticacao

A autenticacao utiliza JWT. O token e gerado no login ou cadastro e possui validade de sete dias. O middleware `auth` recupera o token do cabecalho `Authorization`, valida a assinatura e adiciona `usuarioId` e `usuarioRole` ao objeto da requisicao.

## 14.2 Autorizacao

Tabela 6 - Matriz de permissoes

| Recurso | Publico | Usuario autenticado | Administrador |
|---|---|---|---|
| Visualizar catalogo | Sim | Sim | Sim |
| Cadastrar conta | Sim | Nao aplicavel | Nao aplicavel |
| Login | Sim | Nao aplicavel | Nao aplicavel |
| Criar pedido | Nao | Sim | Sim |
| Visualizar proprios pedidos | Nao | Sim | Sim |
| Visualizar todos os pedidos | Nao | Nao | Sim |
| Alterar status de pedido | Nao | Nao | Sim |
| Listar clientes | Nao | Nao | Sim |
| Visualizar dashboard | Nao | Nao | Sim |
| Gerenciar produtos | Nao | Nao | Sim |
| Gerenciar categorias | Nao | Nao | Sim |

Fonte: Elaboracao propria.

## 14.3 Pontos de atencao

Access JWT curto (`JWT_EXPIRES_IN`, padrao 15m) + refresh opaco com rotacao (`JWT_REFRESH_EXPIRES_IN_DAYS`, padrao 7, hash SHA-256, TTL, revogacao em logout/reset). A chave JWT e configurada via `JWT_SECRET`/`JWT_EXPIRES_IN` em `.env` (com fallback apenas para desenvolvimento e alerta no boot); `MONGODB_URI`, `ADMIN_*` e `CORS_ORIGIN` tambem via ambiente com `backend/.env.example` como template. Segredos reais nunca versionados: `backend/.env` fora do git, placeholders em compose/scripts/codigo, historico purgado com `git filter-repo` (valores anteriores rotacionados).

A string de conexao e resolvida via `MONGODB_URI` (local) ou via host `mongodb` no Docker Compose com `env_file`; `.env` nao e versionado.

Rotas de produtos/categorias usam `auth` + `admin`; `auth` valida usuario ativo no banco; `/auth/login` e `/auth/register` com `rate-limit`; backend usa `helmet` e CORS restrito por `CORS_ORIGIN`.

O token e armazenado no `localStorage`, o que exige cuidado com XSS.

Nao ha sanitizacao centralizada de entradas.

Rate-limit por rota: login e register 20/15min, refresh 30/15min, forgot+reset 10/15min, com headers `RateLimit-*` (E2E valida presenca sem disparar 429).

Nao ha politica formal de validacao de senha forte no backend.

---

# 15 TRATAMENTO DE ERROS

O backend retorna objetos JSON com `success: false` e mensagem em alguns fluxos, especialmente autenticacao e pedidos. As rotas de produtos e categorias possuem tratamento de erro menos detalhado. No frontend, mensagens sao exibidas por alertas ou componentes de toast.

Recomenda-se padronizar respostas no seguinte formato:

```json
{
  "success": false,
  "message": "Descricao do erro",
  "code": "CODIGO_DO_ERRO"
}
```

Tambem recomenda-se registrar logs tecnicos no backend sem expor detalhes sensiveis ao usuario final.

---

# 16 IMPLANTACAO E AMBIENTE DE EXECUCAO

## 16.1 Execucao local prevista

O arquivo `comando_inicializar.txt` descreve um fluxo para iniciar MongoDB, instalar dependencias do backend, executar `server.js` e iniciar o frontend via servidor HTTP do Python.

## 16.2 Execucao com Docker Compose

O arquivo `docker-compose.yml` define tres servicos:

`mongodb`: banco MongoDB 7 com volume `mongo_data` e healthcheck `mongosh ping`, exposto na porta `27017`.

`backend`: imagem `node:20-alpine` (`backend/Dockerfile`), `env_file: ./backend/.env`, healthcheck `GET /health`, porta `5010:5000`, `depends_on mongodb (healthy)`. Credenciais do Mongo via `.env` na raiz (`MONGO_USER/MONGO_PASSWORD`, nao versionado, mesmos valores do `backend/.env`); `MONGODB_URI` do compose tem precedencia sobre o `env_file`.

`frontend`: imagem `nginx:alpine` (`frontend/Dockerfile`), porta `8083:80`, `depends_on backend (healthy)`; `js/config.js` resolve a API conforme a porta.

## 16.3 Portas utilizadas

MongoDB: `27017`.

Backend local pelo codigo: `5000`.

Backend via Docker Compose: `5010:5000`.

Frontend via script local: `5500`.

Frontend via Docker Compose: `8083:80`.

## 16.4 Variaveis recomendadas

Para ambiente profissional, recomenda-se criar variaveis como:

`PORT`: porta do backend.

`MONGODB_URI`: string de conexao do MongoDB.

`JWT_SECRET`: segredo de assinatura JWT.

`JWT_EXPIRES_IN`: tempo de expiracao do token.

`CORS_ORIGIN`: origem permitida para o frontend.

---

# 17 TESTES E VALIDACAO

## 17.1 Testes funcionais recomendados

Cadastrar usuario novo.

Tentar cadastrar usuario com e-mail ja existente.

Realizar login com credenciais validas.

Realizar login com senha incorreta.

Listar produtos na pagina inicial.

Listar categorias na pagina inicial.

Adicionar produto ao carrinho.

Alterar quantidade do carrinho.

Remover item do carrinho.

Finalizar pedido autenticado.

Consultar pedidos do usuario.

Acessar dashboard como administrador.

Bloquear dashboard para usuario comum.

Criar, editar e excluir produto.

Criar, editar e excluir categoria.

Atualizar status de pedido como administrador.

## 17.2 Testes de API recomendados

Validar respostas HTTP de autenticacao.

Validar persistencia de produtos, categorias e pedidos.

Validar restricao de acesso a rotas protegidas.

Validar acesso de usuario comum a pedido de outro usuario.

Validar `PUT /auth/me` (nome vazio 400) e `PUT /auth/password` (atual errada 401, nova <8 400).

Validar CRUD de enderecos: CEP invalido 400, PUT/DELETE de outro usuario 404, `npm test` (27 asserts).

Validar paginacao `?page&limit` com meta `{page,limit,total,pages}`.

Executar `npm test` no backend (unitarios) e `npm run test:e2e` (23 asserts E2E sem dependencias: `fetch` nativo + `node:test`).

Matriz E2E (`backend/test/e2e/`, job `e2e` no CI com `mongo:7` em servico):
| Suite | Casos |
|---|---|
| `01-auth-conta` | health, register 200, duplicado 400, senha fraca 400, login errado 401, me sem password, PUT me 400/200, password 401/400/200+relogin |
| `02-catalogo-rbac` | admin cria categoria/produto, user 403, sem token 401, id invalido 400, paging 14 itens p1=12/p2=2, ficha (preco/qtd 400, descricao+XSS roundtrip, PUT), imagemUrl roundtrip + `javascript:` 400, integracao admin→principal |
| `03-pedido-estoque-enderecos` | total adulterado ignorado (120), pix 77, estoque 17, oversell 409, cross-user 403, enderecos CRUD + CEP 400 + cross 404 |
| `04-observabilidade` | `/metrics` sem token 401, user 403, admin 200 com uptime/req/mongo; `06-config` public 401/403, validacoes 400, segredo cifrado/mascarado/limpo, status Evolution |;
| `07-regras` | transicao ilegal 422, fluxo valido ate entregue, pos-entregue imutavel, soft-delete (lista/detalhe/PUT/pedido) |;
| `08-pagamentos` | intent 403/409, preferencia mock, webhook aprova (pago) idempotente |
| `03-pedido` | aceite retorna `lojaWhatsapp` + `whatsapp.{enviado,para}` mascarado; fallback cadastro; auditoria em `/notificacoes` |; `05-sessao` refresh rotaciona/invalida, logout revoga, forgot generico + reset 1 uso + re-login; logs JSON por requisicao (metodo, rota com `:id`, status, ms) |
Limpeza em `after()` (produtos/categorias/enderecos de teste removidos; pedidos permanecem no banco efemero do CI).

E2E de pedido validado (inclusive apos rotacao de segredos: 3x40 pix = 114, estoque 10->7): total adulterado ignorado (2x60 card = 120), estoque 5->3, oversell 99 = 409, pix 1x60 = 77 (60+20-3), acesso cruzado 403, user criar produto 403, sem token 401; dados de teste removidos.

CI (`.github/workflows/ci.yml`): `npm ci` + `npm test` + `node --check` e `docker compose config/build` a cada push/PR em `main` (verde). `env_file` do backend e opcional (`required: false`) para clone fresco sem `.env`.

Validar calculo de indicadores do dashboard.

## 17.3 Criterios de aceite

O sistema deve iniciar sem erro de conexao com MongoDB.

O usuario administrador padrao deve ser criado na primeira inicializacao quando inexistente.

O frontend deve consumir a API e renderizar produtos/categorias cadastrados.

Pedidos devem ser salvos no MongoDB com usuario associado.

Rotas administrativas sensiveis devem estar acessiveis apenas por administradores em versoes futuras corrigidas.

---

# 18 MANUTENCAO E EVOLUCAO

## 18.1 Melhorias estruturais recomendadas

Separar `server.js` em modulos: rotas, controllers, models, middlewares e configuracoes.

Criar arquivo `.env` para configuracoes sensiveis.

Criar validacoes de entrada com biblioteca apropriada.

Proteger rotas administrativas de produtos e categorias com `auth` e verificacao de `role`.

Adicionar testes automatizados.

Adicionar logs estruturados.

Criar camada de servicos para regras de negocio.

Padronizar respostas e tratamento de erros.

Substituir scripts inline por arquivos JavaScript organizados.

Implementar controle real de estoque na criacao de pedidos.

## 18.2 Evolucoes funcionais sugeridas

Integracao com gateway de pagamento.

Upload de imagens de produto.

Recuperacao de senha por e-mail.

Historico detalhado de alteracao de status do pedido.

Cupons de desconto.

Busca e filtros avancados.

Paginacao de produtos, pedidos e clientes.

Relatorios administrativos exportaveis.

---

# 19 RISCOS TECNICOS E LIMITACOES

As credenciais sensiveis estao presentes diretamente no codigo e no `docker-compose.yml`.

O segredo JWT esta fixo no codigo-fonte.

Produtos e categorias podem ser modificados sem validacao de autenticacao no backend atual.

O carrinho depende do armazenamento local do navegador.

Nao ha garantia transacional entre criacao de pedido e atualizacao de estoque.

Nao ha testes automatizados no repositorio analisado.

O gerenciamento de enderecos e persistido no MongoDB via CRUD `/auth/enderecos` com isolamento por usuario (404 para id de outro usuario). O checkout oferece selecao de endereco salvo com preenchimento automatico (`setSelectValue` para UF fora da lista).

`placas.html` (PlacaShop): landing-exemplo multi-ramo (pagina separada, front-only, mesma API): hero, carrossel de `destaque` (filtro client-side, max 5, oculto se vazio), chips de categoria, grade com pager 12/pag e busca, faixa institucional. Tudo sincronizado via dashboard (produtos/categorias/fotos/precos); link cruzado `index ↔ placas`.

Historico: `pedidos.html` ja envia `Authorization: Bearer` via `js/config.js#getAuthHeaders`; frontend usa `API_BASE` dinamica (8083->5010, senao 5000); toasts e listagens usam `escapeHtml`/`safeIcon` (allowlist `fa-*`); `dashboard` valida `admin` via `GET /auth/me`; catalogo usa `addToCartById` (sem nome interpolado no `onclick`); checkout usa `cart` como fallback do `checkoutCart`.

---

# 20 CONSIDERACOES FINAIS

O sistema TechStore apresenta uma base funcional de e-commerce com recursos essenciais para catalogo, carrinho, checkout, pedidos, autenticacao e administracao. A arquitetura cliente-servidor com Node.js, Express e MongoDB e adequada para um prototipo academico e pode evoluir para uma estrutura mais modular e segura.

A principal recomendacao tecnica e priorizar melhorias de seguranca, modularizacao do backend, protecao das rotas administrativas, externalizacao de configuracoes sensiveis e criacao de testes automatizados. Com essas melhorias, o projeto tera maior manutenibilidade, confiabilidade e aderencia a praticas profissionais de desenvolvimento de software.

---

# REFERENCIAS

ASSOCIACAO BRASILEIRA DE NORMAS TECNICAS. **NBR 14724: informacao e documentacao: trabalhos academicos: apresentacao**. Rio de Janeiro: ABNT, 2011.

ASSOCIACAO BRASILEIRA DE NORMAS TECNICAS. **NBR 6023: informacao e documentacao: referencias: elaboracao**. Rio de Janeiro: ABNT, 2018.

ASSOCIACAO BRASILEIRA DE NORMAS TECNICAS. **NBR 6024: informacao e documentacao: numeracao progressiva das secoes de um documento: apresentacao**. Rio de Janeiro: ABNT, 2012.

ASSOCIACAO BRASILEIRA DE NORMAS TECNICAS. **NBR 6027: informacao e documentacao: sumario: apresentacao**. Rio de Janeiro: ABNT, 2012.

ASSOCIACAO BRASILEIRA DE NORMAS TECNICAS. **NBR 6028: informacao e documentacao: resumo, resenha e recensao: apresentacao**. Rio de Janeiro: ABNT, 2021.

EXPRESS. **Express: fast, unopinionated, minimalist web framework for Node.js**. Disponivel em: https://expressjs.com/. Acesso em: 16 set. 2026.

IEEE COMPUTER SOCIETY. **IEEE Std 1016-2009: IEEE Standard for Information Technology: Systems Design: Software Design Descriptions**. New York: IEEE, 2009.

MONGODB. **MongoDB documentation**. Disponivel em: https://www.mongodb.com/docs/. Acesso em: 16 set. 2026.

MONGOOSE. **Mongoose documentation**. Disponivel em: https://mongoosejs.com/docs/. Acesso em: 16 set. 2026.

NODE.JS. **Node.js documentation**. Disponivel em: https://nodejs.org/docs/. Acesso em: 16 set. 2026.

REGIMARCILIO. **ecommerce-eletronica_v2.0**. GitHub, 2026. Disponivel em: https://github.com/Regimarcilio/ecommerce-eletronica_v2.0. Acesso em: 16 set. 2026.

---

# APENDICE A - CHECKLIST DE CONFORMIDADE DOCUMENTAL

O documento contem capa.

O documento contem folha de rosto.

O documento contem resumo em lingua portuguesa.

O documento contem abstract.

O documento contem listas auxiliares.

O documento contem sumario.

O documento contem desenvolvimento textual numerado.

O documento contem referencias.

O documento utiliza linguagem tecnica e impessoal.

O documento apresenta tabelas e figuras textuais.

O documento descreve arquitetura, componentes, dados, API, seguranca, implantacao e testes.

---

# APENDICE B - COMANDOS UTEIS DO PROJETO

Instalar dependencias do backend:

```bash
cd backend
npm install
```

Iniciar backend:

```bash
node server.js
```

Iniciar frontend local:

```bash
cd frontend
python3 -m http.server 5500
```

Executar testes unitarios:

```bash
cd backend
npm test
```

Smoke E2E validado (Mongo 7 + backend healthy): `GET /health`, `POST /auth/register`, `POST /auth/login`, `GET /auth/me`, `PUT /auth/me`, `PUT /auth/password` (fraca 400), `GET /produtos/abc` (400), `GET /produtos?page=1&limit=2` (meta), `GET /clientes` sem `password`.

Subir servicos com Docker Compose:

```bash
docker compose up -d
```

Verificar saude da API:

```bash
curl http://localhost:5000/health
```
