const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { tag, api, adminToken, limparPorTag } = require('./helpers');

describe('e2e placas de TV (tipo/marca/modelo)', () => {
  let atok;
  let catId;
  let prodId;

  it('setup', async () => {
    atok = await adminToken();
    const c = await api('POST', '/api/categorias', {
      token: atok,
      body: { nome: `E2E TV ${tag}`, status: 'ativo' },
    });
    catId = c.data.categoria._id;
  });

  it('cria placa com tipo/marca/modelo', async () => {
    const p = await api('POST', '/api/produtos', {
      token: atok,
      body: {
        nome: `Placa Fonte E2E ${tag}`, sku: `TV-E2E-${tag}`, preco: 99.9,
        quantidade: 10, peso: 0.5, status: 'ativo', categoria: catId,
        tipoPlaca: 'FONTE', marca: 'E2EMarca', modeloTV: 'E2E-55X',
        dimensoes: { c: 40, l: 30, a: 5 },
      },
    });
    assert.equal(p.status, 200);
    assert.equal(p.data.produto.tipoPlaca, 'FONTE');
    assert.equal(p.data.produto.marca, 'E2EMarca');
    assert.equal(p.data.produto.modeloTV, 'E2E-55X');
    prodId = p.data.produto._id;
  });

  it('tipo invalido retorna 400', async () => {
    const r = await api('POST', '/api/produtos', {
      token: atok,
      body: { nome: 'X', sku: `TV-BAD-${tag}`, preco: 10, quantidade: 1, tipoPlaca: 'XYZ' },
    });
    assert.equal(r.status, 400);
  });

  it('filtra por tipoPlaca e marca e busca q', async () => {
    const t = await api('GET', `/api/produtos?status=ativo&tipoPlaca=FONTE&limit=100`);
    assert.equal(t.status, 200);
    assert.ok(t.data.produtos.some((p) => String(p._id) === String(prodId)));
    assert.ok(t.data.produtos.every((p) => p.tipoPlaca === 'FONTE'));
    const m = await api('GET', `/api/produtos?status=ativo&marca=e2emarca&limit=100`);
    assert.ok(m.data.produtos.some((p) => String(p._id) === String(prodId)));
    const q = await api('GET', `/api/produtos?status=ativo&q=E2E-55X&limit=100`);
    assert.ok(q.data.produtos.some((p) => String(p._id) === String(prodId)));
    const bad = await api('GET', `/api/produtos?status=ativo&tipoPlaca=XYZ&limit=100`);
    assert.equal(bad.status, 400);
  });

  it('cotacao usa peso da placa', async () => {
    const r = await api('POST', '/api/frete/cotacao', {
      body: { uf: 'SP', items: [{ produtoId: prodId, quantity: 2 }] },
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.subtotal, 199.8);
    assert.equal(r.data.peso, 1);
  });

  after(async () => {
    if (prodId) await api('DELETE', `/api/produtos/${prodId}`, { token: atok });
    if (catId) await api('DELETE', `/api/categorias/${catId}`, { token: atok });
    await limparPorTag(atok, tag);
  });
});
