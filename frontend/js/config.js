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
  // URL de imagem segura (http/https/relativa; resto vira vazio)
  window.safeImg = function (v) {
    const s = String(v || '').trim();
    if (/^(https?:\/\/[^ "]+|\/[^ "]*)$/i.test(s)) return s;
    return '';
  };
  // Foto principal do produto (galeria imagens[0] ou legado imagemUrl)
  window.fotoPrincipal = function (p) {
    if (!p) return '';
    if (Array.isArray(p.imagens) && p.imagens.length) {
      const u = window.safeImg(p.imagens[0]);
      if (u) return u;
    }
    return window.safeImg(p.imagemUrl);
  };

  // Biblioteca de icones por segmento (Font Awesome; multi-ramo: o cliente
  // escolhe o que representa o negocio dele na hora de criar a categoria)
  window.ICON_LIB = [
    { group: 'Eletrônicos', icons: ['fa-microchip', 'fa-bolt', 'fa-plug', 'fa-battery-full', 'fa-wifi', 'fa-tv', 'fa-mobile-screen', 'fa-laptop', 'fa-headphones', 'fa-camera', 'fa-print', 'fa-robot', 'fa-satellite-dish', 'fa-sim-card', 'fa-keyboard', 'fa-lightbulb', 'fa-plug-circle-bolt'] },
    { group: 'Moda e Vestuário', icons: ['fa-shirt', 'fa-shoe-prints', 'fa-hat-cowboy', 'fa-glasses', 'fa-gem', 'fa-bag-shopping', 'fa-cart-shopping', 'fa-tag', 'fa-percent', 'fa-gift'] },
    { group: 'Alimentos', icons: ['fa-utensils', 'fa-pizza-slice', 'fa-burger', 'fa-ice-cream', 'fa-coffee', 'fa-cake-candles', 'fa-wine-glass', 'fa-fish', 'fa-apple-whole', 'fa-carrot', 'fa-bread-slice', 'fa-cheese', 'fa-egg', 'fa-cookie', 'fa-beer-mug-empty'] },
    { group: 'Saúde e Beleza', icons: ['fa-heart-pulse', 'fa-pills', 'fa-syringe', 'fa-briefcase-medical', 'fa-spa', 'fa-pump-soap', 'fa-scissors', 'fa-spray-can-sparkles', 'fa-tooth'] },
    { group: 'Casa e Construção', icons: ['fa-couch', 'fa-bed', 'fa-bath', 'fa-kitchen-set', 'fa-door-open', 'fa-hammer', 'fa-wrench', 'fa-screwdriver', 'fa-paint-roller'] },
    { group: 'Esporte', icons: ['fa-dumbbell', 'fa-bicycle', 'fa-futbol', 'fa-basketball', 'fa-volleyball-ball', 'fa-person-swimming', 'fa-trophy', 'fa-medal'] },
    { group: 'Automotivo', icons: ['fa-car', 'fa-motorcycle', 'fa-truck', 'fa-gas-pump', 'fa-gear', 'fa-oil-can', 'fa-car-battery'] },
    { group: 'Pets', icons: ['fa-paw', 'fa-dog', 'fa-cat', 'fa-fish', 'fa-bone', 'fa-bird'] },
    { group: 'Papelaria e Educação', icons: ['fa-book', 'fa-pen', 'fa-pencil', 'fa-ruler', 'fa-backpack', 'fa-graduation-cap'] },
    { group: 'Lazer e Cultura', icons: ['fa-gamepad', 'fa-dice', 'fa-chess-knight', 'fa-puzzle-piece', 'fa-rocket', 'fa-star', 'fa-music', 'fa-film', 'fa-camera-retro', 'fa-palette', 'fa-cubes'] },
    { group: 'Serviços', icons: ['fa-phone', 'fa-envelope', 'fa-calendar', 'fa-clock', 'fa-bell', 'fa-screwdriver-wrench', 'fa-truck-fast', 'fa-handshake'] },
    { group: 'Geral', icons: ['fa-store', 'fa-box', 'fa-boxes-stacked', 'fa-warehouse', 'fa-clipboard-list', 'fa-chart-line', 'fa-credit-card', 'fa-truck-ramp-box', 'fa-circle-dot', 'fa-folder', 'fa-star-half-stroke', 'fa-fire', 'fa-thumbs-up', 'fa-crown'] },
  ];
  // Trunca texto p/ cards (mantem original intacto)
  window.truncate = function (v, n) {
    const s = String(v ?? '').trim();
    return s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s;
  };
  window.cartGet = function () {
    try { const c = JSON.parse(localStorage.getItem('cart') || '[]'); return Array.isArray(c) ? c : []; } catch { return []; }
  };
  window.cartSave = function (cart) {
    localStorage.setItem('cart', JSON.stringify(cart));
    try { window.dispatchEvent(new CustomEvent('cart:change', { detail: cart })); } catch {}
    return cart;
  };
  window.cartAdd = function (id, name, price) {
    const cart = window.cartGet();
    const found = cart.find((i) => String(i.id) === String(id));
    if (found) found.quantity = Math.min(99, Number(found.quantity || 0) + 1);
    else cart.push({ id, name, price: Number(price) || 0, quantity: 1 });
    return window.cartSave(cart);
  };
  // Passo +/- com trava 1..99; zerar remove o item. Retorna o carrinho.
  window.cartStep = function (id, delta) {
    const cart = window.cartGet();
    const it = cart.find((i) => String(i.id) === String(id));
    if (!it) return cart;
    const n = (Number(it.quantity) || 1) + Number(delta || 0);
    if (n < 1) return window.cartSave(cart.filter((i) => String(i.id) !== String(id)));
    if (n > 99) return cart;
    it.quantity = n;
    return window.cartSave(cart);
  };
  window.cartSetQty = function (id, qty) {
    const q = parseInt(qty, 10);
    const cart = window.cartGet();
    if (!Number.isInteger(q) || q < 1 || q > 99) return cart;
    const it = cart.find((i) => String(i.id) === String(id));
    if (!it) return cart;
    it.quantity = q;
    return window.cartSave(cart);
  };
  window.cartRemove = function (id) {
    return window.cartSave(window.cartGet().filter((i) => String(i.id) !== String(id)));
  };
  // Destino do nome do usuário: admin -> dashboard, cliente -> minha conta
  window.roleHome = function () {
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      return u.role === 'admin' ? '/dashboard.html' : '/minha-conta.html';
    } catch { return '/minha-conta.html'; }
  };
  window.userLink = function () {
    let nome = '', role = '';
    try {
      const u = JSON.parse(localStorage.getItem('user') || '{}');
      nome = String(u.nome || '').split(' ')[0]; role = u.role || '';
    } catch {}
    if (!nome) return '';
    const dest = role === 'admin' ? '/dashboard.html' : '/minha-conta.html';
    const label = role === 'admin' ? 'Dashboard' : 'Minha conta';
    return `<a href="${dest}" title="${window.escapeHtml(label)}" style="font-size:.85rem;color:var(--mut,#9aa4c7)"><i class="fa-solid fa-user"></i> ${window.escapeHtml(nome)}</a>`;
  };
  // Redes sociais do footer (vindas do painel admin; esconde as vazias)
  window.renderSocial = async function (elId) {
    const el = document.getElementById(elId);
    if (!el) return;
    const ICONS = { instagram: 'fa-instagram', facebook: 'fa-facebook-f', youtube: 'fa-youtube', tiktok: 'fa-tiktok' };
    try {
      const r = await fetch(window.API_BASE + '/config/loja/public');
      const d = await r.json();
      const redes = (d.success && d.config && d.config.redesSociais) || {};
      const links = Object.keys(ICONS).filter((k) => redes[k]).map((k) => {
        let href = String(redes[k]).trim();
        if (!/^https?:\/\//i.test(href)) href = 'https://' + href;
        return `<a href="${window.escapeHtml(href)}" target="_blank" rel="noopener" aria-label="${k}" style="font-size:1.15rem;color:var(--mut,#9aa4c7);margin-right:16px"><i class="fa-brands ${ICONS[k]}"></i></a>`;
      });
      if (links.length) el.innerHTML = links.join('');
    } catch { /* footer sem sociais */ }
  };
})();
