const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { tag, api, register, adminToken } = require('./helpers');

describe('e2e configuracoes da loja', () => {
  let atok;
  let utok;

  it('setup: admin + user', async () => {
    atok = await adminToken();
    const r = await register(`e2e-cfg-${tag}@t.t`, 'E2E Cfg');
    assert.equal(r.status, 200);
    utok = r.data.token;
  });

  it('public sem auth: so campos publicos (+zap da loja)', async () => {
    const r = await api('GET', '/api/config/loja/public');
    assert.equal(r.status, 200);
    assert.ok(typeof r.data.config.condicoesPagamento === 'string');
    assert.ok(typeof r.data.config.parcelasMax === 'number');
    assert.ok(typeof r.data.config.whatsappNumero === 'string');
    assert.ok(!('segredos' in r.data.config));
  });

  it('loja sem token 401, como user 403', async () => {
    assert.equal((await api('GET', '/api/config/loja')).status, 401);
    assert.equal((await api('GET', '/api/config/loja', { token: utok })).status, 403);
  });

  it('validacoes 400 (whatsapp, parcelas, nome segredo)', async () => {
    const h = { token: atok };
    assert.equal((await api('PUT', '/api/config/loja', { ...h, body: { whatsappNumero: 'abc' } })).status, 400);
    assert.equal((await api('PUT', '/api/config/loja', { ...h, body: { parcelasMax: 99 } })).status, 400);
    assert.equal((await api('PUT', '/api/config/loja', { ...h, body: { segredos: { 'a-b': 'x' } } })).status, 400);
  });

  it('segredo gravado cifrado e mascarado (sem vazar)', async () => {
    const put = await api('PUT', '/api/config/loja', {
      token: atok,
      body: { whatsappNumero: '5511999999999', segredos: { E2E_K: 's3cr3t-valor' } },
    });
    assert.equal(put.status, 200);
    const get = await api('GET', '/api/config/loja', { token: atok });
    assert.equal(get.data.config.whatsappNumero, '5511999999999');
    assert.equal(get.data.config.segredos.E2E_K, '***');
    assert.ok(!JSON.stringify(get.data).includes('s3cr3t-valor'));
    const del = await api('PUT', '/api/config/loja', {
      token: atok,
      body: { segredos: { E2E_K: '' } },
    });
    assert.equal(del.status, 200);
    const get2 = await api('GET', '/api/config/loja', { token: atok });
    assert.ok(!('E2E_K' in (get2.data.config.segredos || {})));
  });

  it('credenciais manuais MP/PGS via painel (sem .env)', async () => {
    const put = await api('PUT', '/api/config/loja', {
      token: atok,
      body: { mpClientId: '123456', mpRedirectUri: 'https://x.test/dash', pgsEmail: 'loja@e2e.t', pgsSandbox: true, segredos: { mp_client_secret: 'sec-test', pagseguro_token: 'tok-test' } },
    });
    assert.equal(put.status, 200);
    const get = await api('GET', '/api/config/loja', { token: atok });
    assert.equal(get.data.config.mpClientId, '123456');
    assert.equal(get.data.config.mpRedirectUri, 'https://x.test/dash');
    assert.equal(get.data.config.pgsEmail, 'loja@e2e.t');
    assert.equal(get.data.config.pgsSandbox, true);
    assert.equal(get.data.config.segredos.mp_client_secret, '***');
    assert.ok(!JSON.stringify(get.data).includes('sec-test'));
    const st = await api('GET', '/api/pagamentos/mercadopago/oauth/status', { token: atok });
    assert.equal(st.data.oauth.clientConfigurado, true);
    assert.equal(st.data.oauth.clientSecretConfigurado, true);
    assert.equal((await api('PUT', '/api/config/loja', { token: atok, body: { pgsEmail: 'nao-email' } })).status, 400);
    assert.equal((await api('PUT', '/api/config/loja', { token: atok, body: { pgsSandbox: 'x' } })).status, 400);
    await api('PUT', '/api/config/loja', { token: atok, body: { mpClientId: '', mpRedirectUri: '', pgsEmail: '', segredos: { mp_client_secret: '', pagseguro_token: '' } } });
    const get2 = await api('GET', '/api/config/loja', { token: atok });
    assert.ok(!('mp_client_secret' in (get2.data.config.segredos || {})));
  });

  it('whatsapp/status responde shape (configurado ou nao)', async () => {
    const r = await api('GET', '/api/config/whatsapp/status', { token: atok });
    assert.equal(r.status, 200);
    assert.equal(typeof r.data.status.configurado, 'boolean');
    if (r.data.status.configurado) assert.ok(typeof r.data.status.estado === 'string');
    const restore = await api('PUT', '/api/config/loja', {
      token: atok,
      body: { whatsappNumero: '' },
    });
    assert.equal(restore.status, 200);
  });
});
