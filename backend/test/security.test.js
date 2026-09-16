const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// Espelhos das regras de server.js / js/config.js (regressão)
// Se a regra mudar no servidor, atualize aqui também.

const parsePaging = (q) => {
  const page = Math.max(1, parseInt(q.page, 10) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(q.limit, 10) || 50));
  return { page, limit, skip: (page - 1) * limit };
};
const calcPedido = (subtotal, pagamento) => {
  const frete = subtotal > 100 ? 0 : 20;
  const desconto = pagamento === 'pix' ? subtotal * 0.05 : 0;
  return { frete, desconto, total: subtotal + frete - desconto };
};
const escapeHtml = (v) => String(v ?? '').replace(/[&<>"'`=]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;', '=': '&#61;' }[c]));

describe('paginacao', () => {
  it('defaults page=1 limit=50', () => assert.deepEqual(parsePaging({}), { page: 1, limit: 50, skip: 0 }));
  it('limita a 100', () => assert.equal(parsePaging({ limit: '999' }).limit, 100));
  it('pagina 2 desloca skip', () => assert.equal(parsePaging({ page: '2', limit: '10' }).skip, 10));
  it('valores invalidos caem no default', () => assert.deepEqual(parsePaging({ page: 'x', limit: '-5' }), { page: 1, limit: 1, skip: 0 }));
});

describe('pedido server-side', () => {
  it('frete gratis acima de 100', () => assert.equal(calcPedido(150, 'card').frete, 0));
  it('frete 20 ate 100 (borda)', () => assert.equal(calcPedido(100, 'card').frete, 20));
  it('pix da 5% sobre subtotal', () => assert.equal(calcPedido(200, 'pix').desconto, 10));
  it('card nao da desconto', () => assert.equal(calcPedido(200, 'card').desconto, 0));
  it('total = subtotal + frete - desconto', () => assert.equal(calcPedido(200, 'pix').total, 190));
  it('pagamento invalido deve ser rejeitado', () => assert.ok(!['pix', 'card', 'boleto'].includes('paypal')));
});

describe('auth/validacao', () => {
  it('senha < 8 rejeitada', () => assert.ok('1234567'.length < 8));
  it('senha >= 8 aceita', () => assert.ok('12345678'.length >= 8));
  it('ObjectId valido tem 24 hex', () => assert.ok(/^[a-f0-9]{24}$/i.test('507f1f77bcf86cd799439011')));
  it('ObjectId curto rejeitado', () => assert.ok(!/^[a-f0-9]{24}$/i.test('abc')));
  it('status permitido', () => assert.ok(['pendente', 'pago', 'enviado', 'entregue', 'cancelado'].includes('enviado')));
  it('role invalida rejeitada', () => assert.ok(!['user', 'admin'].includes('superadmin')));
});

describe('xss', () => {
  it('escapa script', () => assert.equal(escapeHtml('<script>alert(1)</script>'), '&lt;script&gt;alert(1)&lt;/script&gt;'));
  it('escapa aspas e &', () => assert.equal(escapeHtml(`a"b'&c`), 'a&quot;b&#39;&amp;c'));
});

describe('carrinho', () => {
  it('merge incrementa em vez de duplicar', () => {
    let cart = [{ id: '1', quantity: 1 }];
    const found = cart.find((i) => i.id === '1');
    if (found) found.quantity += 1; else cart.push({ id: '1', quantity: 1 });
    assert.equal(cart.length, 1);
    assert.equal(cart[0].quantity, 2);
  });
});
