const { describe, it, after } = require('node:test');
const assert = require('node:assert/strict');
const { api, adminToken } = require('./helpers');

describe('e2e contato + redes sociais', () => {
  let atok;

  it('setup', async () => {
    atok = await adminToken();
  });

  it('contato valida campos', async () => {
    assert.equal((await api('POST', '/api/contato', { body: {} })).status, 400);
    assert.equal((await api('POST', '/api/contato', { body: { nome: 'A', email: 'x', mensagem: 'mensagem longa o bastante' } })).status, 400);
    assert.equal((await api('POST', '/api/contato', { body: { nome: 'A', email: 'a@t.t', mensagem: 'curta' } })).status, 400);
  });

  it('contato cria e admin lista + marca lida', async () => {
    const c = await api('POST', '/api/contato', {
      body: { nome: 'E2E Contato', email: 'e2e@t.t', assunto: 'Dúvida', mensagem: 'mensagem de teste com mais de dez caracteres' },
    });
    assert.equal(c.status, 200);
    assert.ok(c.data.protocolo);
    const id = c.data.protocolo;
    const list = await api('GET', '/api/contato', { token: atok });
    assert.equal(list.status, 200);
    assert.ok(list.data.mensagens.some((m) => String(m._id) === String(id)));
    assert.equal((await api('GET', '/api/contato', {})).status, 401);
    const lida = await api('PUT', `/api/contato/${id}/lida`, { token: atok });
    assert.equal(lida.status, 200);
    const filtrada = await api('GET', '/api/contato?lida=false', { token: atok });
    assert.ok(!filtrada.data.mensagens.some((m) => String(m._id) === String(id)));
  });

  it('contato status nova->lida->respondida com filtro', async () => {
    const c = await api('POST', '/api/contato', {
      body: { nome: 'E2E Status', email: 'st@t.t', mensagem: 'mensagem para testar fluxo de status' },
    });
    const id = c.data.protocolo;
    assert.equal((await api('PUT', `/api/contato/${id}/status`, { token: atok, body: { status: 'invalido' } })).status, 400);
    assert.equal((await api('PUT', `/api/contato/${id}/status`, { token: atok, body: { status: 'lida' } })).status, 200);
    const lidas = await api('GET', '/api/contato?status=lida', { token: atok });
    assert.ok(lidas.data.mensagens.some((m) => String(m._id) === String(id)));
    assert.equal((await api('PUT', `/api/contato/${id}/status`, { token: atok, body: { status: 'respondida' } })).status, 200);
    const resp = await api('GET', '/api/contato?status=respondida', { token: atok });
    assert.ok(resp.data.mensagens.some((m) => String(m._id) === String(id)));
    const novas = await api('GET', '/api/contato?status=nova', { token: atok });
    assert.ok(!novas.data.mensagens.some((m) => String(m._id) === String(id)));
    assert.equal((await api('DELETE', `/api/contato/${id}`, { token: atok })).status, 200);
  });

  it('contato CRUD completo: excluir (admin) + 404 + 401', async () => {
    const c = await api('POST', '/api/contato', {
      body: { nome: 'E2E Del', email: 'del@t.t', mensagem: 'mensagem para excluir com certeza' },
    });
    const id = c.data.protocolo;
    assert.equal((await api('DELETE', `/api/contato/${id}`, {})).status, 401);
    assert.equal((await api('DELETE', '/api/contato/000000000000000000000000', { token: atok })).status, 404);
    assert.equal((await api('DELETE', `/api/contato/${id}`, { token: atok })).status, 200);
    const list = await api('GET', '/api/contato', { token: atok });
    assert.ok(!list.data.mensagens.some((m) => String(m._id) === String(id)));
  });

  it('redes sociais: salva, publica e valida', async () => {
    const put = await api('PUT', '/api/config/loja', {
      token: atok,
      body: { redesSociais: { instagram: 'https://instagram.com/placacerta', facebook: '', youtube: 'placacerta', tiktok: '' } },
    });
    assert.equal(put.status, 200);
    const pub = await api('GET', '/api/config/loja/public');
    assert.equal(pub.data.config.redesSociais.instagram, 'https://instagram.com/placacerta');
    assert.equal(pub.data.config.redesSociais.youtube, 'placacerta');
    const bad = await api('PUT', '/api/config/loja', {
      token: atok,
      body: { redesSociais: { instagram: 'ht tp://quebrado com espaço' } },
    });
    assert.equal(bad.status, 400);
  });

  it('email + horario da loja: salva, publica e valida', async () => {
    const put = await api('PUT', '/api/config/loja', {
      token: atok,
      body: { emailLoja: 'loja@t.t', horarioAtendimento: 'Seg–Sex, 8h às 18h' },
    });
    assert.equal(put.status, 200);
    const pub = await api('GET', '/api/config/loja/public');
    assert.equal(pub.data.config.emailLoja, 'loja@t.t');
    assert.equal(pub.data.config.horarioAtendimento, 'Seg–Sex, 8h às 18h');
    const bad = await api('PUT', '/api/config/loja', {
      token: atok,
      body: { emailLoja: 'nao-email' },
    });
    assert.equal(bad.status, 400);
  });

  after(async () => {
    await api('PUT', '/api/config/loja', { token: atok, body: { redesSociais: { instagram: '', facebook: '', youtube: '', tiktok: '' }, emailLoja: '', horarioAtendimento: '' } });
  });
});
