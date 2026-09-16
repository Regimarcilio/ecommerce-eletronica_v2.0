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
