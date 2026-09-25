const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { BASE, api, register, adminToken } = require('./helpers');

// PNG 1x1 válido
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const up = (token, body) => fetch(`${BASE}/api/produtos/foto`, {
  method: 'POST',
  headers: token ? { Authorization: `Bearer ${token}` } : {},
  body,
}).then(async (r) => ({ status: r.status, data: await r.json().catch(() => null) }));
const fd = (name, type, buf) => {
  const f = new FormData();
  f.append('foto', new Blob([buf || PNG], { type: type || 'image/png' }), name || 'foto.png');
  return f;
};

describe('e2e upload de foto (disco; banco só com URL)', () => {
  let atok;
  let utok;

  it('setup: admin + user', async () => {
    atok = await adminToken();
    const r = await register(`e2e-foto-${Date.now()}@t.t`, 'E2E Foto');
    assert.equal(r.status, 200);
    utok = r.data.token;
  });

  it('sem token 401, como user 403', async () => {
    assert.equal((await up(null, fd())).status, 401);
    assert.equal((await up(utok, fd())).status, 403);
  });

  it('tipo invalido e sem arquivo 400', async () => {
    const bad = await up(atok, fd('x.txt', 'text/plain', Buffer.from('oi')));
    assert.equal(bad.status, 400);
    const vazio = await up(atok, new FormData());
    assert.equal(vazio.status, 400);
  });

  it('admin envia PNG e imagem é servida em /fotos/', async () => {
    const r = await up(atok, fd());
    assert.equal(r.status, 200);
    assert.match(r.data.url, /^\/fotos\/[a-zA-Z0-9_-]+\.png$/);
    assert.deepEqual(r.data.urls, [r.data.url]);
    // Servico pelo nginx (frontend); no CI não há frontend -> pula sem falhar
    const front = process.env.E2E_FRONT_URL || 'http://localhost:8083';
    try {
      const pub = await fetch(`${front}${r.data.url}`);
      assert.equal(pub.status, 200);
      assert.match(pub.headers.get('content-type') || '', /image\/png/);
    } catch (e) {
      if (e.name === 'AssertionError') throw e;
      console.warn(`   (skip) frontend fora do ar em ${front}`);
    }
  });

  it('ate 3 fotos por vez; 4a retorna 400', async () => {
    const tres = new FormData();
    for (let i = 0; i < 3; i++) tres.append('fotos', new Blob([PNG], { type: 'image/png' }), `f${i}.png`);
    const ok = await up(atok, tres);
    assert.equal(ok.status, 200);
    assert.equal(ok.data.urls.length, 3);
    const quatro = new FormData();
    for (let i = 0; i < 4; i++) quatro.append('fotos', new Blob([PNG], { type: 'image/png' }), `g${i}.png`);
    assert.equal((await up(atok, quatro)).status, 400);
  });
});
