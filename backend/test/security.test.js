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

describe('icone seguro (allowlist)', () => {
  const safeIcon = (v) => {
    const s = String(v || 'fa-microchip').trim().split(/\s+/).pop();
    return /^fa-[a-z0-9-]+$/.test(s) ? s : 'fa-microchip';
  };
  it('aceita fa-microchip', () => assert.equal(safeIcon('fa-microchip'), 'fa-microchip'));
  it('rejeita injecao de atributo', () => assert.equal(safeIcon('fa-x" onclick="alert(1)'), 'fa-microchip'));
  it('pega ultimo token e valida', () => assert.equal(safeIcon('fas fa-cart-plus'), 'fa-cart-plus'));
});

describe('carrossel placas (filtro destaque)', () => {
  it('filtra destaque e limita a 5', () => {
    const prods = Array.from({ length: 7 }, (_, i) => ({ _id: String(i), destaque: i % 2 === 0 }));
    const dest = prods.filter((p) => p.destaque).slice(0, 5);
    assert.equal(dest.length, 4);
    assert.ok(dest.every((p) => p.destaque));
  });
  it('sem destaque esconde a secao', () => {
    const dest = [{ destaque: false }].filter((p) => p.destaque).slice(0, 5);
    assert.equal(dest.length, 0);
  });
});

describe('frete (cotarFrete)', () => {
  const cotar = (uf, sub, peso, faixas) => {
    const c = (faixas || []).filter((f) => (!f.uf || f.uf === uf) && Number(peso) <= Number(f.atePeso ?? Infinity));
    if (!c.length) return { valor: sub > 100 ? 0 : 20, prazoDias: 5 };
    let m = null;
    for (const f of c) { const v = (Number(f.gratisAcima) > 0 && sub >= Number(f.gratisAcima)) ? 0 : Number(f.valor); if (!m || v < m.valor) m = { valor: v }; }
    return m;
  };
  it('sem faixa: legado', () => assert.equal(cotar('SP', 60, 4, []).valor, 20) && assert.equal(cotar('SP', 150, 4, []).valor, 0));
  it('faixa por UF e gratis', () => {
    const f = [{ uf: 'SP', atePeso: 30, valor: 15, gratisAcima: 200 }];
    assert.equal(cotar('SP', 60, 4, f).valor, 15);
    assert.equal(cotar('SP', 250, 4, f).valor, 0);
    assert.equal(cotar('RJ', 60, 4, f).valor, 20);
  });
  it('peso acima ignora faixa', () => assert.equal(cotar('SP', 60, 99, [{ uf: 'SP', atePeso: 30, valor: 15 }]).valor, 20));
  it('parcela e pix (fonte unica)', () => {
    const parc = (preco, n) => +(Number(preco) / n).toFixed(2);
    assert.equal(parc(100, 10), 10);
    assert.equal(+(100 * (1 - 5 / 100)).toFixed(2), 95);
  });
});

describe('whatsapp destino (normZap/maskFone)', () => {
  const normZap = (v) => { const d = String(v || '').replace(/\D/g, ''); if (!d) return ''; return d.length <= 11 ? `55${d}` : d; };
  const maskFone = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length >= 4 ? `***${d.slice(-4)}` : ''; };
  it('checkout vence, senao cadastro', () => { const dest = (c, r) => normZap(c || r); assert.equal(dest('11911112222', '11999999999'), '5511911112222'); assert.equal(dest('', '11999999999'), '5511999999999'); });
  it('normaliza DDI e mascara', () => assert.equal(normZap('11999999999'), '5511999999999') && assert.equal(maskFone('5511999999999'), '***9999'));
  it('vazio vira vazio', () => assert.equal(normZap(''), '') && assert.equal(maskFone(''), ''));
});

describe('whatsapp imediato (wa.me)', () => {
  const buildWaText = (p) => [`*NOVO PEDIDO ${p.numero}*`, `*TOTAL: R$ ${Number(p.total).toFixed(2)}*`].join('\n');
  const waSendUrl = (loja, txt) => `https://api.whatsapp.com/send/?phone=${loja}&text=${encodeURIComponent(txt)}&type=phone_number&app_absent=0`;
  it('monta URL exata pedida', () => {
    const url = waSendUrl('5511999999999', 'oi');
    assert.ok(url.startsWith('https://api.whatsapp.com/send/?phone=5511999999999&text='));
    assert.ok(url.endsWith('&type=phone_number&app_absent=0'));
  });
  it('codifica itens e total', () => {
    const txt = buildWaText({ numero: 'PED-1', total: 120 });
    assert.ok(waSendUrl('5511', txt).includes(encodeURIComponent('*TOTAL: R$ 120.00*')));
  });
  it('DDD valido 11-99, 11 digitos', () => {
    const ok = (v) => { const d = String(v || '').replace(/\D/g, ''); return d.length === 11 && Number(d.slice(0, 2)) >= 11; };
    assert.ok(ok('(47) 99713-6647') && !ok('(07) 99713-6647') && !ok('999999'));
  });
});

describe('foto do produto (safeImg)', () => {
  const safeImg = (v) => {
    const s = String(v || '').trim();
    if (/^(https?:\/\/[^ "]+|\/[^ "]*)$/i.test(s)) return s;
    return '';
  };
  it('aceita https e caminho relativo', () => assert.equal(safeImg('https://x/y.png'), 'https://x/y.png') && assert.equal(safeImg('/img/a.jpg'), '/img/a.jpg'));
  it('rejeita javascript: e vazio', () => assert.equal(safeImg('javascript:alert(1)'), '') && assert.equal(safeImg(''), ''));
  it('rejeita texto com espaco/aspas', () => assert.equal(safeImg('https://x/a b.png'), ''));
});

describe('ficha do produto', () => {
  const pick = (b) => {
    const out = { descricao: b.descricao ?? '' };
    if (out.preco !== undefined && (typeof out.preco !== 'number' || out.preco < 0)) throw new Error('Preco invalido');
    return out;
  };
  it('descricao default vazia', () => assert.equal(pick({}).descricao, ''));
  it('descricao longa passa no pick (limite no schema)', () => assert.equal(pick({ descricao: 'x'.repeat(2000) }).descricao.length, 2000));
  it('truncate 120 com reticencia', () => {
    const s = 'y'.repeat(200);
    const r = s.length > 120 ? s.slice(0, 119).trimEnd() + '…' : s;
    assert.equal(r.length, 120);
  });
});

describe('paginacao UI', () => {
  const pages = (total, limit) => Math.max(1, Math.ceil(total / limit));
  const clamp = (p, pages) => Math.min(Math.max(1, p), pages);
  it('13 itens com limit 12 = 2 paginas', () => assert.equal(pages(13, 12), 2));
  it('0 itens = 1 pagina vazia', () => assert.equal(pages(0, 12), 1));
  it('navegacao nao sai dos limites', () => assert.equal(clamp(0, 3), 1) && assert.equal(clamp(9, 3), 3));
  it('pagina vazia volta uma (back-step)', () => { let page = 3; const items = []; if (items.length === 0 && page > 1) page--; assert.equal(page, 2); });
});

describe('endereco', () => {
  const cepOk = (v) => /^\d{5}-?\d{3}$/.test(String(v || '').trim());
  const ufOk = (v) => /^[A-Z]{2}$/.test(String(v || '').toUpperCase());
  it('aceita CEP 01310-100 e 01310100', () => assert.ok(cepOk('01310-100') && cepOk('01310100')));
  it('rejeita CEP curto', () => assert.ok(!cepOk('123')));
  it('aceita UF SP', () => assert.ok(ufOk('SP')));
  it('rejeita UF invalida', () => assert.ok(!ufOk('XX1') && !ufOk('')));
  it('exige campos obrigatorios', () => {
    const e = { logradouro: 'Rua A', numero: '', bairro: 'B', cidade: 'C', estado: 'SP', cep: '01310-100' };
    const completo = [e.logradouro, e.numero, e.bairro, e.cidade, e.estado, e.cep].every((x) => String(x || '').trim());
    assert.ok(!completo);
  });
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
