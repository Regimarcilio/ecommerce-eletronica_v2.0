const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { tag, api, register, adminToken } = require('./helpers');

describe('e2e catalogo + rbac + paging', () => {
  let atok;
  let utok;
  let catId;
  const prodIds = [];

  it('setup: admin + user comum', async () => {
    atok = await adminToken();
    const r = await register(`e2e-rbac-${tag}@t.t`, 'E2E Rbac');
    assert.equal(r.status, 200);
    utok = r.data.token;
  });

  it('admin cria categoria e produto', async () => {
    const c = await api('POST', '/api/categorias', {
      token: atok,
      body: { nome: `E2E Cat ${tag}`, status: 'ativo' },
    });
    assert.equal(c.status, 200);
    catId = c.data.categoria._id;
    const p = await api('POST', '/api/produtos', {
      token: atok,
      body: {
        nome: 'E2E Base',
        sku: `E2E-${tag}-0`,
        preco: 10,
        quantidade: 100,
        status: 'ativo',
        categoria: catId,
      },
    });
    assert.equal(p.status, 200);
    prodIds.push(p.data.produto._id);
  });

  it('user comum criar produto retorna 403', async () => {
    const r = await api('POST', '/api/produtos', {
      token: utok,
      body: { nome: 'Hack', sku: `HACK-${tag}`, preco: 1, quantidade: 1 },
    });
    assert.equal(r.status, 403);
  });

  it('sem token listar pedidos retorna 401', async () => {
    const r = await api('GET', '/api/pedidos');
    assert.equal(r.status, 401);
  });

  it('id invalido retorna 400 VALIDATION', async () => {
    const r = await api('GET', '/api/produtos/abc');
    assert.equal(r.status, 400);
    assert.equal(r.data.code, 'VALIDATION');
  });

  it('ficha completa: descricao roundtrip + validacao numerica', async () => {
    const badPrice = await api('POST', '/api/produtos', {
      token: atok,
      body: { nome: 'Bad', sku: `BAD-${tag}`, descricao: 'x', preco: -5, quantidade: 1, categoria: catId },
    });
    assert.equal(badPrice.status, 400);
    const badQty = await api('POST', '/api/produtos', {
      token: atok,
      body: { nome: 'Bad', sku: `BAD2-${tag}`, descricao: 'x', preco: 5, quantidade: 1.5, categoria: catId },
    });
    assert.equal(badQty.status, 400);
    const xss = '<img src=x onerror=alert(1)>Fone top';
    const c = await api('POST', '/api/produtos', {
      token: atok,
      body: { nome: 'E2E Ficha', sku: `E2EFI-${tag}`, descricao: xss, preco: 99.9, quantidade: 7, categoria: catId },
    });
    assert.equal(c.status, 200);
    assert.equal(c.data.produto.descricao, xss);
    prodIds.push(c.data.produto._id);
    const g = await api('GET', `/api/produtos/${c.data.produto._id}`);
    assert.equal(g.data.produto.preco, 99.9);
    assert.equal(g.data.produto.quantidade, 7);
    const up = await api('PUT', `/api/produtos/${c.data.produto._id}`, {
      token: atok,
      body: { nome: 'E2E Ficha', sku: `E2EFI-${tag}`, descricao: 'Atualizada', preco: 99.9, quantidade: 7, categoria: catId },
    });
    assert.equal(up.status, 200);
    assert.equal(up.data.produto.descricao, 'Atualizada');
  });

  it('paging: 14 itens -> p1=12 p2=2 pages=2', async () => {
    for (let i = 1; i <= 12; i++) {
      const p = await api('POST', '/api/produtos', {
        token: atok,
        body: {
          nome: `E2E Pag ${i}`,
          sku: `E2EPG-${tag}-${i}`,
          preco: 5,
          quantidade: 5,
          status: 'ativo',
          categoria: catId,
        },
      });
      assert.equal(p.status, 200);
      prodIds.push(p.data.produto._id);
    }
    const p1 = await api(
      'GET',
      `/api/produtos?status=ativo&categoria=${catId}&page=1&limit=12`,
      { token: atok }
    );
    assert.equal(p1.data.total, 14);
    assert.equal(p1.data.pages, 2);
    assert.equal(p1.data.produtos.length, 12);
    const p2 = await api(
      'GET',
      `/api/produtos?status=ativo&categoria=${catId}&page=2&limit=12`,
      { token: atok }
    );
    assert.equal(p2.data.page, 2);
    assert.equal(p2.data.produtos.length, 2);
  });

  after(async () => {
    for (const id of prodIds) {
      await api('DELETE', `/api/produtos/${id}`, { token: atok });
    }
    if (catId) await api('DELETE', `/api/categorias/${catId}`, { token: atok });
  });
});
