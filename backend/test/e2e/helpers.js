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
  const r = await api('POST', '/api/auth/login', {
    body: {
      email: process.env.E2E_ADMIN_EMAIL || 'admin@techstore.com.br',
      password: process.env.E2E_ADMIN_PASSWORD || 'Admin@2024',
    },
  });
  if (r.status !== 200 || !r.data?.token) {
    throw new Error('admin login falhou: ' + JSON.stringify(r.data));
  }
  return r.data.token;
}

module.exports = { BASE, tag, api, register, adminToken };
