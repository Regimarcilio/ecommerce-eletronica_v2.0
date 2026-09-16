const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { tag, api, register } = require('./helpers');

describe('e2e sessao (refresh/logout/reset)', () => {
  const email = `e2e-sess-${tag}@t.t`;
  let refresh1;

  it('register devolve refresh token', async () => {
    const r = await register(email, 'E2E Sess');
    assert.equal(r.status, 200);
    assert.ok(r.data.refreshToken);
    refresh1 = r.data.refreshToken;
  });

  it('refresh rotaciona e invalida o antigo', async () => {
    const r = await api('POST', '/api/auth/refresh', { body: { refreshToken: refresh1 } });
    assert.equal(r.status, 200);
    assert.ok(r.data.token && r.data.refreshToken);
    assert.notEqual(r.data.refreshToken, refresh1);
    const reuse = await api('POST', '/api/auth/refresh', { body: { refreshToken: refresh1 } });
    assert.equal(reuse.status, 401);
    refresh1 = r.data.refreshToken;
  });

  it('logout revoga a sessao', async () => {
    const login = await api('POST', '/api/auth/login', {
      body: { email, password: 'Segura123' },
    });
    const rt = login.data.refreshToken;
    const me = await api('GET', '/api/auth/me', { token: login.data.token });
    assert.equal(me.status, 200);
    const out = await api('POST', '/api/auth/logout', {
      token: login.data.token,
      body: { refreshToken: rt },
    });
    assert.equal(out.status, 200);
    const after = await api('POST', '/api/auth/refresh', { body: { refreshToken: rt } });
    assert.equal(after.status, 401);
  });

  it('forgot anti-enumeracao + reset + reuso negado', async () => {
    const ghost = await api('POST', '/api/auth/forgot', {
      body: { email: `nao-existe-${tag}@t.t` },
    });
    assert.equal(ghost.status, 200);
    assert.ok(!('resetToken' in ghost.data));
    const f = await api('POST', '/api/auth/forgot', { body: { email } });
    assert.equal(f.status, 200);
    assert.ok(f.data.resetToken, 'CI/dev com ALLOW_RESET_TOKEN_RESPONSE=true');
    const weak = await api('POST', '/api/auth/reset', {
      body: { token: f.data.resetToken, password: '123' },
    });
    assert.equal(weak.status, 400);
    const ok = await api('POST', '/api/auth/reset', {
      body: { token: f.data.resetToken, password: 'Resetada123' },
    });
    assert.equal(ok.status, 200);
    const reuse = await api('POST', '/api/auth/reset', {
      body: { token: f.data.resetToken, password: 'Outra12345' },
    });
    assert.equal(reuse.status, 400);
    const login = await api('POST', '/api/auth/login', {
      body: { email, password: 'Resetada123' },
    });
    assert.equal(login.status, 200);
  });
});
