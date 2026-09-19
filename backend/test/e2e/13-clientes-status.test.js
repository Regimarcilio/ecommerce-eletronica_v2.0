const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { tag, api, register, adminToken, limparPorTag } = require('./helpers');

describe('e2e clientes status (ativo/bloqueado)', () => {
  let atok;
  let cliId;
  const email = `e2e-cli-${tag}@t.t`;

  it('setup', async () => {
    atok = await adminToken();
    const u = await register(email, 'E2E Cli');
    assert.equal(u.status, 200);
    cliId = u.data.user.id;
  });

  it('status invalido e id invalido retornam 400', async () => {
    assert.equal((await api('PUT', `/api/clientes/${cliId}/status`, { token: atok, body: { status: 'x' } })).status, 400);
    assert.equal((await api('PUT', '/api/clientes/nao-id/status', { token: atok, body: { status: 'bloqueado' } })).status, 400);
  });

  it('nao-admin recebe 403; admin inexistente recebe 404', async () => {
    const u = await register(`e2e-cli2-${tag}@t.t`, 'E2E Cli2');
    assert.equal((await api('PUT', `/api/clientes/${cliId}/status`, { token: u.data.token, body: { status: 'bloqueado' } })).status, 403);
    assert.equal((await api('PUT', '/api/clientes/000000000000000000000000/status', { token: atok, body: { status: 'bloqueado' } })).status, 404);
  });

  it('bloquear impede login; reativar libera', async () => {
    assert.equal((await api('PUT', `/api/clientes/${cliId}/status`, { token: atok, body: { status: 'bloqueado' } })).status, 200);
    const list = await api('GET', '/api/clientes', { token: atok });
    assert.ok(list.data.clientes.some((c) => String(c._id) === String(cliId) && c.status === 'bloqueado'));
    const blocked = await api('POST', '/api/auth/login', { body: { email, password: 'Segura123' } });
    assert.equal(blocked.status, 401);
    assert.equal((await api('PUT', `/api/clientes/${cliId}/status`, { token: atok, body: { status: 'ativo' } })).status, 200);
    const ok = await api('POST', '/api/auth/login', { body: { email, password: 'Segura123' } });
    assert.equal(ok.status, 200);
  });

  after(async () => {
    await limparPorTag(atok, tag);
  });
});
