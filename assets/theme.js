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
  // Esconde mini timer do header quando carrinho abre
  var headerTimer = document.getElementById('header-reserve-timer');
  if (headerTimer) headerTimer.style.display = 'none';
  renderCart();
}
function closeCart() {
  if (_cartInteracting) return;
  document.getElementById('cart-drawer').classList.remove('open');
  var waRoot = document.querySelector('.wac-root, .wa-fab-simple');
  if (waRoot) waRoot.style.display = '';
  // Mostra mini timer no header se reserva ainda ativa
  if (getCartReserveRemaining() > 0) {
    var headerTimer = document.getElementById('header-reserve-timer');
    if (headerTimer) headerTimer.style.display = 'inline-block';
  }
}
async function fetchCart() { return (await fetch('/cart.js')).json(); }
async function addToCart(id, qty) {
  return (await fetch('/cart/add.js', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({id, quantity: qty}) })).json();
}

// ===== RESERVA DE CARRINHO (timer estilo iFood) =====
var _cartReserveTimer = null;
var CART_RESERVE_MINUTES = 5;

function cartReserveKey() { return 'cart_reserve_expires'; }

function startCartReserve() {
  var expires = Date.now() + CART_RESERVE_MINUTES * 60 * 1000;
  try { localStorage.setItem(cartReserveKey(), expires); } catch(e) {}
  renderCartTimer();
}

function clearCartReserve(releaseLocks) {
  try { localStorage.removeItem(cartReserveKey()); } catch(e) {}
  if (_cartReserveTimer) { clearInterval(_cartReserveTimer); _cartReserveTimer = null; }
  var el = document.getElementById('cart-reserve-timer');
  if (el) el.style.display = 'none';
  if (releaseLocks) releaseAllCartLocks();
}

function getCartReserveRemaining() {
  try {
    var exp = parseInt(localStorage.getItem(cartReserveKey()) || '0');
    return Math.max(0, exp - Date.now());
  } catch(e) { return 0; }
}

function renderCartTimer() {
  var el = document.getElementById('cart-reserve-timer');
  if (!el) return;

  if (_cartReserveTimer) clearInterval(_cartReserveTimer);

  function tick() {
    var ms = getCartReserveRemaining();
    if (ms <= 0) {
      clearCartReserve(false);
      // Libera locks na API antes de limpar o carrinho
      releaseAllCartLocks().finally(function() {
        fetch('/cart/clear.js', { method: 'POST' }).then(function() {
          renderCart();
          var msg = document.getElementById('cart-reserve-expired-msg');
          if (msg) { msg.style.display = 'block'; setTimeout(function(){ msg.style.display = 'none'; }, 5000); }
        });
      });
      return;
    }
    var totalSec = Math.ceil(ms / 1000);
    var min = Math.floor(totalSec / 60);
    var sec = totalSec % 60;
    var timeStr = min + ':' + (sec < 10 ? '0' : '') + sec;

    // Timer dentro do carrinho
    el.style.display = 'flex';
    var timeEl = document.getElementById('cart-reserve-countdown');
    if (timeEl) timeEl.textContent = timeStr;
    el.style.background = ms < 60000 ? 'linear-gradient(135deg,#FEF2F2,#FEE2E2)' : 'linear-gradient(135deg,#EFF6FF,#DBEAFE)';
    el.style.borderColor = ms < 60000 ? '#FCA5A5' : '#93C5FD';
    var icon = document.getElementById('cart-reserve-icon');
    if (icon) icon.textContent = ms < 60000 ? '⚠️' : '⏱️';

    // Mini timer no header (só quando carrinho está fechado)
    var headerTimer = document.getElementById('header-reserve-timer');
    var headerCountdown = document.getElementById('header-reserve-countdown');
    var cartDrawer = document.getElementById('cart-drawer');
    var cartOpen = cartDrawer && cartDrawer.classList.contains('open');
    if (headerTimer && headerCountdown) {
      if (!cartOpen) {
        headerTimer.style.display = 'inline-block';
        headerTimer.style.background = ms < 60000 ? '#dc2626' : '#1e40af';
        headerCountdown.textContent = timeStr;
      } else {
        headerTimer.style.display = 'none';
      }
    }
  }

  tick();
  _cartReserveTimer = setInterval(tick, 1000);
}

// ===== INTEGRAÇÃO CHECK-STOCK-LOCKS (ConectWhats) =====
var CW_STOCK_API         = (window.__cwStockAPI && window.__cwStockAPI.url) || '';
var CW_CREATE_LOCK_API   = (window.__cwStockAPI && window.__cwStockAPI.url) ? window.__cwStockAPI.url.replace('check-stock-locks', 'create-stock-lock') : '';
var CW_RELEASE_LOCK_API  = (window.__cwStockAPI && window.__cwStockAPI.url) ? window.__cwStockAPI.url.replace('check-stock-locks', 'release-stock-lock') : '';
var CW_API_KEY           = (window.__cwStockAPI && window.__cwStockAPI.key) || '';

function getCwApiKey() {
  return (window.__cwStockAPI && window.__cwStockAPI.key) || CW_API_KEY || '';
}

// Gera ou recupera session_id único por visitante
function getCwSessionId() {
  var key = 'cw_session_id';
  try {
    var id = localStorage.getItem(key);
    if (!id) {
      id = 'sess-' + Math.random().toString(36).slice(2) + '-' + Date.now();
      localStorage.setItem(key, id);
    }
    return id;
  } catch(e) { return 'sess-' + Date.now(); }
}

async function createStockLock(variantId, quantity, expiresIn) {
  var key = getCwApiKey();
  if (!key) return;
  // Invalida cache para forçar leitura fresca na próxima verificação
  delete _stockLockCache[String(variantId)];
  delete _stockLockCacheTime[String(variantId)];
  try {
    await fetch(CW_CREATE_LOCK_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({
        variant_id: String(variantId),
        quantity: quantity,
        session_id: getCwSessionId(),
        expires_in: expiresIn || CART_RESERVE_MINUTES * 60
      })
    });
  } catch(e) {}
}

async function releaseStockLock(variantId) {
  var key = getCwApiKey();
  if (!key) return;
  // Invalida cache para forçar leitura fresca
  delete _stockLockCache[String(variantId)];
  delete _stockLockCacheTime[String(variantId)];
  try {
    await fetch(CW_RELEASE_LOCK_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key },
      body: JSON.stringify({
        variant_id: String(variantId),
        session_id: getCwSessionId()
      })
    });
  } catch(e) {}
}

async function releaseAllCartLocks() {
  try {
    var cart = await fetchCart();
    if (!cart.items || cart.items.length === 0) return;
    await Promise.all(cart.items.map(function(item) {
      return releaseStockLock(item.variant_id);
    }));
  } catch(e) {}
}

// Cache curto (5s) para não spammar a API em cliques rápidos
var _stockLockCache = {};
var _stockLockCacheTime = {};
var STOCK_CACHE_TTL = 5000;

async function checkStockLocks(variantIds) {
  var now = Date.now();
  var toFetch = variantIds.filter(function(id) {
    return !_stockLockCacheTime[id] || (now - _stockLockCacheTime[id]) > STOCK_CACHE_TTL;
  });

  if (toFetch.length > 0) {
    try {
      var r = await fetch(CW_STOCK_API + '?variant_ids=' + toFetch.join(','), {
        headers: { 'x-api-key': getCwApiKey() }
      });
      var data = await r.json();
      if (data && data.locks) {
        Object.keys(data.locks).forEach(function(id) {
          _stockLockCache[id] = data.locks[id];
          _stockLockCacheTime[id] = now;
        });
      }
    } catch(e) {
      // Em caso de erro na API, não bloqueia o cliente
      toFetch.forEach(function(id) {
        _stockLockCache[id] = { locked: false, locked_quantity: 0 };
        _stockLockCacheTime[id] = now;
      });
    }
  }

  return _stockLockCache;
}

async function validateStockRealtime(handle, variantId, qtyWanted) {
  try {
    // 1. Verifica disponibilidade no Shopify
    var r = await fetch('/products/' + handle + '.js');
    var product = await r.json();
    var variant = product.variants.find(function(v) { return String(v.id) === String(variantId); });
    if (!variant) return { ok: true, locked: false };
    if (!variant.available) return { ok: false, locked: false, reason: 'esgotado' };

    // 2. Verifica reservas ativas no ConectWhats
    var locks = await checkStockLocks([String(variantId)]);
    var lock = locks[String(variantId)];
    if (lock && lock.locked) {
      // Desconta o que o próprio cliente já tem no carrinho + o que está tentando adicionar agora
      var cartResp = await fetch('/cart.js');
      var cart = await cartResp.json();
      var alreadyInCart = cart.items ? cart.items.reduce(function(sum, item) {
        return sum + (String(item.variant_id) === String(variantId) ? item.quantity : 0);
      }, 0) : 0;

      var shopifyQty = variant.inventory_quantity || 0;

      // Shopify não expõe inventory_quantity na API pública (retorna 0)
      // Nesse caso usa o variantInventory do Liquid (carregado no page load) se disponível
      if (shopifyQty === 0 && typeof variantInventory !== 'undefined' && variantInventory[String(variantId)]) {
        shopifyQty = variantInventory[String(variantId)].qty || 0;
      }

      // Se ainda 0 mas variant.available=true, o Shopify não controla estoque aqui — não bloqueia
      if (shopifyQty === 0) {
        return { ok: true, locked: false };
      }

      var totalOwnAfterAdd = alreadyInCart + qtyWanted;
      var lockedByOthers = Math.max(0, (lock.locked_quantity || 0) - totalOwnAfterAdd);
      var realAvailable = shopifyQty - lockedByOthers;
      console.log('[stock-debug] shopifyQty=' + shopifyQty + ' locked=' + lock.locked_quantity + ' alreadyInCart=' + alreadyInCart + ' qtyWanted=' + qtyWanted + ' totalOwnAfterAdd=' + totalOwnAfterAdd + ' lockedByOthers=' + lockedByOthers + ' realAvailable=' + realAvailable);
      if (realAvailable < qtyWanted) {
        return { ok: false, locked: true, reason: 'reservado', available: Math.max(0, realAvailable - alreadyInCart) };
      }
    }

    return { ok: true, locked: false };
  } catch(e) {
    return { ok: true, locked: false };
  }
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
    list.querySelectorAll('.cart-item').forEach(i => i.remove());
    clearCartReserve();
    return;
  }
  empty.style.display = 'none'; footer.style.display = 'block';
  // Inicia timer se ainda não existe reserva ativa
  if (getCartReserveRemaining() <= 0) startCartReserve();
  else renderCartTimer();
  list.querySelectorAll('.cart-item').forEach(i => i.remove());

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

  var acCfg = window.__cwAcessorio;
  if (acCfg && acCfg.enabled) {
    var uniqueHandles = [...new Set(cart.items.map(function(i){ return i.handle; }))];
    await Promise.all(uniqueHandles.map(function(h){ return getProductTags(h); }));
  }

  // Agrupa total por handle de acessório
  var acessorioTotals = {};
  if (acCfg && acCfg.enabled) {
    cart.items.forEach(function(item) {
      var tags = window._tagsCache && window._tagsCache[item.handle] ? window._tagsCache[item.handle] : [];
      if (tags.indexOf(acCfg.tag.toLowerCase()) > -1) {
        acessorioTotals[item.handle] = (acessorioTotals[item.handle] || 0) + item.final_price * item.quantity;
      }
    });
  }

  cart.items.forEach((item, index) => {
    const lineIndex = index + 1;
    const wsPrice = wholesaleActive ? _wsCache[item.handle] : null;

    // Verifica se é acessório
    var isAcessorio = acCfg && acCfg.enabled && acessorioTotals[item.handle] !== undefined;
    var acessorioAtingiu = false;
    var acessorioHtml = '';
    var itemBorder = '';
    var badgeHtml = '';

    if (isAcessorio) {
      var total = acessorioTotals[item.handle];
      var minVal = acCfg.min_value;
      var pct = Math.min(100, Math.round((total / minVal) * 100));
      var faltam = Math.max(0, minVal - total);
      acessorioAtingiu = faltam === 0;

      // Badge na imagem sempre aparece (indica que é produto com mínimo)
      badgeHtml = '<span style="position:absolute;bottom:0;left:0;background:' + (acessorioAtingiu ? '#16a34a' : '#F97316') + ';color:#fff;font-size:9px;font-weight:700;padding:2px 5px;border-radius:0 4px 0 6px;white-space:nowrap;">'
        + 'Min. ' + formatMoney(minVal) + '</span>';

      // Borda e aviso só aparecem quando NÃO atingiu o mínimo
      if (!acessorioAtingiu) {
        itemBorder = 'border:1.5px solid #F97316;border-radius:0.75rem;';
        acessorioHtml = '<div style="margin-top:6px;">'
          + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px;">'
          + '<span style="font-size:0.72rem;font-weight:600;color:#F97316;">🏷️ Valor mínimo deste produto</span>'
          + '<span style="font-size:0.72rem;font-weight:700;color:#F97316;">Faltam ' + formatMoney(faltam) + '</span>'
          + '</div>'
          + '<div style="background:#fed7aa;border-radius:9999px;height:5px;overflow:hidden;">'
          + '<div style="height:100%;background:#F97316;border-radius:9999px;width:' + pct + '%;"></div>'
          + '</div>'
          + '<p style="font-size:0.7rem;color:#C2410C;margin:0.25rem 0 0;">Abaixo do mínimo: preço de varejo aplicado</p>'
          + '</div>';
      }
    }

    // Se acessório e não atingiu mínimo → força preço de varejo
    var effectiveWsPrice = (isAcessorio && !acessorioAtingiu) ? null : wsPrice;

    var priceHtml;
    if (effectiveWsPrice && effectiveWsPrice > 0) {
      priceHtml =
        '<p class="cart-item-price" style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">' +
          '<s style="color:#aaa;font-size:12px;">' + formatMoney(item.final_price) + '</s>' +
          '<span style="color:#15803D;font-weight:700;">' + formatMoney(effectiveWsPrice) + '</span>' +
          '<span style="background:#DCFCE7;color:#166534;font-size:9px;padding:1px 5px;border-radius:4px;font-weight:700;">ATACADO</span>' +
        '</p>';
    } else {
      priceHtml = '<p class="cart-item-price">' + formatMoney(item.final_price) + '</p>';
    }

    const el = document.createElement('div');
    el.className = 'cart-item';
    if (itemBorder) el.style.cssText = itemBorder;
    // Calcula estoque máximo para este item no carrinho
    var itemLockData = _stockLockCache[String(item.variant_id)];
    var itemLockedByOthers = (itemLockData && itemLockData.locked) ? Math.max(0, (itemLockData.locked_quantity || 0) - item.quantity) : 0;
    var itemInv = item.inventory_quantity !== undefined ? item.inventory_quantity : 9999;
    var itemMax = Math.max(item.quantity, itemInv - itemLockedByOthers);
    var atMax = item.quantity >= itemMax;

    el.innerHTML = '<div style="position:relative;flex-shrink:0;">'
      + '<img class="cart-item-image" src="' + item.image + '" alt="' + item.title + '">'
      + badgeHtml
      + '</div>'
      + '<div class="cart-item-info">'
      + '<p class="cart-item-title">' + item.product_title + '</p>'
      + '<p class="cart-item-variant">' + (item.variant_title !== 'Default Title' ? item.variant_title : '') + '</p>'
      + priceHtml
      + acessorioHtml
      + '<div class="cart-qty">'
      + '<button type="button" onclick="changeItemLine(' + lineIndex + ',' + (item.quantity-1) + ')">−</button>'
      + '<span>' + item.quantity + '</span>'
      + '<button type="button" onclick="changeItemLine(' + lineIndex + ',' + (item.quantity+1) + ')"' + (atMax ? ' disabled style="opacity:0.4;cursor:not-allowed;"' : '') + '>+</button>'
      + '</div></div>'
      + '<button type="button" class="cart-remove" onclick="changeItemLine(' + lineIndex + ',0)" aria-label="Remover">'
      + '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>'
      + '</button>';
    list.insertBefore(el, empty);
  });

  document.getElementById('cart-total-price').textContent = formatMoney(cart.total_price);
  await renderWholesaleProgress(cart);
}


async function changeItemLine(line, qty) {
  _cartInteracting = true;
  try {
    var cartBefore = await fetchCart();
    var item = cartBefore.items[line - 1];

    // Limita qty ao estoque real disponível (Shopify - locks de outros)
    if (item && qty > 0) {
      var lockData = _stockLockCache[String(item.variant_id)];
      var lockedByOthers = (lockData && lockData.locked) ? (lockData.locked_quantity || 0) : 0;
      // Desconta apenas locks de outros (não o próprio item atual)
      var currentQty = item.quantity;
      var inv = null;
      try {
        var r = await fetch('/products/' + item.handle + '.js');
        var p = await r.json();
        var v = p.variants.find(function(v) { return String(v.id) === String(item.variant_id); });
        if (v && v.inventory_management && v.inventory_policy !== 'continue') {
          inv = v.inventory_quantity;
        }
      } catch(e) {}
      if (inv !== null) {
        // Estoque disponível = total - locks de outros clientes
        var maxAllowed = Math.max(0, inv - Math.max(0, lockedByOthers - currentQty));
        qty = Math.min(qty, maxAllowed);
        if (qty <= 0) { _cartInteracting = false; return; }
      }
    }

    await fetch('/cart/change.js', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({ line: line, quantity: qty })
    });
    if (item) {
      if (qty <= 0) {
        await releaseStockLock(item.variant_id);
      } else {
        await createStockLock(item.variant_id, qty);
      }
    }
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

  // Init cart badge + retoma timer de reserva se ainda válido
  fetchCart().then(cart => {
    const badge = document.getElementById('cart-count');
    if (badge && cart.item_count > 0) { badge.textContent = cart.item_count; badge.style.display = 'flex'; }
    if (cart.item_count > 0 && getCartReserveRemaining() > 0) {
      renderCartTimer();
    } else if (cart.item_count === 0) {
      clearCartReserve();
    }
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
      btn.disabled = true; btn.textContent = 'Verificando estoque...';
      try {
        // Valida estoque em tempo real (não usa valor estático da página)
        var handle = typeof productHandle !== 'undefined' ? productHandle : null;
        if (handle) {
          var stock = await validateStockRealtime(handle, variantId, qty);
          if (!stock.ok) {
            btn.disabled = false;
            if (stock.locked && stock.available > 0) {
              btn.textContent = 'Apenas ' + stock.available + ' disponível(is)';
            } else if (stock.locked) {
              btn.textContent = '🔒 Outro cliente reservou — aguarde';
            } else {
              btn.textContent = 'Esgotado';
            }
            setTimeout(() => { btn.textContent = 'Adicionar ao Carrinho'; btn.disabled = false; }, 3000);
            return;
          }
        }

        btn.textContent = 'Adicionando...';
        // Verifica quantidade já no carrinho
        const cart = await fetchCart();
        const inCart = cart.items.reduce(function(sum, item) {
          return sum + (String(item.variant_id) === String(variantId) ? item.quantity : 0);
        }, 0);
        // canAdd = quanto ainda dá pra adicionar (já desconta inCart e locks de outros)
        const canAdd = typeof getMaxQty === 'function' ? getMaxQty() : 99;
        if (canAdd <= 0) {
          btn.disabled = false;
          var lockData2 = _stockLockCache[String(variantId)];
          var hasOtherLock = lockData2 && lockData2.locked && (lockData2.locked_quantity || 0) > inCart;
          btn.textContent = hasOtherLock ? '🔒 Outro cliente reservou — aguarde' : '🛒 Você já adicionou todo o estoque disponível';
          setTimeout(() => { btn.textContent = 'Adicionar ao Carrinho'; btn.disabled = false; }, 3000);
          openCart();
          return;
        }
        const qtyToAdd = Math.min(qty, canAdd);
        await addToCart(variantId, qtyToAdd);
        // Registra lock com a quantidade TOTAL no carrinho (inCart + adicionado agora)
        await createStockLock(variantId, inCart + qtyToAdd);
        btn.textContent = 'Adicionado ✓';
        // Verifica se esgotou após adicionar
        var inv = typeof variantInventory !== 'undefined' ? variantInventory[variantId] : null;
        if (inv && inv.management && inv.policy !== 'continue' && inv.qty > 0 && typeof checkStockAfterAdd === 'function') {
          setTimeout(function() {
            checkStockAfterAdd(variantId, inv.qty, inv.policy, btn);
          }, 800);
        } else {
          setTimeout(() => { btn.disabled = false; btn.textContent = 'Adicionar ao Carrinho'; }, 1500);
        }
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


