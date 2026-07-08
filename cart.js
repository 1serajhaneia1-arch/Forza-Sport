// ===== FORZA SPORT — CART ENGINE (shared across all pages) =====
const CART_KEY = 'forza_cart';
const USER_KEY = 'forza_user';
const USERS_KEY = 'forza_users';
const HISTORY_KEY = 'forza_history';
// Same per-size stock store used by product.html / dashboard.html Stock Manager,
// so stock levels stay consistent everywhere ("forza_stock_v2").
const SIZE_STOCK_KEY = 'forza_stock_v2';

// ---- STOCK (per-size, shared with product.html & Dashboard) ----
// Cart item names look like "Pro High-Top Cleats (42)" for sized products,
// or plain "Football Kick Trainer" for gadgets. This splits that back out
// into the same "Name::Size" keys the Stock Manager uses.
function parseStockName(fullName) {
  const m = fullName.match(/^(.*) \(([^)]+)\)$/);
  if (m) return { base: m[1], size: m[2] };
  return { base: fullName, size: null };
}

function getStockV2() {
  try { return JSON.parse(localStorage.getItem(SIZE_STOCK_KEY)) || {}; }
  catch { return {}; }
}

function saveStockV2(stock) {
  localStorage.setItem(SIZE_STOCK_KEY, JSON.stringify(stock));
}

function stockKeyFor(fullName) {
  const { base, size } = parseStockName(fullName);
  return size ? `${base}::${size}` : base;
}

// Available stock for a cart item name. Does NOT change until a purchase
// is actually completed — adding to cart only checks this number.
function getProductStock(fullName) {
  const stock = getStockV2();
  const key = stockKeyFor(fullName);
  return stock[key] !== undefined ? stock[key] : 10;
}

// Only ever called once an order is actually placed (see checkout.html).
function reduceStock(fullName, qty) {
  const stock = getStockV2();
  const key = stockKeyFor(fullName);
  const cur = stock[key] !== undefined ? stock[key] : 10;
  stock[key] = Math.max(0, cur - qty);
  saveStockV2(stock);
}

// Used if an order/item needs to be put back into stock (e.g. cancelled order).
function restoreStock(fullName, qty) {
  const stock = getStockV2();
  const key = stockKeyFor(fullName);
  const cur = stock[key] !== undefined ? stock[key] : 10;
  stock[key] = cur + qty;
  saveStockV2(stock);
}

// ---- CART ----
function getCart() {
  try { return JSON.parse(localStorage.getItem(CART_KEY)) || []; }
  catch { return []; }
}

function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart));
}

function addToCart(name, price, category, btn, img) {
  const avail = getProductStock(name);
  const cart = getCart();
  const idx = cart.findIndex(i => i.name === name);
  const inCart = idx > -1 ? cart[idx].qty : 0;

  if (inCart >= avail) {
    showToast(`⚠ Only ${avail} available in stock!`);
    return;
  }

  if (idx > -1) {
    cart[idx].qty += 1;
  } else {
    cart.push({ name, price, category, img: img || '', qty: 1 });
  }
  saveCart(cart);
  updateCartBadge();
  showToast(`✓ ${name} added to cart!`);

  if (btn) {
    const orig = btn.textContent;
    btn.textContent = '✓ Added!';
    btn.style.background = '#28a745';
    setTimeout(() => {
      btn.textContent = orig;
      btn.style.background = '';
    }, 1200);
  }
}

function removeFromCart(name) {
  const cart = getCart();
  const item = cart.find(i => i.name === name);
  saveCart(cart.filter(i => i.name !== name));
  updateCartBadge();
}

function changeQty(name, delta) {
  const cart = getCart();
  const idx = cart.findIndex(i => i.name === name);
  if (idx === -1) return;
  const newQty = cart[idx].qty + delta;
  if (delta > 0) {
    const avail = getProductStock(name);
    if (newQty > avail) { showToast(`⚠ Only ${avail} in stock!`); return; }
  }
  cart[idx].qty = newQty;
  if (cart[idx].qty <= 0) cart.splice(idx, 1);
  saveCart(cart);
  updateCartBadge();
}

function clearCart() {
  saveCart([]);
  updateCartBadge();
}

function getCartTotal() {
  return getCart().reduce((sum, i) => sum + i.price * i.qty, 0);
}

function getCartCount() {
  return getCart().reduce((sum, i) => sum + i.qty, 0);
}

function updateCartBadge() {
  document.querySelectorAll('.cart-badge').forEach(el => {
    el.textContent = getCartCount();
  });
}

// ---- USER ----
function getUser() {
  try { return JSON.parse(localStorage.getItem(USER_KEY)) || null; }
  catch { return null; }
}

function saveUser(user) {
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

// ---- ACCOUNTS (now backed by the server — see server.js /api/register, /api/login) ----
// These remain async functions returning { ok, message, user }, same shape as before,
// so existing call sites only need an `await` added.
async function registerUser({ fname, lname, email, phone, password, address, city, postcode }) {
  try {
    const res = await fetch('/api/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ fname, lname, email, phone, password, address, city, postcode })
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, message: data.message || 'Could not create account.' };
    return { ok: true, message: 'Account created!', user: data.user };
  } catch (e) {
    return { ok: false, message: 'Network error — is the server running?' };
  }
}

async function authenticateUser(email, password) {
  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();
    if (!res.ok) return { ok: false, message: data.message || 'Sign in failed.' };
    return { ok: true, message: 'Login successful!', user: data.user };
  } catch (e) {
    return { ok: false, message: 'Network error — is the server running?' };
  }
}

// Ask the server if our session cookie is still valid, and sync the local
// display cache (forza_user) accordingly. Called on page load.
async function syncSessionUser() {
  try {
    const res = await fetch('/api/me', { credentials: 'include' });
    if (res.ok) {
      const data = await res.json();
      saveUser(data.user);
    } else {
      localStorage.removeItem(USER_KEY);
    }
  } catch (e) {
    // server unreachable — fall back to whatever's cached locally
  }
  updateCartBadge();
  if (typeof window.updateAuthNav === 'function') window.updateAuthNav();
}

// ---- ORDER HISTORY ----
function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY)) || []; }
  catch { return []; }
}

function addToHistory(order) {
  const history = getHistory();
  history.unshift(order);
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

// ---- TOAST ----
function showToast(msg) {
  let t = document.querySelector('.toast');
  if (!t) {
    t = document.createElement('div');
    t.className = 'toast';
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(t._timer);
  t._timer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ---- BACK BUTTON ----
function injectBackButton() {
  const pages = ['home.html','product.html','cart.html','checkout.html','contact.html','register.html','account.html','history.html'];
  const current = location.pathname.split('/').pop() || 'home.html';
  const history_stack = JSON.parse(sessionStorage.getItem('nav_stack') || '[]');

  // Push current page to stack on load
  if (!history_stack.length || history_stack[history_stack.length - 1] !== current) {
    history_stack.push(current);
    sessionStorage.setItem('nav_stack', JSON.stringify(history_stack));
  }

  const prev = history_stack.length >= 2 ? history_stack[history_stack.length - 2] : null;

  const btn = document.createElement('button');
  btn.id = 'back-btn';
  btn.innerHTML = '← Back';
  btn.onclick = () => {
    if (prev) {
      history_stack.pop();
      sessionStorage.setItem('nav_stack', JSON.stringify(history_stack));
      location.href = prev;
    } else {
      window.history.back();
    }
  };
  btn.style.cssText = `
    position: fixed; top: 14px; right: 180px; z-index: 9999;
    background: rgba(30,30,30,0.95); border: 1px solid #333;
    color: #aaa; font-family: 'Barlow Condensed', sans-serif;
    font-size: 0.82rem; font-weight: 700; text-transform: uppercase;
    letter-spacing: 0.1em; padding: 0.38rem 0.9rem;
    border-radius: 20px; cursor: pointer;
    transition: border-color 0.2s, color 0.2s;
    backdrop-filter: blur(8px);
  `;
  btn.onmouseenter = () => { btn.style.borderColor = '#e8000d'; btn.style.color = '#fff'; };
  btn.onmouseleave = () => { btn.style.borderColor = '#333'; btn.style.color = '#aaa'; };
  if (prev) document.body.appendChild(btn);
}

// Init on every page
document.addEventListener('DOMContentLoaded', () => {
  updateCartBadge();
  injectBackButton();
  syncSessionUser();
  // prefill checkout from user profile
  const user = getUser();
  if (user) {
    const f = (id, val) => { const el = document.getElementById(id); if (el && val) el.value = val; };
    f('fname', user.fname); f('lname', user.lname);
    f('email', user.email); f('phone', user.phone);
    f('address', user.address); f('city', user.city);
    f('postcode', user.postcode); f('province', user.province);
  }
});