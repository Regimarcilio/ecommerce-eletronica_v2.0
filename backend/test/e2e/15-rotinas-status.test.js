const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { tag, api, register, adminToken, limparPorTag } = require('./helpers');

describe('e2e rotinas automaticas + rastreio + recebido', () => {
  let atok;
  let utok;
  let evilTok;
  let catId;
  let prodId;

  it('setup: admin, comprador, evil, catalogo', async () => {
    atok = await adminToken();
    const a = await register(`e2e-rot-${tag}@t.t`, 'E2E Rot');
    assert.equal(a.status, 200);
    utok = a.data.token;
    const b = await register(`e2e-rot-evil-${tag}@t.t`, 'E2E Rot Evil');
    assert.equal(b.status, 200);
    evilTok = b.data.token;
    const c = await api('POST', '/api/categorias', { token: atok, body: { nome: `E2E Rot ${tag}` } });
    catId = c.data.categoria._id;
    const p = await api('POST', '/api/produtos', {
      token: atok,
      body: { nome: 'E2E Rot Item', sku: `E2ERT-${tag}`, preco: 40, quantidade: 10, categoria: catId },
    });
    prodId = p.data.produto._id;
  });

  const novoPedido = (token) => api('POST', '/api/pedidos', {
    token,
    body: {
      cliente: { nome: 'E2E Rot' },
      endereco: { logradouro: 'Rua R', numero: '1' },
      pagamento: 'card',
      items: [{ produtoId: prodId, quantity: 2 }],
    },
  });

  it('rastreio: auth, dono e validacoes', async () => {
    const o = await novoPedido(utok);
    assert.equal(o.status, 201);
    const pid = o.data.pedido._id;
    assert.equal((await api('PUT', `/api/pedidos/${pid}/rastreio`, {})).status, 401);
    assert.equal((await api('PUT', `/api/pedidos/${pid}/rastreio`, { token: evilTok, body: { trackingCode: 'AA123' } })).status, 403);
    assert.equal((await api('PUT', `/api/pedidos/${pid}/rastreio`, { token: utok, body: { trackingCode: 'AA123' } })).status, 403);
    assert.equal((await api('PUT', `/api/pedidos/${pid}/rastreio`, { token: atok, body: {} })).status, 400);
    assert.equal((await api('PUT', `/api/pedidos/${pid}/rastreio`, { token: atok, body: { trackingCode: 'ab' } })).status, 400);
    const ok = await api('PUT', `/api/pedidos/${pid}/rastreio`, { token: atok, body: { trackingCode: 'br123456789' } });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.pedido.status, 'enviado');
    assert.equal(ok.data.pedido.trackingCode, 'BR123456789');
    const g = await api('GET', `/api/pedidos/${pid}`, { token: utok });
    assert.equal(g.data.pedido.trackingCode, 'BR123456789');
    const deNovo = await api('PUT', `/api/pedidos/${pid}/rastreio`, { token: atok, body: { trackingCode: 'XX999' } });
    assert.equal(deNovo.status, 422);
    // volta p/ pendente? nao ha transicao; usa outro pedido nos testes abaixo
    const o2 = await novoPedido(utok);
    const pid2 = o2.data.pedido._id;
    const canc = await api('PUT', `/api/pedidos/${pid2}/cancelar`, { token: utok });
    assert.equal(canc.status, 200);
    assert.equal((await api('PUT', `/api/pedidos/${pid2}/rastreio`, { token: atok, body: { trackingCode: 'XX999' } })).status, 422);
    await api('DELETE', `/api/pedidos/${pid2}`, { token: utok });
    // guarda o enviado p/ o teste de recebido
    const o3 = await novoPedido(utok);
    const pid3 = o3.data.pedido._id;
    assert.equal((await api('PUT', `/api/pedidos/${pid3}/rastreio`, { token: atok, body: { trackingCode: 'YY111' } })).status, 200);
    globalThis.__rotEnviado = pid3;
    void pid;
  });

  it('recebido: auth, dono, estado e fluxo feliz', async () => {
    const pid = globalThis.__rotEnviado;
    assert.ok(pid);
    assert.equal((await api('PUT', `/api/pedidos/${pid}/recebido`, {})).status, 401);
    assert.equal((await api('PUT', `/api/pedidos/${pid}/recebido`, { token: evilTok })).status, 403);
    const o = await novoPedido(utok);
    const pidPend = o.data.pedido._id;
    assert.equal((await api('PUT', `/api/pedidos/${pidPend}/recebido`, { token: utok })).status, 409);
    await api('PUT', `/api/pedidos/${pidPend}/cancelar`, { token: utok });
    await api('DELETE', `/api/pedidos/${pidPend}`, { token: utok });
    const ok = await api('PUT', `/api/pedidos/${pid}/recebido`, { token: utok });
    assert.equal(ok.status, 200);
    assert.equal(ok.data.pedido.status, 'entregue');
    assert.equal((await api('PUT', `/api/pedidos/${pid}/recebido`, { token: utok })).status, 409);
  });

  it('rotinas: status, validar agora, auto-cancela com estoque e auto-entrega', async () => {
    assert.equal((await api('POST', '/api/admin/rotinas/executar', {})).status, 401);
    assert.equal((await api('POST', '/api/admin/rotinas/executar', { token: utok })).status, 403);
    assert.equal((await api('GET', '/api/admin/rotinas/status', { token: utok })).status, 403);
    const st0 = await api('GET', '/api/admin/rotinas/status', { token: atok });
    assert.equal(st0.status, 200);
    assert.equal((await api('POST', '/api/admin/rotinas/executar?agora=x-invalida', { token: atok })).status, 400);
    assert.equal((await api('PUT', '/api/config/loja', { token: atok, body: { diasEntregaAuto: 99 } })).status, 400);
    assert.equal((await api('PUT', '/api/config/loja', { token: atok, body: { diasCancelaPendente: -1 } })).status, 400);
    const futuroCancela = new Date(Date.now() + 4 * 24 * 3600 * 1000).toISOString();
    const futuroEntrega = new Date(Date.now() + 16 * 24 * 3600 * 1000).toISOString();
    // auto-cancela: cria (-2 estoque) -> executar -> cancelado + estoque de volta
    const antes = await api('GET', `/api/produtos/${prodId}`);
    const q0 = antes.data.produto.quantidade;
    const o = await novoPedido(utok);
    assert.equal(o.status, 201);
    const pid = o.data.pedido._id;
    const run1 = await api('POST', `/api/admin/rotinas/executar?agora=${futuroCancela}`, { token: atok, body: { pedidoIds: [pid] } });
    assert.equal(run1.status, 200);
    assert.equal(run1.data.rotinas.cancelados, 1);
    const g = await api('GET', `/api/produtos/${prodId}`);
    assert.equal(g.data.produto.quantidade, q0);
    await api('DELETE', `/api/pedidos/${pid}`, { token: utok });
    // auto-entrega: cria -> rastreio -> executar -> entregue
    const o2 = await novoPedido(utok);
    const pid2 = o2.data.pedido._id;
    assert.equal((await api('PUT', `/api/pedidos/${pid2}/rastreio`, { token: atok, body: { trackingCode: 'ZZ222' } })).status, 200);
    const run2 = await api('POST', `/api/admin/rotinas/executar?agora=${futuroEntrega}`, { token: atok, body: { pedidoIds: [pid2] } });
    assert.equal(run2.status, 200);
    assert.equal(run2.data.rotinas.entregues, 1);
    const g2 = await api('GET', `/api/pedidos/${pid2}`, { token: utok });
    assert.equal(g2.data.pedido.status, 'entregue');
    const st1 = await api('GET', '/api/admin/rotinas/status', { token: atok });
    assert.ok(st1.data.rotinas.ultima && typeof st1.data.rotinas.ultima.ms === 'number');
  });

  after(async () => {
    if (prodId) await api('DELETE', `/api/produtos/${prodId}`, { token: atok });
    if (catId) await api('DELETE', `/api/categorias/${catId}`, { token: atok });
    await limparPorTag(atok, tag);
  });
});
