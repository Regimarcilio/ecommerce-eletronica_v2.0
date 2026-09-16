const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { tag, api, register, adminToken } = require('./helpers');

describe('e2e pedido + estoque + enderecos', () => {
  let atok;
  let utok;
  let evilTok;
  let catId;
  let prodId;

  it('setup: admin, comprador e segundo usuario', async () => {
    atok = await adminToken();
    const a = await register(`e2e-buy-${tag}@t.t`, 'E2E Buyer');
    assert.equal(a.status, 200);
    utok = a.data.token;
    const b = await register(`e2e-evil-${tag}@t.t`, 'E2E Evil');
    assert.equal(b.status, 200);
    evilTok = b.data.token;
    const c = await api('POST', '/api/categorias', {
      token: atok,
      body: { nome: `E2E Ped ${tag}`, status: 'ativo' },
    });
    catId = c.data.categoria._id;
    const p = await api('POST', '/api/produtos', {
      token: atok,
      body: {
        nome: 'E2E Item',
        sku: `E2EIT-${tag}`,
        preco: 60,
        quantidade: 20,
        status: 'ativo',
        categoria: catId,
      },
    });
    prodId = p.data.produto._id;
  });

  const pedidoBase = (items, extra = {}) => ({
    cliente: { nome: 'E2E Buyer' },
    endereco: { logradouro: 'Rua A', numero: '1' },
    pagamento: 'card',
    items,
    ...extra,
  });

  it('total adulterado e ignorado: 2x60 card = 120', async () => {
    const r = await api('POST', '/api/pedidos', {
      token: utok,
      body: pedidoBase([{ produtoId: prodId, quantity: 2 }], { total: 1, subtotal: 1 }),
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.pedido.subtotal, 120);
    assert.equal(r.data.pedido.frete, 0);
    assert.equal(r.data.pedido.total, 120);
  });

  it('pix 1x60 = 77 (60+20-3)', async () => {
    const r = await api('POST', '/api/pedidos', {
      token: utok,
      body: pedidoBase([{ produtoId: prodId, quantity: 1 }], { pagamento: 'pix' }),
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.pedido.desconto, 3);
    assert.equal(r.data.pedido.total, 77);
  });

  it('estoque decrementado e oversell retorna 409', async () => {
    const g = await api('GET', `/api/produtos/${prodId}`);
    assert.equal(g.data.produto.quantidade, 17);
    const over = await api('POST', '/api/pedidos', {
      token: utok,
      body: pedidoBase([{ produtoId: prodId, quantity: 99 }]),
    });
    assert.equal(over.status, 409);
  });

  it('pedido de outro usuario retorna 403', async () => {
    const list = await api('GET', '/api/pedidos', { token: utok });
    const pid = list.data.pedidos[0]._id;
    const r = await api('GET', `/api/pedidos/${pid}`, { token: evilTok });
    assert.equal(r.status, 403);
  });

  it('enderecos: CRUD + CEP invalido 400 + cross-user 404', async () => {
    const c = await api('POST', '/api/auth/enderecos', {
      token: utok,
      body: {
        logradouro: 'Av X',
        numero: '10',
        bairro: 'B',
        cidade: 'C',
        estado: 'sp',
        cep: '01310-100',
      },
    });
    assert.equal(c.status, 201);
    const eid = c.data.enderecos.at(-1)._id;
    assert.equal(c.data.enderecos.at(-1).estado, 'SP');
    const bad = await api('POST', '/api/auth/enderecos', {
      token: utok,
      body: {
        logradouro: 'X',
        numero: '1',
        bairro: 'B',
        cidade: 'C',
        estado: 'SP',
        cep: '123',
      },
    });
    assert.equal(bad.status, 400);
    const cross = await api('PUT', `/api/auth/enderecos/${eid}`, {
      token: evilTok,
      body: {
        logradouro: 'Av X',
        numero: '9',
        bairro: 'B',
        cidade: 'C',
        estado: 'SP',
        cep: '01310-100',
      },
    });
    assert.equal(cross.status, 404);
    const del = await api('DELETE', `/api/auth/enderecos/${eid}`, { token: utok });
    assert.equal(del.status, 200);
    assert.equal(del.data.enderecos.length, 0);
  });

  after(async () => {
    if (prodId) await api('DELETE', `/api/produtos/${prodId}`, { token: atok });
    if (catId) await api('DELETE', `/api/categorias/${catId}`, { token: atok });
  });
});
