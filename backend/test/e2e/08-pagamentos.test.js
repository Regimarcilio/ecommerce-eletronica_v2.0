const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { tag, api, register, adminToken, limparPorTag } = require('./helpers');

// Roda em modo mock (sem MP_ACCESS_TOKEN/MP_WEBHOOK_SECRET configurados).
describe('e2e pagamentos + whatsapp', () => {
  let atok;
  let utok;
  let evilTok;
  let catId;
  let prodId;
  let pedidoId;

  it('setup', async () => {
    atok = await adminToken();
    const u = await register(`e2e-pay-${tag}@t.t`, 'E2E Pay');
    utok = u.data.token;
    const e = await register(`e2e-pay-evil-${tag}@t.t`, 'E2E Evil');
    evilTok = e.data.token;
    const c = await api('POST', '/api/categorias', {
      token: atok,
      body: { nome: `E2E Pay ${tag}`, status: 'ativo' },
    });
    catId = c.data.categoria._id;
    const p = await api('POST', '/api/produtos', {
      token: atok,
      body: { nome: 'E2E Pay Item', sku: `E2EPY-${tag}`, preco: 50, quantidade: 10, status: 'ativo', categoria: catId },
    });
    prodId = p.data.produto._id;
    const o = await api('POST', '/api/pedidos', {
      token: utok,
      body: {
        cliente: { nome: 'Pay', telefone: '11999999999' },
        endereco: { logradouro: 'R', numero: '1' },
        pagamento: 'pix',
        items: [{ produtoId: prodId, quantity: 1 }],
      },
    });
    pedidoId = o.data.pedido._id;
  });

  it('intent de outro usuario retorna 403', async () => {
    const r = await api('POST', '/api/pagamentos/intent', { token: evilTok, body: { pedidoId } });
    assert.equal(r.status, 403);
  });

  it('intent cria preferencia mock', async () => {
    const r = await api('POST', '/api/pagamentos/intent', { token: utok, body: { pedidoId } });
    assert.equal(r.status, 200);
    assert.equal(r.data.modo, 'mock');
    assert.ok(r.data.initPoint);
  });

  it('webhook aprova, marca pago e e idempotente', async () => {
    const w = await api('POST', '/api/pagamentos/webhook', { body: { pedidoId, status: 'aprovado' } });
    assert.equal(w.status, 200);
    const g = await api('GET', `/api/pedidos/${pedidoId}`, { token: utok });
    assert.equal(g.data.pedido.status, 'pago');
    const w2 = await api('POST', '/api/pagamentos/webhook', { body: { pedidoId, status: 'aprovado' } });
    assert.equal(w2.status, 200);
    const g2 = await api('GET', `/api/pedidos/${pedidoId}`, { token: utok });
    assert.equal(g2.data.pedido.status, 'pago');
  });

  it('intent em pedido pago retorna 409', async () => {
    const r = await api('POST', '/api/pagamentos/intent', { token: utok, body: { pedidoId } });
    assert.equal(r.status, 409);
  });

  after(async () => {
    if (prodId) await api('DELETE', `/api/produtos/${prodId}`, { token: atok });
    if (catId) await api('DELETE', `/api/categorias/${catId}`, { token: atok });
    await limparPorTag(atok, tag);
  });
});
