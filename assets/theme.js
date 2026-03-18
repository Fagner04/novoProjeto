/* ===== MUSAS CLUB - Theme JS ===== */

// ---- Mobile Menu ----
function toggleMobileMenu() {
  const menu = document.getElementById('mobile-menu');
  menu.classList.toggle('open');
  document.body.style.overflow = menu.classList.contains('open') ? 'hidden' : '';
}

// ---- Search ----
function toggleSearch() {
  const bar = document.getElementById('search-bar');
  if (!bar) return;
  bar.classList.toggle('open');
  if (bar.classList.contains('open')) bar.querySelector('input').focus();
}

document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    const bar = document.getElementById('search-bar');
    const menu = document.getElementById('mobile-menu');
    if (bar) bar.classList.remove('open');
    if (menu) menu.classList.remove('open');
    document.body.style.overflow = '';
    closeCart();
  }
});

// ---- Cart ----
var _cartInteracting = false;

function openCart() {
  document.getElementById('cart-drawer').classList.add('open');
  var waRoot = document.querySelector('.wac-root, .wa-fab-simple');
  if (waRoot) waRoot.style.display = 'none';
  renderCart();
}
function closeCart() {
  if (_cartInteracting) return;
  document.getElementById('cart-drawer').classList.remove('open');
  var waRoot = document.querySelector('.wac-root, .wa-fab-simple');
  if (waRoot) waRoot.style.display = '';
}
async function fetchCart() { return (await fetch('/cart.js')).json(); }
async function addToCart(id, qty) {
  return (await fetch('/cart/add.js', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id, quantity: qty}) })).json();
}
async function updateCartItem(id, qty) {
  return (await fetch('/cart/change.js', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id, quantity: qty}) })).json();
}
function formatMoney(cents) { return 'R$ ' + (cents/100).toFixed(2).replace('.',','); }

async function renderCart() {
  const cart = await fetchCart();
  const list = document.getElementById('cart-items-list');
  const empty = document.getElementById('cart-empty');
  const footer = document.getElementById('cart-footer');
  const badge = document.getElementById('cart-count');
  if (badge) { badge.textContent = cart.item_count; badge.style.display = cart.item_count > 0 ? 'flex' : 'none'; }
  if (cart.item_count === 0) {
    empty.style.display = 'flex'; footer.style.display = 'none';
    list.querySelectorAll('.cart-item').forEach(i => i.remove()); return;
  }
  empty.style.display = 'none'; footer.style.display = 'block';
  list.querySelectorAll('.cart-item').forEach(i => i.remove());

  // Pré-carrega preços de atacado antes de renderizar os itens
  var cfg = window.__cwAtacado;
  var wholesaleActive = false;
  if (cfg && cfg.enabled) {
    var min = cfg.min_qty || 6;
    wholesaleActive = cart.item_count >= min;
    if (wholesaleActive) {
      var handles = [...new Set(cart.items.map(function(i){ return i.handle; }))];
      await Promise.all(handles.map(function(h){ return getWholesalePrice(h); }));
    }
  }

  cart.items.forEach((item, index) => {
    const lineIndex = index + 1;
    const wsPrice = wholesaleActive ? _wsCache[item.handle] : null; // centavos

    var priceHtml;
    if (wsPrice && wsPrice > 0) {
      priceHtml =
        '<p class="cart-item-price" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
          '<s style="color:#aaa;font-size:12px;">' + formatMoney(item.final_price) + '</s>' +
          '<span style="color:#15803D;font-weight:700;">' + formatMoney(wsPrice) + '</span>' +
          '<span style="background:#DCFCE7;color:#166534;font-size:9px;padding:1px 5px;border-radius:4px;font-weight:700;">ATACADO</span>' +
        '</p>';
    } else {
      priceHtml = '<p class="cart-item-price">' + formatMoney(item.final_price) + '</p>';
    }

    const el = document.createElement('div');
    el.className = 'cart-item';
    el.innerHTML = `<img class="cart-item-image" src="${item.image}" alt="${item.title}">
      <div class="cart-item-info">
        <p class="cart-item-title">${item.product_title}</p>
        <p class="cart-item-variant">${item.variant_title !== 'Default Title' ? item.variant_title : ''}</p>
        ${priceHtml}
        <div class="cart-qty">
          <button type="button" onclick="changeItemLine(${lineIndex},${item.quantity-1})">−</button>
          <span>${item.quantity}</span>
          <button type="button" onclick="changeItemLine(${lineIndex},${item.quantity+1})">+</button>
        </div>
      </div>
      <button type="button" class="cart-remove" onclick="changeItemLine(${lineIndex},0)" aria-label="Remover">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>`;
    list.insertBefore(el, empty);
  });
  document.getElementById('cart-total-price').textContent = formatMoney(cart.total_price);
  await renderWholesaleProgress(cart);
}

async function changeItemLine(line, qty) {
  _cartInteracting = true;
  try {
    await fetch('/cart/change.js', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ line: line, quantity: qty })
    });
    await renderCart();
  } finally {
    _cartInteracting = false;
  }
}

// Cache de preços de atacado por handle (limpo a cada sessão, não entre renders)
var _wsCache = {};

async function getWholesalePrice(handle) {
  if (_wsCache[handle] !== undefined) return _wsCache[handle];
  try {
    var r = await fetch('/products/' + handle + '?view=wholesale');
    var text = await r.text();
    // extrai só o JSON (ignora whitespace/html ao redor)
    var match = text.match(/\{[\s\S]*\}/);
    if (!match) { _wsCache[handle] = null; return null; }
    var data = JSON.parse(match[0]);
    // Normaliza para centavos: se < 1000 assume reais (ex: 159.90), senão já é centavos
    var raw = data.wholesale_price;
    if (raw !== null && raw !== undefined) {
      _wsCache[handle] = raw < 1000 ? Math.round(raw * 100) : Math.round(raw);
    } else {
      _wsCache[handle] = null;
    }
  } catch(e) { _wsCache[handle] = null; }
  return _wsCache[handle];
}

async function renderWholesaleProgress(cart) {
  var container = document.getElementById('cw-wholesale-progress-container');
  if (!container) return;

  var cfg = window.__cwAtacado;
  if (!cfg || !cfg.enabled) { container.innerHTML = ''; return; }

  var min = cfg.min_qty || 6;
  var total = cart.item_count;
  var remaining = min - total;
  var progress = Math.min(100, Math.round(total * 100 / min));
  var active = remaining <= 0;

  var wholesaleHtml = '';

  if (active && cart.items && cart.items.length > 0) {
    // Busca preços de atacado para todos os itens únicos
    var handles = [...new Set(cart.items.map(function(i){ return i.handle; }))];
    await Promise.all(handles.map(function(h){ return getWholesalePrice(h); }));

    var wsTotal = 0;
    var origTotal = 0;
    var hasWs = false;

    cart.items.forEach(function(item) {
      var wsPrice = _wsCache[item.handle]; // centavos
      origTotal += item.final_line_price;
      if (wsPrice && wsPrice > 0) {
        hasWs = true;
        wsTotal += wsPrice * item.quantity;
      } else {
        wsTotal += item.final_line_price;
      }
    });

    var savings = origTotal - wsTotal;

    // Atualiza o total exibido no rodapé do carrinho
    var totalEl = document.getElementById('cart-total-price');
    if (totalEl && hasWs) {
      totalEl.innerHTML = '<s style="color:#aaa;font-size:13px;font-weight:400;">' + formatMoney(origTotal) + '</s> <span style="color:#15803D;font-weight:700;">' + formatMoney(wsTotal) + '</span>';
    }

    wholesaleHtml =
      '<div style="display:flex;align-items:center;gap:6px;">' +
        '<span style="font-size:18px;">🎉</span>' +
        '<div>' +
          '<p style="font-size:13px;font-weight:700;color:#15803D;margin:0;">🏷 Atacado Ativo!</p>' +
          '<p style="font-size:11px;color:#166534;margin:2px 0 0;">✓ Você está economizando com preços de atacado!</p>' +
        '</div>' +
        '<span style="margin-left:auto;font-size:12px;font-weight:600;color:#15803D;">' + total + '/' + min + ' peças</span>' +
      '</div>' +
      '<div style="width:100%;height:8px;background:#BBF7D0;border-radius:99px;overflow:hidden;margin-top:6px;">' +
        '<div style="width:100%;height:100%;background:linear-gradient(90deg,#22C55E,#16A34A);border-radius:99px;"></div>' +
      '</div>' +
      '';
  } else if (!active) {
    // Restaura total normal
    var totalEl = document.getElementById('cart-total-price');
    if (totalEl) totalEl.textContent = formatMoney(cart.total_price);

    wholesaleHtml =
      '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">' +
        '<span style="font-size:12px;font-weight:600;color:#92400E;">🛒 Faltam <strong style="color:#C2410C;">' + remaining + '</strong> peça(s) para atacado!</span>' +
        '<span style="font-size:11px;color:#B45309;">' + total + '/' + min + '</span>' +
      '</div>' +
      '<div style="width:100%;height:8px;background:#FDE68A;border-radius:99px;overflow:hidden;">' +
        '<div style="width:' + progress + '%;height:100%;background:linear-gradient(90deg,#F59E0B,#D97706);border-radius:99px;transition:width 0.4s ease;"></div>' +
      '</div>' +
      '<p style="font-size:10px;color:#92400E;margin:4px 0 0;text-align:center;">Adicione mais itens e pague preço de atacado 💰</p>';
  }

  container.innerHTML = wholesaleHtml
    ? '<div class="cw-wholesale-progress" style="margin:12px 0;padding:10px 14px;background:linear-gradient(135deg,#FFFBEB,#FFF7ED);border:1px solid #FDBA74;border-radius:8px;">' + wholesaleHtml + '</div>'
    : '';
}

// mantém compatibilidade
async function changeItemQty(id, qty) {
  _cartInteracting = true;
  try {
    await updateCartItem(id, qty);
    await renderCart();
  } finally {
    _cartInteracting = false;
  }
}

// ===== FAVORITES =====
function toggleFav(btn, handle) {
  var favs = [];
  try { favs = JSON.parse(localStorage.getItem('wac_favs') || '[]'); } catch(e) {}
  var idx = favs.indexOf(handle);
  var svg = btn.querySelector('svg');
  if (idx > -1) {
    favs.splice(idx, 1);
    if (svg) { svg.style.fill = 'none'; svg.style.stroke = 'currentColor'; }
    btn.style.borderColor = '';
  } else {
    favs.push(handle);
    if (svg) { svg.style.fill = '#ef4444'; svg.style.stroke = '#ef4444'; }
    btn.style.borderColor = '#ef4444';
  }
  try { localStorage.setItem('wac_favs', JSON.stringify(favs)); } catch(e) {}
  var badge = document.getElementById('fav-count');
  if (badge) { badge.textContent = favs.length; badge.style.display = favs.length > 0 ? 'flex' : 'none'; }
}

// ===== SCROLL EFFECTS (desktop only) =====
document.addEventListener('DOMContentLoaded', function() {

  // Init cart badge
  fetchCart().then(cart => {
    const badge = document.getElementById('cart-count');
    if (badge && cart.item_count > 0) { badge.textContent = cart.item_count; badge.style.display = 'flex'; }
  });

  // Init favorites badge
  (function() {
    var favs = [];
    try { favs = JSON.parse(localStorage.getItem('wac_favs') || '[]'); } catch(e) {}
    var badge = document.getElementById('fav-count');
    if (badge && favs.length > 0) { badge.textContent = favs.length; badge.style.display = 'flex'; }

    // Mark active fav buttons on page (carousel + product page)
    document.querySelectorAll('.carousel-fav[data-handle], .product-fav-btn[data-handle]').forEach(function(btn) {
      if (favs.indexOf(btn.dataset.handle) > -1) {
        var svg = btn.querySelector('svg');
        if (svg) { svg.style.fill = '#ef4444'; svg.style.stroke = '#ef4444'; }
        btn.style.borderColor = '#ef4444';
      }
    });
  })();

  // Add-to-cart AJAX
  const form = document.getElementById('product-form');
  if (form) {
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      const btn = document.getElementById('add-to-cart-btn');
      const variantId = document.getElementById('variant-id').value;
      const qty = parseInt(document.getElementById('qty-input').value) || 1;
      btn.disabled = true; btn.textContent = 'Adicionando...';
      try {
        // Verifica estoque disponível vs quantidade já no carrinho
        const cart = await fetchCart();
        const inCart = cart.items.reduce(function(sum, item) {
          return sum + (String(item.variant_id) === String(variantId) ? item.quantity : 0);
        }, 0);
        const maxQty = typeof getMaxQty === 'function' ? getMaxQty() : 99;
        const canAdd = maxQty - inCart;
        if (canAdd <= 0) {
          btn.disabled = false;
          btn.textContent = 'Estoque esgotado';
          setTimeout(() => { btn.textContent = 'Adicionar ao Carrinho'; }, 2000);
          openCart();
          return;
        }
        const qtyToAdd = Math.min(qty, canAdd);
        await addToCart(variantId, qtyToAdd);
        btn.textContent = 'Adicionado ✓';
        setTimeout(() => { btn.disabled = false; btn.textContent = 'Adicionar ao Carrinho'; }, 1500);
        openCart();
      } catch(err) {
        btn.disabled = false; btn.textContent = 'Erro - Tente novamente';
        setTimeout(() => { btn.textContent = 'Adicionar ao Carrinho'; }, 2000);
      }
    });
  }

  var isDesktop = window.innerWidth >= 1024;

  // ---- 1. Header shrink on scroll ----
  var header = document.getElementById('site-header');
  var lastScroll = 0;
  window.addEventListener('scroll', function() {
    var y = window.scrollY;
    if (header) {
      if (y > 60) {
        header.classList.add('header-scrolled');
      } else {
        header.classList.remove('header-scrolled');
      }
      // Hide on scroll down, show on scroll up (desktop)
      if (isDesktop) {
        if (y > lastScroll && y > 120) {
          header.classList.add('header-hidden');
        } else {
          header.classList.remove('header-hidden');
        }
      }
    }
    lastScroll = y;


  }, { passive: true });

  // ---- 2. Scroll reveal ----
  if (!isDesktop) return; // only desktop

  var revealTargets = [
    { sel: '.carousel-card',        delay: 80,  from: 'bottom' },
    { sel: '.coll-item',            delay: 60,  from: 'bottom' },
    { sel: '.trust-item',           delay: 100, from: 'bottom' },
    { sel: '.benefit-item',         delay: 80,  from: 'bottom' },
    { sel: '.about-inner',          delay: 0,   from: 'left'   },
    { sel: '.section-header',       delay: 0,   from: 'bottom' },
    { sel: '.collections-carousel-header', delay: 0, from: 'bottom' },
  ];

  function getTransform(from) {
    if (from === 'left')  return 'translateX(-40px)';
    if (from === 'right') return 'translateX(40px)';
    return 'translateY(32px)';
  }

  var allReveal = [];
  revealTargets.forEach(function(t) {
    document.querySelectorAll(t.sel).forEach(function(el, i) {
      // Never touch elements inside the WhatsApp widget
      if (el.closest('.wac-root')) return;
      el.style.opacity = '0';
      el.style.transform = getTransform(t.from);
      el.style.transition = 'opacity .6s ease, transform .6s ease';
      el.style.transitionDelay = (i * t.delay) + 'ms';
      allReveal.push(el);
    });
  });

  var revealObserver = new IntersectionObserver(function(entries) {
    entries.forEach(function(entry) {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translate(0,0)';
        revealObserver.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });

  allReveal.forEach(function(el) { revealObserver.observe(el); });

  // ---- 3. Stagger product cards already visible ----
  document.querySelectorAll('.carousel-card').forEach(function(el, i) {
    el.style.transitionDelay = (i * 60) + 'ms';
  });

});


