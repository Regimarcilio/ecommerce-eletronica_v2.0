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

  it('oauth MP: sem client configurado retorna CONFIG; grant invalido 400', async () => {
    const url = await api('GET', '/api/pagamentos/mercadopago/oauth/url', { token: atok });
    assert.ok([200, 400].includes(url.status));
    if (url.status === 400) assert.match(url.data.message, /MP_CLIENT_ID/);
    assert.equal((await api('GET', '/api/pagamentos/mercadopago/oauth/url', { token: utok })).status, 403);
    const bad = await api('POST', '/api/pagamentos/mercadopago/oauth/token', { token: atok, body: { grant_type: 'x' } });
    assert.equal(bad.status, 400);
    const semCode = await api('POST', '/api/pagamentos/mercadopago/oauth/token', { token: atok, body: { grant_type: 'authorization_code' } });
    assert.ok([400].includes(semCode.status));
    const st = await api('GET', '/api/pagamentos/mercadopago/oauth/status', { token: atok });
    assert.equal(st.status, 200);
    assert.equal(typeof st.data.oauth.conectado, 'boolean');
  });

  it('auditoria admin lista intents com filtros; dono recebe 403', async () => {
    assert.equal((await api('GET', '/api/pagamentos', {})).status, 401);
    assert.equal((await api('GET', '/api/pagamentos', { token: utok })).status, 403);
    const all = await api('GET', '/api/pagamentos', { token: atok });
    assert.equal(all.status, 200);
    assert.ok(all.data.pagamentos.some((p) => String(p.pedidoId) === String(pedidoId)));
    const f = await api('GET', '/api/pagamentos?provedor=mercadopago&status=aprovado', { token: atok });
    assert.equal(f.status, 200);
    assert.ok(f.data.pagamentos.every((p) => p.provedor === 'mercadopago' && p.status === 'aprovado'));
    assert.ok(f.data.pagamentos[0].pedido && f.data.pagamentos[0].pedido.numero);
  });

  after(async () => {
    if (prodId) await api('DELETE', `/api/produtos/${prodId}`, { token: atok });
    if (catId) await api('DELETE', `/api/categorias/${catId}`, { token: atok });
    await limparPorTag(atok, tag);
  });
});
