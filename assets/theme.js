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
function openCart() {
  document.getElementById('cart-drawer').classList.add('open');
  document.getElementById('cart-overlay').classList.add('open');
  document.body.style.overflow = 'hidden';
  renderCart();
}
function closeCart() {
  document.getElementById('cart-drawer').classList.remove('open');
  document.getElementById('cart-overlay').classList.remove('open');
  document.body.style.overflow = '';
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
  cart.items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'cart-item'; el.dataset.variantId = item.variant_id;
    el.innerHTML = `<img class="cart-item-image" src="${item.image}" alt="${item.title}">
      <div class="cart-item-info">
        <p class="cart-item-title">${item.product_title}</p>
        <p class="cart-item-variant">${item.variant_title !== 'Default Title' ? item.variant_title : ''}</p>
        <p class="cart-item-price">${formatMoney(item.final_price)}</p>
        <div class="cart-qty">
          <button onclick="changeItemQty(${item.variant_id},${item.quantity-1})">−</button>
          <span>${item.quantity}</span>
          <button onclick="changeItemQty(${item.variant_id},${item.quantity+1})">+</button>
        </div>
      </div>
      <button class="cart-remove" onclick="changeItemQty(${item.variant_id},0)" aria-label="Remover">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
      </button>`;
    list.insertBefore(el, empty);
  });
  document.getElementById('cart-total-price').textContent = formatMoney(cart.total_price);
}
async function changeItemQty(id, qty) { await updateCartItem(id, qty); renderCart(); }

// ===== SCROLL EFFECTS (desktop only) =====
document.addEventListener('DOMContentLoaded', function() {

  // Init cart badge
  fetchCart().then(cart => {
    const badge = document.getElementById('cart-count');
    if (badge && cart.item_count > 0) { badge.textContent = cart.item_count; badge.style.display = 'flex'; }
  });

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
        await addToCart(variantId, qty);
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


