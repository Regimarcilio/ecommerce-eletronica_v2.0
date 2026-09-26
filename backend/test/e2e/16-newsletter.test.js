const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { tag, api, register, adminToken } = require('./helpers');

describe('e2e newsletter + LGPD', () => {
  let atok;
  let utok;
  const email = `e2e-news-${tag}@t.t`;

  it('setup: admin + user', async () => {
    atok = await adminToken();
    const r = await register(`e2e-news-u-${tag}@t.t`, 'E2E News');
    assert.equal(r.status, 200);
    utok = r.data.token;
  });

  it('validacoes: email invalido e aceite obrigatorio', async () => {
    assert.equal((await api('POST', '/api/newsletter', { body: { email: 'x', aceite: true } })).status, 400);
    assert.equal((await api('POST', '/api/newsletter', { body: { email, aceite: false } })).status, 400);
    assert.equal((await api('POST', '/api/newsletter', { body: { email } })).status, 400);
  });

  it('inscreve e idempotente; lista admin; user 403', async () => {
    assert.equal((await api('POST', '/api/newsletter', { body: { nome: 'E2E', email, aceite: true, origem: 'placas' } })).status, 200);
    assert.equal((await api('POST', '/api/newsletter', { body: { email, aceite: true } })).status, 200);
    assert.equal((await api('GET', '/api/newsletter', {})).status, 401);
    assert.equal((await api('GET', '/api/newsletter', { token: utok })).status, 403);
    const list = await api('GET', '/api/newsletter', { token: atok });
    assert.equal(list.status, 200);
    assert.ok(list.data.inscritos.some((i) => i.email === email && i.ativo !== false));
  });

  it('descadastro LGPD e público não expõe a base', async () => {
    assert.equal((await api('DELETE', '/api/newsletter', { body: { email: 'x' } })).status, 400);
    assert.equal((await api('DELETE', '/api/newsletter', { body: { email } })).status, 200);
    const list = await api('GET', '/api/newsletter?ativo=true', { token: atok });
    assert.ok(!list.data.inscritos.some((i) => i.email === email));
    const pub = await api('GET', '/api/config/loja/public');
    assert.ok(!JSON.stringify(pub.data.config).includes(email));
  });
});
