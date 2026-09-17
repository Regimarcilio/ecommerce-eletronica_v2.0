const { describe, it, before } = require('node:test');
const assert = require('node:assert/strict');
const { tag, api, register } = require('./helpers');

describe('e2e auth + conta', () => {
  const email = `e2e-auth-${tag}@t.t`;
  let token;

  it('health responde OK', async () => {
    const res = await fetch((process.env.E2E_BASE_URL || 'http://localhost:5000') + '/health');
    assert.equal(res.status, 200);
  });

  it('register cria usuario user (201 + token)', async () => {
    const r = await register(email, 'E2E Auth');
    assert.equal(r.status, 200);
    assert.equal(r.data.success, true);
    assert.equal(r.data.user.role, 'user');
    assert.ok(r.data.token);
    token = r.data.token;
  });

  it('register duplicado retorna 400 EMAIL_EXISTS', async () => {
    const r = await register(email);
    assert.equal(r.status, 400);
    assert.equal(r.data.code, 'EMAIL_EXISTS');
  });

  it('register senha fraca retorna 400 WEAK_PASSWORD', async () => {
    const r = await api('POST', '/api/auth/register', {
      body: { nome: 'X', email: `e2e-weak-${tag}@t.t`, password: '123' },
    });
    assert.equal(r.status, 400);
    assert.equal(r.data.code, 'WEAK_PASSWORD');
  });

  it('login expoe headers de rate-limit (sem disparar 429)', async () => {
    const { BASE } = require('./helpers');
    const res = await fetch(BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password: 'Errada123' }),
    });
    assert.equal(res.status, 401);
    // 20 em prod, 10000 com E2E_NO_LIMIT=true
    assert.ok(['20', '10000'].includes(res.headers.get('ratelimit-limit')));
  });

  it('me retorna usuario sem password', async () => {
    const r = await api('GET', '/api/auth/me', { token });
    assert.equal(r.status, 200);
    assert.ok(!('password' in r.data.user));
  });

  it('PUT me com nome vazio retorna 400', async () => {
    const r = await api('PUT', '/api/auth/me', { token, body: { nome: '  ' } });
    assert.equal(r.status, 400);
  });

  it('PUT me atualiza nome/telefone', async () => {
    const r = await api('PUT', '/api/auth/me', {
      token,
      body: { nome: 'E2E Auth Novo', telefone: '1100000000' },
    });
    assert.equal(r.status, 200);
    assert.equal(r.data.user.nome, 'E2E Auth Novo');
  });

  it('PUT password com atual errada retorna 401', async () => {
    const r = await api('PUT', '/api/auth/password', {
      token,
      body: { current: 'Errada123', password: 'NovaSegura1' },
    });
    assert.equal(r.status, 401);
  });

  it('PUT password fraca retorna 400', async () => {
    const r = await api('PUT', '/api/auth/password', {
      token,
      body: { current: 'Segura123', password: '123' },
    });
    assert.equal(r.status, 400);
  });

  it('PUT password correta + login com nova senha', async () => {
    const r = await api('PUT', '/api/auth/password', {
      token,
      body: { current: 'Segura123', password: 'NovaSegura1' },
    });
    assert.equal(r.status, 200);
    const login = await api('POST', '/api/auth/login', {
      body: { email, password: 'NovaSegura1' },
    });
    assert.equal(login.status, 200);
  });

  before(async () => {
    // garante backend acessivel antes da suite
    const res = await fetch((process.env.E2E_BASE_URL || 'http://localhost:5000') + '/health');
    assert.equal(res.status, 200);
  });
});
