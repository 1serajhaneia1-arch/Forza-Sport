(function () {
  var PRODUCTS_KEY = 'forza_dash_products';
  var SIZE_STOCK_KEY = 'forza_stock_v2';
  var CURRENCY = 'LYD';

  // True when this page was opened directly from disk (double-clicked /
  // file:// URL) instead of through the Node server. In that case relative
  // fetches like '/api/products' can never reach anything real, so we skip
  // the network round-trip and go straight to the local cache — and pages
  // can use this flag to warn the person that they're looking at possibly
  // stale, offline data.
  var IS_FILE_PROTOCOL = (typeof location !== 'undefined' && location.protocol === 'file:');

  var DEFAULT_PRODUCTS = [
    { id:1, name:'Pro High-Top Cleats',     price:295, cat:'shoes',   img:'Images/Cyan cleats.jpeg',   desc:'High-top cleat with strong ankle support and multi-stud grip sole.' },
    { id:2, name:'Speed Low-Top Cleats',    price:255, cat:'shoes',   img:'Images/blue cleats.jpeg',   desc:'Lightweight low-top design for explosive speed and quick cuts.' },
    { id:3, name:'Classic White Cleats',    price:235, cat:'shoes',   img:'Images/white cleats.jpeg',  desc:'Clean match-day cleats with durable rubber studs.' },
    { id:4, name:'PSG Black Jordan Kit',    price:175, cat:'kits',    img:'Images/black psg.jpeg',     desc:'Replica PSG x Jordan collaboration kit in sleek matte black.' },
    { id:5, name:'Brazil Dark Blue Kit',    price:165, cat:'kits',    img:'Images/Brazil.jpeg',        desc:'Brazil national team alternate kit in midnight dark blue.' },
    { id:6, name:'Real Madrid White Kit',   price:175, cat:'kits',    img:'Images/real madrid.jpeg',   desc:'Iconic Real Madrid home white kit with a comfortable regular fit.' },
    { id:7, name:'Football Kick Trainer',   price:59,  cat:'gadgets', img:'Images/Ball handler.jpeg',  desc:'Solo training aid for repeated kick practice.' },
    { id:8, name:'Training Cones (10 pcs)', price:39,  cat:'gadgets', img:'Images/Cones.jpeg',         desc:'Durable cones for dribbling drills, speed work, and field marking.' },
    { id:9, name:'Resistance Bands Set',    price:49,  cat:'gadgets', img:'Images/Mat.jpeg',           desc:'Three resistance levels for strength, mobility, and rehab sessions.' }
  ];

  function cloneProducts(arr) {
    return (arr || DEFAULT_PRODUCTS).map(function (p) { return Object.assign({}, p); });
  }

  function formatMoney(value) {
    return CURRENCY + ' ' + Number(value || 0).toLocaleString();
  }

  function getLocalProducts() {
    try { return JSON.parse(localStorage.getItem(PRODUCTS_KEY)) || cloneProducts(DEFAULT_PRODUCTS); }
    catch (e) { return cloneProducts(DEFAULT_PRODUCTS); }
  }

  function saveLocalProducts(products) {
    localStorage.setItem(PRODUCTS_KEY, JSON.stringify(cloneProducts(products)));
  }

  async function loadProducts() {
    if (IS_FILE_PROTOCOL) {
      // No server to talk to from a file:// page — don't even try the
      // fetch (it would just fail against a bogus file:///api/products
      // path). Go straight to whatever's cached locally.
      console.warn('[ForzaStore] Page opened via file:// — showing cached/local products only. Run "npm start" and open http://localhost:3000 to see the live catalog.');
      return getLocalProducts();
    }
    try {
      var res = await fetch('/api/products', { cache: 'no-store' });
      if (!res.ok) throw new Error('Catalog API unavailable');
      var products = await res.json();
      saveLocalProducts(products);
      return cloneProducts(products);
    } catch (e) {
      return getLocalProducts();
    }
  }

  // Shows a fixed banner at the top of the page warning that the site was
  // opened directly from disk rather than through the server, so anything
  // shown (products, stock, orders) may be stale/local-only. Pages call
  // this once on DOMContentLoaded if ForzaStore.isFileProtocol is true.
  function showOfflineBanner() {
    if (document.getElementById('forza-offline-banner')) return;
    var bar = document.createElement('div');
    bar.id = 'forza-offline-banner';
    bar.style.cssText = [
      'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9999',
      'background:#e8000d', 'color:#fff', 'font-family:Barlow, sans-serif',
      'font-size:0.85rem', 'font-weight:600', 'text-align:center',
      'padding:0.6rem 1rem', 'box-shadow:0 2px 10px rgba(0,0,0,0.4)'
    ].join(';');
    bar.innerHTML = '⚠️ You\'re viewing this file directly from disk, not through the server — ' +
      'products, stock, and orders may be out of date. Run <code style="background:rgba(0,0,0,0.25);padding:0 4px;border-radius:3px">npm start</code> ' +
      'and open <code style="background:rgba(0,0,0,0.25);padding:0 4px;border-radius:3px">http://localhost:3000</code> instead.';
    document.body.appendChild(bar);
    document.body.style.paddingTop = (bar.offsetHeight + 8) + 'px';
  }

  async function saveProducts(products, adminKey) {
    saveLocalProducts(products);
    try {
      var url = '/api/products' + (adminKey ? ('?key=' + encodeURIComponent(adminKey)) : '');
      var res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ products: cloneProducts(products) })
      });
      if (!res.ok) {
        var errBody = await res.json().catch(function () { return {}; });
        throw new Error(errBody.message || 'Catalog API rejected update');
      }
      return await res.json();
    } catch (e) {
      return { saved: 'local', message: e.message };
    }
  }

  // ---- STOCK (server-backed, same pattern as products above) ----
  // Previously this stored stock purely in localStorage, meaning each
  // browser had its own private "reality" and admin edits from the
  // Dashboard never actually reached customers. Now the server's
  // data/stock.json is the source of truth; localStorage is kept only
  // as an offline fallback/cache, same as products.

  function getLocalStock() {
    try { return JSON.parse(localStorage.getItem(SIZE_STOCK_KEY)) || {}; }
    catch (e) { return {}; }
  }

  function saveLocalStock(stock) {
    localStorage.setItem(SIZE_STOCK_KEY, JSON.stringify(stock || {}));
  }

  async function loadStock() {
    if (IS_FILE_PROTOCOL) {
      console.warn('[ForzaStore] Page opened via file:// — showing cached/local stock only.');
      return getLocalStock();
    }
    try {
      var res = await fetch('/api/stock', { cache: 'no-store' });
      if (!res.ok) throw new Error('Stock API unavailable');
      var stock = await res.json();
      saveLocalStock(stock);
      return stock;
    } catch (e) {
      return getLocalStock();
    }
  }

  async function saveStock(stock, adminKey) {
    saveLocalStock(stock);
    try {
      var url = '/api/stock' + (adminKey ? ('?key=' + encodeURIComponent(adminKey)) : '');
      var res = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(stock || {})
      });
      if (!res.ok) {
        var errBody = await res.json().catch(function () { return {}; });
        throw new Error(errBody.message || 'Stock API rejected update');
      }
      return await res.json();
    } catch (e) {
      return { saved: 'local', message: e.message };
    }
  }

  // Synchronous accessors kept for compatibility with existing call sites
  // (product.html, cart.js) — they read whatever's currently cached
  // locally. Call ForzaStore.loadStock() once at page init to populate
  // that cache with the latest server data before relying on these.
  function getStockV2() { return getLocalStock(); }
  function saveStockV2(stock) { saveLocalStock(stock); }

  window.ForzaStore = {
    PRODUCTS_KEY: PRODUCTS_KEY,
    SIZE_STOCK_KEY: SIZE_STOCK_KEY,
    DEFAULT_PRODUCTS: DEFAULT_PRODUCTS,
    currency: CURRENCY,
    isFileProtocol: IS_FILE_PROTOCOL,
    formatMoney: formatMoney,
    getLocalProducts: getLocalProducts,
    saveLocalProducts: saveLocalProducts,
    loadProducts: loadProducts,
    saveProducts: saveProducts,
    getStockV2: getStockV2,
    saveStockV2: saveStockV2,
    loadStock: loadStock,
    saveStock: saveStock,
    showOfflineBanner: showOfflineBanner
  };
})();