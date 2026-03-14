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
  bar.classList.toggle('open');
  if (bar.classList.contains('open')) {
    bar.querySelector('input').focus();
  }
}

// Close search on Escape
document.addEventListener('keydown', function(e) {
  if (e.key === 'Escape') {
    document.getElementById('search-bar').classList.remove('open');
    document.getElementById('mobile-menu').classList.remove('open');
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

// Shopify Cart API helpers
async function fetchCart() {
  const res = await fetch('/cart.js');
  return res.json();
}

async function addToCart(variantId, quantity) {
  const res = await fetch('/cart/add.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: variantId, quantity: quantity })
  });
  return res.json();
}

async function updateCartItem(variantId, quantity) {
  const res = await fetch('/cart/change.js', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id: variantId, quantity: quantity })
  });
  return res.json();
}

function formatMoney(cents) {
  return 'R$ ' + (cents / 100).toFixed(2).replace('.', ',');
}

async function renderCart() {
  const cart = await fetchCart();
  const list = document.getElementById('cart-items-list');
  const empty = document.getElementById('cart-empty');
  const footer = document.getElementById('cart-footer');
  const badge = document.getElementById('cart-count');

  // Update badge
  const totalQty = cart.item_count;
  if (badge) {
    badge.textContent = totalQty;
    badge.style.display = totalQty > 0 ? 'flex' : 'none';
  }

  if (cart.item_count === 0) {
    empty.style.display = 'flex';
    footer.style.display = 'none';
    // Clear items except empty state
    Array.from(list.children).forEach(c => { if (c.id !== 'cart-empty') c.remove(); });
    return;
  }

  empty.style.display = 'none';
  footer.style.display = 'block';

  // Render items
  const existingItems = list.querySelectorAll('.cart-item');
  existingItems.forEach(i => i.remove());

  cart.items.forEach(item => {
    const el = document.createElement('div');
    el.className = 'cart-item';
    el.dataset.variantId = item.variant_id;
    el.innerHTML = `
      <img class="cart-item-image" src="${item.image}" alt="${item.title}">
      <div class="cart-item-info">
        <p class="cart-item-title">${item.product_title}</p>
        <p class="cart-item-variant">${item.variant_title !== 'Default Title' ? item.variant_title : ''}</p>
        <p class="cart-item-price">${formatMoney(item.final_price)}</p>
        <div class="cart-qty">
          <button onclick="changeItemQty(${item.variant_id}, ${item.quantity - 1})">−</button>
          <span>${item.quantity}</span>
          <button onclick="changeItemQty(${item.variant_id}, ${item.quantity + 1})">+</button>
        </div>
      </div>
      <button class="cart-remove" onclick="changeItemQty(${item.variant_id}, 0)" aria-label="Remover">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/>
          <path d="M9 6V4h6v2"/>
        </svg>
      </button>
    `;
    list.insertBefore(el, empty);
  });

  document.getElementById('cart-total-price').textContent = formatMoney(cart.total_price);
}

async function changeItemQty(variantId, newQty) {
  await updateCartItem(variantId, newQty);
  renderCart();
}

// Handle add-to-cart form submission via AJAX
document.addEventListener('DOMContentLoaded', function() {
  // Init cart badge
  fetchCart().then(cart => {
    const badge = document.getElementById('cart-count');
    if (badge && cart.item_count > 0) {
      badge.textContent = cart.item_count;
      badge.style.display = 'flex';
    }
  });

  const form = document.getElementById('product-form');
  if (form) {
    form.addEventListener('submit', async function(e) {
      e.preventDefault();
      const btn = document.getElementById('add-to-cart-btn');
      const variantId = document.getElementById('variant-id').value;
      const qty = parseInt(document.getElementById('qty-input').value) || 1;

      btn.disabled = true;
      btn.textContent = 'Adicionando...';

      try {
        await addToCart(variantId, qty);
        btn.textContent = 'Adicionado ✓';
        setTimeout(() => {
          btn.disabled = false;
          btn.textContent = 'Adicionar ao Carrinho';
        }, 1500);
        openCart();
      } catch (err) {
        btn.disabled = false;
        btn.textContent = 'Erro - Tente novamente';
        setTimeout(() => { btn.textContent = 'Adicionar ao Carrinho'; }, 2000);
      }
    });
  }

  // Animate elements on scroll
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  document.querySelectorAll('.product-card, .benefit-item, .trust-item').forEach(el => {
    el.style.opacity = '0';
    el.style.transform = 'translateY(20px)';
    el.style.transition = 'opacity 0.5s ease, transform 0.5s ease';
    observer.observe(el);
  });
});
