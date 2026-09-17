const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { tag, api, register, adminToken } = require('./helpers');

describe('e2e observabilidade', () => {
  let atok;
  let utok;

  it('setup: admin + user', async () => {
    atok = await adminToken();
    const r = await register(`e2e-obs-${tag}@t.t`, 'E2E Obs');
    assert.equal(r.status, 200);
    utok = r.data.token;
  });

  it('metrics sem token retorna 401', async () => {
    const r = await api('GET', '/api/metrics');
    assert.equal(r.status, 401);
  });

  it('metrics como user retorna 403', async () => {
    const r = await api('GET', '/api/metrics', { token: utok });
    assert.equal(r.status, 403);
  });

  it('metrics como admin retorna contadores', async () => {
    await api('GET', '/api/produtos');
    const r = await api('GET', '/api/metrics', { token: atok });
    assert.equal(r.status, 200);
    assert.ok(r.data.metrics.uptimeSec >= 0);
    assert.ok(r.data.metrics.requests >= 1);
    assert.equal(r.data.metrics.mongo, 'connected');
    assert.ok(typeof r.data.metrics.byRoute === 'object');
  });
});
