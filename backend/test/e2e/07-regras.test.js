const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { tag, api, register, adminToken, limparPorTag } = require('./helpers');

describe('e2e regras: estados + soft-delete', () => {
  let atok;
  let utok;
  let catId;
  let prodId;
  let pedidoId;

  it('setup', async () => {
    atok = await adminToken();
    const u = await register(`e2e-reg-${tag}@t.t`, 'E2E Regras');
    utok = u.data.token;
    const c = await api('POST', '/api/categorias', {
      token: atok,
      body: { nome: `E2E Reg ${tag}`, status: 'ativo' },
    });
    catId = c.data.categoria._id;
    const p = await api('POST', '/api/produtos', {
      token: atok,
      body: { nome: 'E2E Reg Item', sku: `E2ERG-${tag}`, preco: 10, quantidade: 10, status: 'ativo', categoria: catId },
    });
    prodId = p.data.produto._id;
    const o = await api('POST', '/api/pedidos', {
      token: utok,
      body: {
        cliente: { nome: 'R' },
        endereco: { logradouro: 'R', numero: '1' },
        pagamento: 'card',
        items: [{ produtoId: prodId, quantity: 1 }],
      },
    });
    pedidoId = o.data.pedido._id;
  });

  it('salto pendente→entregue retorna 422 TRANSITION', async () => {
    const r = await api('PUT', `/api/pedidos/${pedidoId}/status`, {
      token: atok,
      body: { status: 'entregue' },
    });
    assert.equal(r.status, 422);
    assert.equal(r.data.code, 'TRANSITION');
  });

  it('fluxo valido pendente→pago→enviado→entregue', async () => {
    for (const s of ['pago', 'enviado', 'entregue']) {
      const r = await api('PUT', `/api/pedidos/${pedidoId}/status`, { token: atok, body: { status: s } });
      assert.equal(r.status, 200);
      assert.equal(r.data.pedido.status, s);
    }
    const fim = await api('PUT', `/api/pedidos/${pedidoId}/status`, { token: atok, body: { status: 'cancelado' } });
    assert.equal(fim.status, 422);
  });

  it('soft-delete libera sku/nome para reuso (indice parcial)', async () => {
    const one = await api('POST', '/api/produtos', {
      token: atok,
      body: { nome: 'E2E Reuso', sku: `E2ERS-${tag}`, preco: 20, quantidade: 3, status: 'ativo', categoria: catId },
    });
    assert.equal(one.status, 200);
    assert.equal((await api('DELETE', `/api/produtos/${one.data.produto._id}`, { token: atok })).status, 200);
    const again = await api('POST', '/api/produtos', {
      token: atok,
      body: { nome: 'E2E Reuso Novo', sku: `E2ERS-${tag}`, preco: 20, quantidade: 3, status: 'ativo', categoria: catId },
    });
    assert.equal(again.status, 200);
    await api('DELETE', `/api/produtos/${again.data.produto._id}`, { token: atok });
    const cat0 = await api('POST', '/api/categorias', {
      token: atok,
      body: { nome: `E2E Reuso ${tag}`, status: 'ativo' },
    });
    assert.equal(cat0.status, 200);
    assert.equal((await api('DELETE', `/api/categorias/${cat0.data.categoria._id}`, { token: atok })).status, 200);
    const cat2 = await api('POST', '/api/categorias', {
      token: atok,
      body: { nome: `E2E Reuso ${tag}`, status: 'ativo' },
    });
    assert.equal(cat2.status, 200);
    await api('DELETE', `/api/categorias/${cat2.data.categoria._id}`, { token: atok });
  });

  it('soft-delete: some da lista/detalhe/PUT e bloqueia pedido', async () => {
    const del = await api('DELETE', `/api/produtos/${prodId}`, { token: atok });
    assert.equal(del.status, 200);
    assert.equal((await api('GET', `/api/produtos/${prodId}`)).status, 404);
    const list = await api('GET', '/api/produtos?limit=100', { token: atok });
    assert.ok(!list.data.produtos.some((p) => p._id === prodId));
    assert.equal(
      (await api('PUT', `/api/produtos/${prodId}`, { token: atok, body: { nome: 'X' } })).status,
      404
    );
    const ped = await api('POST', '/api/pedidos', {
      token: utok,
      body: {
        cliente: { nome: 'R' },
        endereco: { logradouro: 'R', numero: '1' },
        pagamento: 'card',
        items: [{ produtoId: prodId, quantity: 1 }],
      },
    });
    assert.equal(ped.status, 400);
  });

  after(async () => {
    if (catId) await api('DELETE', `/api/categorias/${catId}`, { token: atok });
    await limparPorTag(atok, tag);
  });
});
