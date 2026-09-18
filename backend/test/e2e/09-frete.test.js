const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { tag, api, register, adminToken, limparPorTag } = require('./helpers');

describe('e2e frete por tabela', () => {
  let atok;
  let utok;
  let catId;
  let prodId;

  it('setup', async () => {
    atok = await adminToken();
    const u = await register(`e2e-frt-${tag}@t.t`, 'E2E Frete');
    utok = u.data.token;
    const c = await api('POST', '/api/categorias', {
      token: atok,
      body: { nome: `E2E Frt ${tag}`, status: 'ativo' },
    });
    catId = c.data.categoria._id;
    const p = await api('POST', '/api/produtos', {
      token: atok,
      body: { nome: 'E2E Frete Item', sku: `E2EFR-${tag}`, preco: 30, quantidade: 50, peso: 2, status: 'ativo', categoria: catId },
    });
    prodId = p.data.produto._id;
  });

  it('cotacao valida UF e itens', async () => {
    assert.equal((await api('POST', '/api/frete/cotacao', { body: { uf: 'XX1', items: [] } })).status, 400);
    assert.equal((await api('POST', '/api/frete/cotacao', { body: { uf: 'SP', items: [] } })).status, 400);
  });

  it('sem faixas: regra legada (30x2=60 +20)', async () => {
    const r = await api('POST', '/api/frete/cotacao', {
      body: { uf: 'SP', items: [{ produtoId: prodId, quantity: 2 }] },
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.subtotal, 60);
    assert.equal(r.data.valor, 20);
  });

  it('faixa SP: 15 ate 30kg, gratis acima de 200', async () => {
    const put = await api('PUT', '/api/config/loja', {
      token: atok,
      body: { faixasFrete: [{ uf: 'SP', atePeso: 30, valor: 15, gratisAcima: 200, prazoDias: 3 }] },
    });
    assert.equal(put.status, 200);
    const r1 = await api('POST', '/api/frete/cotacao', {
      body: { uf: 'SP', items: [{ produtoId: prodId, quantity: 2 }] },
    });
    assert.equal(r1.data.valor, 15);
    assert.equal(r1.data.prazoDias, 3);
    const r2 = await api('POST', '/api/frete/cotacao', {
      body: { uf: 'RJ', items: [{ produtoId: prodId, quantity: 2 }] },
    });
    assert.equal(r2.data.valor, 20);
    const r3 = await api('POST', '/api/frete/cotacao', {
      body: { uf: 'SP', items: [{ produtoId: prodId, quantity: 8 }] },
    });
    assert.equal(r3.data.valor, 0);
  });

  it('pedido usa a tabela (frete 15, total 60+15)', async () => {
    const r = await api('POST', '/api/pedidos', {
      token: utok,
      body: {
        cliente: { nome: 'F' },
        endereco: { logradouro: 'R', numero: '1', cidade: 'Sao Paulo', estado: 'SP' },
        pagamento: 'card',
        items: [{ produtoId: prodId, quantity: 2 }],
      },
    });
    assert.equal(r.status, 201);
    assert.equal(r.data.pedido.frete, 15);
    assert.equal(r.data.pedido.total, 75);
  });

  it('faixa invalida retorna 400', async () => {
    const r = await api('PUT', '/api/config/loja', {
      token: atok,
      body: { faixasFrete: [{ uf: 'SPX', atePeso: 1, valor: 1 }] },
    });
    assert.equal(r.status, 400);
  });

  after(async () => {
    await api('PUT', '/api/config/loja', { token: atok, body: { faixasFrete: [] } });
    if (prodId) await api('DELETE', `/api/produtos/${prodId}`, { token: atok });
    if (catId) await api('DELETE', `/api/categorias/${catId}`, { token: atok });
    await limparPorTag(atok, tag);
  });
});
