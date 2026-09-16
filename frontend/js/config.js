/* TechStore shared config — use em todas as paginas antes dos scripts inline */
(function () {
  const host = window.location.hostname || 'localhost';
  // Docker: frontend 8083 -> backend 5010; local: 5500 -> 5000
  const backendPort = (window.location.port === '8083') ? '5010' : '5000';
  window.API_BASE = window.API_BASE || (`http://${host}:${backendPort}/api`);

  window.escapeHtml = function (v) {
    return String(v ?? '').replace(/[&<>"'`=]/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;', '=': '&#61;'
    }[c]));
  };

  window.getAuthHeaders = function () {
    const token = localStorage.getItem('token');
    const h = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  };

  // Expiracao do access token (segundos, com margem). Sem JWT => expirado.
  window.tokenExpIn = function () {
    try {
      const payload = JSON.parse(atob(localStorage.getItem('token').split('.')[1]));
      return (payload.exp || 0) - Math.floor(Date.now() / 1000);
    } catch { return -1; }
  };

  // Troca refresh por novo par (rotacao). true se renovou.
  window.refreshSession = async function () {
    const rt = localStorage.getItem('refreshToken');
    if (!rt) return false;
    try {
      const res = await fetch(window.API_BASE + '/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken: rt }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        localStorage.setItem('token', data.token);
        localStorage.setItem('refreshToken', data.refreshToken);
        return true;
      }
    } catch { /* cai para logout */ }
    return false;
  };

  // Garante access valido; renova se expirar em <60s. false => va p/ login.
  window.ensureSession = async function () {
    if (!localStorage.getItem('token')) return false;
    if (window.tokenExpIn() > 60) return true;
    return window.refreshSession();
  };

  // Logout: revoga refresh no servidor (best-effort) e limpa tudo local.
  // Nao apaga o carrinho.
  window.logoutAll = function () {
    const rt = localStorage.getItem('refreshToken');
    const tk = localStorage.getItem('token');
    try {
      if (tk) {
        fetch(window.API_BASE + '/auth/logout', {
          method: 'POST',
          headers: window.getAuthHeaders(),
          body: JSON.stringify({ refreshToken: rt }),
        }).catch(() => {});
      }
    } finally {
      localStorage.removeItem('token');
      localStorage.removeItem('refreshToken');
      localStorage.removeItem('user');
    }
  };

  // Icone FontAwesome sanitizado (allowlist fa-xxx, anti injecao de atributo)
  window.safeIcon = function (v) {
    const s = String(v || 'fa-microchip').trim().split(/\s+/).pop();
    return /^fa-[a-z0-9-]+$/.test(s) ? s : 'fa-microchip';
  };

  // Seta select mesmo quando o valor nao existe nas opcoes (ex.: UF salva)
  window.setSelectValue = function (sel, val) {
    if (!sel) return;
    const v = String(val ?? '');
    if (v && ![...sel.options].some((o) => o.value === v)) {
      const o = document.createElement('option');
      o.value = v; o.textContent = v;
      sel.appendChild(o);
    }
    sel.value = v;
  };
  // Trunca texto p/ cards (mantem original intacto)
  window.truncate = function (v, n) {
    const s = String(v ?? '').trim();
    return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
  };
  window.cartAdd = function (id, name, price) {
    let cart = [];
    try { cart = JSON.parse(localStorage.getItem('cart') || '[]'); } catch { cart = []; }
    const found = cart.find((i) => i.id === id);
    if (found) found.quantity = Number(found.quantity || 0) + 1;
    else cart.push({ id, name, price: Number(price) || 0, quantity: 1 });
    localStorage.setItem('cart', JSON.stringify(cart));
    return cart;
  };
})();
