const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { tag, api, register, adminToken, limparPorTag } = require('./helpers');

// Roda em modo mock (sem PGS_TOKEN/PGS_WEBHOOK_TOKEN configurados).
describe('e2e pagseguro (mock)', () => {
  let atok;
  let utok;
  let catId;
  let prodId;
  let pedidoId;

  it('setup', async () => {
    atok = await adminToken();
    const u = await register(`e2e-pgs-${tag}@t.t`, 'E2E Pgs');
    utok = u.data.token;
    const c = await api('POST', '/api/categorias', {
      token: atok,
      body: { nome: `E2E Pgs ${tag}`, status: 'ativo' },
    });
    catId = c.data.categoria._id;
    const p = await api('POST', '/api/produtos', {
      token: atok,
      body: { nome: 'E2E Pgs Item', sku: `EEPGS-${tag}`, preco: 80, quantidade: 10, status: 'ativo', categoria: catId },
    });
    prodId = p.data.produto._id;
    const o = await api('POST', '/api/pedidos', {
      token: utok,
      body: {
        cliente: { nome: 'Pgs', telefone: '11999999999' },
        endereco: { logradouro: 'R', numero: '1', bairro: 'B', cidade: 'C', estado: 'SP', cep: '01000-000' },
        pagamento: 'pix',
        items: [{ produtoId: prodId, quantity: 1 }],
      },
    });
    pedidoId = o.data.pedido._id;
  });

  it('intent pagseguro cria cobranca mock', async () => {
    const r = await api('POST', '/api/pagamentos/pagseguro/intent', { token: utok, body: { pedidoId } });
    assert.equal(r.status, 200);
    assert.equal(r.data.modo, 'mock');
    assert.ok(r.data.orderId);
  });

  it('status do pagamento visivel ao dono', async () => {
    const r = await api('GET', `/api/pagamentos/${pedidoId}`, { token: utok });
    assert.equal(r.status, 200);
    assert.equal(r.data.pagamento.provedor, 'pagseguro');
  });

  it('webhook aprova e marca pago (idempotente)', async () => {
    const w = await api('POST', '/api/pagamentos/pagseguro/webhook', { body: { pedidoId, status: 'paid' } });
    assert.equal(w.status, 200);
    const g = await api('GET', `/api/pedidos/${pedidoId}`, { token: utok });
    assert.equal(g.data.pedido.status, 'pago');
  });

  it('intent em pedido pago retorna 409', async () => {
    const r = await api('POST', '/api/pagamentos/pagseguro/intent', { token: utok, body: { pedidoId } });
    assert.equal(r.status, 409);
  });

  after(async () => {
    if (prodId) await api('DELETE', `/api/produtos/${prodId}`, { token: atok });
    if (catId) await api('DELETE', `/api/categorias/${catId}`, { token: atok });
    await limparPorTag(atok, tag);
  });
});
