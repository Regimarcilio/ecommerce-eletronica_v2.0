// Harness E2E (sem dependencias externas: fetch nativo + node:test).
// Requer backend rodando: E2E_BASE_URL (default http://localhost:5000)
// e admin bootstrap via E2E_ADMIN_EMAIL/E2E_ADMIN_PASSWORD.
const BASE = process.env.E2E_BASE_URL || 'http://localhost:5000';
const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6)}`;

async function api(method, path, { token, body } = {}) {
  const res = await fetch(BASE + path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: 'Bearer ' + token } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  let data = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  return { status: res.status, data };
}

async function register(email, nome = 'E2E User') {
  return api('POST', '/api/auth/register', {
    body: { nome, email, telefone: '11999999999', password: 'Segura123' },
  });
}

async function adminToken() {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  if (!email || !password) {
    throw new Error('defina E2E_ADMIN_EMAIL e E2E_ADMIN_PASSWORD para rodar o E2E');
  }
  const r = await api('POST', '/api/auth/login', { body: { email, password } });
  if (r.status !== 200 || !r.data?.token) {
    throw new Error('admin login falhou: ' + JSON.stringify(r.data));
  }
  return r.data.token;
}

module.exports = { BASE, tag, api, register, adminToken, limparPorTag };

// Varredura best-effort por tag (residuo de run interrompida); ignora erros
async function limparPorTag(atok, tg) {
  try {
    const prods = await api('GET', '/api/produtos?limit=100', { token: atok });
    for (const p of prods.data?.produtos || []) {
      if (String(p.nome || '').includes(tg) || String(p.sku || '').includes(tg)) {
        await api('DELETE', `/api/produtos/${p._id}`, { token: atok }).catch(() => {});
      }
    }
    const cats = await api('GET', '/api/categorias?limit=100', { token: atok });
    for (const c of cats.data?.categorias || []) {
      if (String(c.nome || '').includes(tg)) {
        await api('DELETE', `/api/categorias/${c._id}`, { token: atok }).catch(() => {});
      }
    }
  } catch { /* limpeza e best-effort */ }
}
