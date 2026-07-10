// server.js — Forza Sport backend
// Run with: node server.js
// Requires: npm install express multer bcryptjs jsonwebtoken cookie-parser dotenv

require('dotenv').config();

const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const multer = require('multer');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cookieParser = require('cookie-parser');

const app = express();

// ===== PORT CONFIGURATION FOR RENDER =====
// Dynamic environment porting prevents "Port Timeout / Deploy Failed" errors on cloud hosts.
const PORT = process.env.PORT || 3000;
const HTTPS_PORT = process.env.HTTPS_PORT || 3443;

// ===== CONFIG =====
// The admin key MUST be set via the ADMIN_KEY environment variable on your host.
// Do not hardcode a default here — a known key would let anyone overwrite your
// product catalog and upload arbitrary images.
const ADMIN_KEY = process.env.ADMIN_KEY;
if (!ADMIN_KEY) {
  console.error('❌ ADMIN_KEY environment variable is not set. Refusing to start.');
  console.error('   Set it before launching, e.g.: ADMIN_KEY=your-secret-here node server.js');
  process.exit(1);
}

// JWT_SECRET signs user session cookies. Must also come from the environment —
// if this leaked or were guessable, anyone could forge a login session.
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('❌ JWT_SECRET environment variable is not set. Refusing to start.');
  console.error('   Set it before launching (see .env.example).');
  process.exit(1);
}

const DATA_DIR = path.join(__dirname, 'data');
const PRODUCTS_FILE = path.join(DATA_DIR, 'products.json');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const ORDERS_FILE = path.join(DATA_DIR, 'orders.json');
const STOCK_FILE = path.join(DATA_DIR, 'stock.json');
const IMAGES_DIR = path.join(__dirname, 'Images');

// ===== ENSURE FOLDERS/FILES EXIST =====
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(STOCK_FILE)) fs.writeFileSync(STOCK_FILE, JSON.stringify({}, null, 2));

// Finds an existing image file by base name (e.g. "black cleats 1"), regardless
// of its actual extension (.jpg/.jpeg/.png/.webp) or folder casing (images/Images).
// This avoids hardcoding a guessed extension for photos already sitting in the project.
function findImageFile(baseName) {
  const dirsToCheck = ['images', 'Images'].map(d => path.join(__dirname, d));
  for (const dir of dirsToCheck) {
    if (!fs.existsSync(dir)) continue;
    let filesInDir;
    try { filesInDir = fs.readdirSync(dir); } catch (e) { continue; }
    const found = filesInDir.find(f => {
      const withoutExt = f.replace(/\.[^.]+$/, '');
      return withoutExt.toLowerCase() === baseName.toLowerCase();
    });
    if (found) {
      const relDir = path.basename(dir);
      return `${relDir}/${found}`;
    }
  }
  return null; // not found — caller should fall back to a placeholder
}

let _productImageFallback = 'images/logo.png';

// Looks up all 3 numbered shots for a product (e.g. "black cleats 1/2/3") and
// returns whichever ones actually exist on disk, in order. Missing shots are
// simply skipped rather than filled with the fallback, so a product only
// shows the real photos it has.
function findImages(baseName) {
  return [1, 2, 3]
    .map(n => findImageFile(`${baseName} ${n}`))
    .filter(Boolean);
}

// ===== DELIVERY PRICING (LYD) — authoritative; the client's checkout page =====
// ===== sends a "deliveryArea" name, and this table is the source of truth =====
// ===== for its cost, same principle as never trusting client-sent prices. =====
const DELIVERY_PRICES = {
  // Eastern region
  'سيدي خليفة': 20, 'سيدي علي': 20, 'دريانة': 20, 'المبني': 20, 'برسس': 20,
  'بوجرار': 20, 'توكرة': 20, 'طلميثة': 30, 'بوترابة': 25, 'سوسة': 30,
  'مراوة': 25, 'المرج': 20, 'مسة': 25, 'طبرق': 25, 'سلوق': 30, 'الابرق': 25,
  'بوتراية': 30, 'فرزوغة': 20, 'البكور': 20, 'الفايدية': 30, 'الابيار': 30,
  'تاكنس': 25, 'البياضة': 25, 'البيضاء': 25, 'درنة': 30, 'التميمى': 25,
  'القبة': 25, 'امساعد': 25, 'ام الرزم': 25, 'مرتوبة': 25, 'قصرليبيا': 25,
  // Western region
  'قمينس': 20, 'اجدابيا': 20, 'بشر': 30, 'العقيلة': 30, 'البريقة': 30,
  'راس لانوف': 30, 'السدرة': 30, 'الزويتينة': 30, 'سلطان': 20, 'بن جواد': 30,
  'سرت': 30, 'بوقرين': 30, 'مصراتة': 30, 'زليتن': 30, 'الخمس': 30, 'مسلاتة': 30,
  'بني وليد': 40, 'ترهونة': 40, 'ورشفانة': 30, 'الزاوية': 35, 'صرمان': 40,
  'صبراتة': 40, 'الجميل': 45, 'زلطن': 50, 'العجيلات': 40, 'غريان': 35,
  'الزنتان': 45, 'القرة بوللي': 30, 'قصرالخيار': 30, 'زوارة': 45, 'يفرن': 50,
  'نالوت': 50, 'ككلة': 50, 'الرياينة': 45,
  // Southern region
  'جالو': 30, 'أوجلة': 30, 'أجخرة': 30, 'تازريو': 30, 'الكفرة': 35, 'سبها': 30,
  'براك الشاطي': 40, 'الجفره': 30, 'ودان': 30, 'هون': 30, 'اوباري': 40,
  'تراغن': 40, 'مزدة': 40, 'تمسه': 40, 'إدرى الشاطي': 45, 'القيره': 40,
  'مرزق': 50, 'زلة': 40, 'غدامس': 50, 'ام الارانب': 50, 'القطرون': 45,
  'غات': 50, 'عيون الشاطي': 45, 'وادى عتبة': 40, 'تهالا': 50, 'باركت': 50
};

const DEFAULT_PRODUCTS = (() => {
  const fallback = findImageFile('logo') || 'images/logo.png'; // last-resort guess if even the logo can't be found
  _productImageFallback = fallback;

  function shoe(id, name, price, baseName, desc) {
    const images = findImages(baseName);
    return {
      id, name, price, cat: 'shoes',
      img: images[0] || fallback,       // kept for anything still reading the old single-image field
      images: images.length ? images : [fallback],
      desc
    };
  }

  return [
    shoe(1,  'Black Adidas Cleats',       260, 'black adidas cleats',            'Sleek all-black adidas-style cleats built for grip and control on match day.'),
    shoe(2,  'Black & Gold Adidas Cleats',275, 'black and gold adidas',          'Bold black and gold colorway with a lightweight, responsive sole.'),
    shoe(3,  'Black & Yellow Boots',      250, 'black and yellow boots',         'High-visibility black and yellow boots for speed and standout style.'),
    shoe(4,  'Black Cleats',              240, 'black cleats',                   'Classic matte-black cleats — clean, durable, and match-ready.'),
    shoe(5,  'Cyan Adidas Cleats',        265, 'Cyan adidas',                    'Eye-catching cyan adidas-style cleats with a supportive fit.'),
    shoe(6,  'Cyan-Green Cleats',         260, 'cyan green cleat',               'Vibrant cyan-green cleats designed for quick cuts and sprints.'),
    shoe(7,  'Green Cleats',              255, 'green cleats',                  'Sharp green cleats offering a great mix of comfort and traction.'),
    shoe(8,  'Mercury Cleats',            270, 'mercury cleats',                'Speed-focused Mercury-style cleats for explosive acceleration.'),
    shoe(9,  'Pink Adidas Cleats',        260, 'pink adidas cleats',            'Standout pink adidas-style cleats with a snug, locked-in feel.'),
    shoe(10, 'Purple Boots',              245, 'purple boots',                  'Distinctive purple boots built for all-surface performance.'),
    shoe(11, 'White & Black Adidas Cleats',265,'white and black adidas cleats', 'Classic white and black adidas-style cleats with reliable grip.'),
    shoe(12, 'White & Cyan Adidas Cleats', 265, 'White and cyan adidas cleats', 'Fresh white and cyan colorway paired with a lightweight build.'),
    shoe(13, 'White & Blue X Cleats',      275, 'White andd blue X cleats',     'X-style cleats in white and blue, built for agile, cutting play.'),
    shoe(14, 'White CR7 Cleats',           290, 'White CR7 cleats',             'Premium CR7-signature-style cleats in a clean white finish.')
  ];
})();

if (!fs.existsSync(PRODUCTS_FILE)) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(DEFAULT_PRODUCTS, null, 2));
} else {
  // A products.json from before multi-image support won't have an "images"
  // array yet. Upgrade it in place — using the matching DEFAULT_PRODUCTS
  // entry (by id) if one exists, otherwise just wrapping the old single img —
  // so existing deployments pick up the new galleries without manual editing.
  try {
    const existing = JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
    const defaultsById = new Map(DEFAULT_PRODUCTS.map(p => [p.id, p]));
    let changed = false;
    existing.forEach(p => {
      if (!Array.isArray(p.images) || !p.images.length) {
        const def = defaultsById.get(p.id);
        if (def && def.images && def.images.length) {
          p.images = def.images;
        } else if (p.img) {
          p.images = [p.img];
        }
        changed = true;
      }
    });
    if (changed) {
      fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(existing, null, 2));
      console.log('✓ Migrated existing product catalog to include multiple images per product.');
    }
  } catch (e) {
    console.warn('⚠  Could not check/migrate existing products.json for multi-image support:', e.message);
  }
}

// Flag any product whose photo we could not confidently locate, so it's easy
// to spot in the terminal rather than discovering a broken image in the browser.
const missingPhotoProducts = DEFAULT_PRODUCTS.filter(p => p.img === _productImageFallback);
if (missingPhotoProducts.length) {
  console.warn(`⚠  Could not find a matching photo for ${missingPhotoProducts.length} product(s): ` +
    missingPhotoProducts.map(p => p.name).join(', '));
}

// ===== HELPERS =====
function readProducts() {
  try {
    return JSON.parse(fs.readFileSync(PRODUCTS_FILE, 'utf8'));
  } catch (e) {
    return DEFAULT_PRODUCTS;
  }
}

function writeProducts(products) {
  fs.writeFileSync(PRODUCTS_FILE, JSON.stringify(products, null, 2));
}

function checkAdminKey(req, res) {
  const key = req.query.key || (req.body && req.body.key);
  if (key !== ADMIN_KEY) {
    res.status(401).json({ message: 'Invalid or missing admin key' });
    return false;
  }
  return true;
}

// ===== USERS (hashed passwords — never stored or sent in plaintext) =====
function readUsers() {
  try { return JSON.parse(fs.readFileSync(USERS_FILE, 'utf8')); }
  catch (e) { return []; }
}

function writeUsers(users) {
  fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// ===== ORDERS (server is the source of truth — the storefront also keeps a =====
// ===== local copy in the browser for offline resilience, but this file is  =====
// ===== what the admin dashboard and a customer's other devices read from. =====
function readOrders() {
  try { return JSON.parse(fs.readFileSync(ORDERS_FILE, 'utf8')); }
  catch (e) { return []; }
}

function writeOrders(orders) {
  fs.writeFileSync(ORDERS_FILE, JSON.stringify(orders, null, 2));
}

// ===== STOCK (server is the source of truth — per-size inventory counts,   =====
// ===== keyed "Product Name::Size" for sized items or just "Product Name"   =====
// ===== for gadgets. Shared by product.html (display), dashboard.html       =====
// ===== (admin editing), and order placement (auto-decrement on purchase).  =====
function readStock() {
  try { return JSON.parse(fs.readFileSync(STOCK_FILE, 'utf8')); }
  catch (e) { return {}; }
}

function writeStock(stock) {
  fs.writeFileSync(STOCK_FILE, JSON.stringify(stock, null, 2));
}

function stockKeyFor(name, size) {
  return size ? `${name}::${size}` : name;
}

function toPublicUser(u) {
  const { passwordHash, ...publicUser } = u;
  return publicUser;
}

const SESSION_COOKIE = 'forza_session';
const COOKIE_OPTS = {
  httpOnly: true,          // not readable from JS — mitigates XSS token theft
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production' || process.env.FORCE_SECURE_COOKIES === 'true',
  maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

function issueSession(res, user) {
  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie(SESSION_COOKIE, token, COOKIE_OPTS);
}

function requireSession(req, res) {
  const token = req.cookies && req.cookies[SESSION_COOKIE];
  if (!token) { res.status(401).json({ message: 'Not signed in' }); return null; }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const users = readUsers();
    const user = users.find(u => u.id === payload.id);
    if (!user) { res.status(401).json({ message: 'Session no longer valid' }); return null; }
    return user;
  } catch (e) {
    res.status(401).json({ message: 'Session expired — please sign in again' });
    return null;
  }
}

// ===== MIDDLEWARE =====
app.use(express.json());
app.use(cookieParser());

// ---- MANDATORY SIGN-IN GATE ----
// Any *.html page (or "/") requires a valid session cookie, except the
// pages needed to actually sign in/register, and the admin dashboard
// (which already has its own separate ADMIN_KEY-based auth).
const PUBLIC_PAGES = new Set(['/login.html', '/register.html']);
app.use((req, res, next) => {
  const isPage = req.path === '/' || req.path.endsWith('.html');
  if (!isPage) return next(); // let CSS/JS/images/API routes through untouched
  if (PUBLIC_PAGES.has(req.path)) return next();
  if (req.path.startsWith('/dashboard')) return next(); // separate admin-key auth

  const token = req.cookies && req.cookies[SESSION_COOKIE];
  if (!token) {
    return res.redirect('/login.html?next=' + encodeURIComponent(req.path));
  }
  try {
    jwt.verify(token, JWT_SECRET);
    return next();
  } catch (e) {
    return res.redirect('/login.html?next=' + encodeURIComponent(req.path));
  }
});

app.use(express.static(__dirname)); // serves dashboard.html, home.html, Images/, etc.

// Root URL should load the storefront home page instead of 404ing
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'home.html'));
});

// ===== IMAGE UPLOAD SETUP =====
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, IMAGES_DIR);
  },
  filename: function (req, file, cb) {
    const safeName = Date.now() + '-' + file.originalname.replace(/[^a-zA-Z0-9.\-]/g, '');
    cb(null, safeName);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: function (req, file, cb) {
    const allowed = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
    cb(null, allowed.includes(file.mimetype));
  }
});

// ===== ROUTES =====

// ---- AUTH ----
app.post('/api/register', async (req, res) => {
  const { fname, lname, email, phone, password, address, city } = req.body || {};
  if (!fname || !lname || !phone || !password) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }
  const emailLc = email ? String(email).trim().toLowerCase() : '';
  const phoneTrim = String(phone).trim();
  const users = readUsers();
  if (emailLc && users.some(u => u.email && u.email.toLowerCase() === emailLc)) {
    return res.status(409).json({ message: 'An account with this email already exists.' });
  }
  if (users.some(u => u.phone === phoneTrim)) {
    return res.status(409).json({ message: 'An account with this phone number already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = {
    id: Date.now(),
    fname, lname,
    email: email || '',
    phone: phoneTrim,
    passwordHash,
    address: address || '',
    city: city || '',
    createdAt: new Date().toISOString()
  };
  users.push(user);
  writeUsers(users);

  issueSession(res, user);
  res.status(201).json({ user: toPublicUser(user) });
});

app.post('/api/login', async (req, res) => {
  // "email" field accepts either an email address or a phone number,
  // since email is now optional at signup and phone is always required.
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: 'Email or phone, and password, are required.' });
  }
  const identifier = String(email).trim().toLowerCase();
  const users = readUsers();
  const user = users.find(u =>
    (u.email && u.email.toLowerCase() === identifier) ||
    (u.phone && u.phone.toLowerCase() === identifier)
  );
  if (!user) return res.status(401).json({ message: 'No account found with that email or phone number.' });

  const match = await bcrypt.compare(password, user.passwordHash);
  if (!match) return res.status(401).json({ message: 'Incorrect password. Please try again.' });

  issueSession(res, user);
  res.json({ user: toPublicUser(user) });
});

app.post('/api/logout', (req, res) => {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax' });
  res.json({ ok: true });
});

app.get('/api/me', (req, res) => {
  const user = requireSession(req, res);
  if (!user) return; // requireSession already sent the response
  res.json({ user: toPublicUser(user) });
});

// GET all products (public — used by the storefront and dashboard)
app.get('/api/products', (req, res) => {
  res.json(readProducts());
});

// PUT (replace) all products — admin only
app.put('/api/products', (req, res) => {
  if (!checkAdminKey(req, res)) return;

  const products = req.body && req.body.products;
  if (!Array.isArray(products)) {
    return res.status(400).json({ message: 'Request body must include a "products" array' });
  }

  writeProducts(products);
  res.json({ saved: 'server', count: products.length });
});

// ---- STOCK ----
// GET current stock levels — public, so the storefront can show accurate
// "In Stock" badges to every visitor, not just the admin's own browser.
app.get('/api/stock', (req, res) => {
  res.json(readStock());
});

// PUT (replace) all stock levels — admin only, used by the Dashboard's
// "Save All Stock" button.
app.put('/api/stock', (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const stock = req.body;
  if (!stock || typeof stock !== 'object' || Array.isArray(stock)) {
    return res.status(400).json({ message: 'Request body must be a stock object.' });
  }
  writeStock(stock);
  res.json({ saved: 'server' });
});

// ---- ORDERS ----
// POST a new order - public (any customer, logged in or guest, can place one).
// The server is authoritative here: it assigns the id/timestamp and starting
// status rather than trusting whatever the browser sends for those fields.
app.post('/api/orders', (req, res) => {
  const b = req.body || {};
  const { fname, lname, email, phone, address, city, postcode, items, deliveryArea } = b;

  if (!fname || !lname || !phone) {
    return res.status(400).json({ message: 'Missing required customer fields.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Order must include at least one item.' });
  }
  if (!deliveryArea || !(deliveryArea in DELIVERY_PRICES)) {
    return res.status(400).json({ message: 'Please select a valid delivery area.' });
  }

  // Cart items look like "Product Name (42)" once a size is picked — split
  // that back into the base product name and size, both to look the real
  // product up in the catalog and to decrement the correct stock entry.
  function splitItemName(fullName) {
    const m = String(fullName || '').match(/^(.*) \(([^)]+)\)$/);
    return m ? { base: m[1], size: m[2] } : { base: String(fullName || ''), size: null };
  }

  // Never trust a price the browser sends — a customer could edit the
  // request (or call this endpoint directly) and claim any price they like.
  // Re-price every line item against the current catalog instead.
  const catalog = readProducts();
  const priceByName = new Map(catalog.map(p => [p.name, p.price]));
  const verifiedItems = items.map(it => {
    const qty = Math.max(0, Number(it.qty) || 0);
    const { base } = splitItemName(it.name);
    const catalogPrice = priceByName.get(base);
    return {
      name: String(it.name || ''),
      qty,
      price: catalogPrice !== undefined ? catalogPrice : 0, // unknown product name -> priced at 0, never trusted from the client
      category: it.category || ''
    };
  });

  const subtotal = verifiedItems.reduce((sum, it) => sum + it.price * it.qty, 0);
  // Shipping is looked up from the server's own price table by delivery
  // area name — never trusted from whatever number the client sent.
  const shipping = DELIVERY_PRICES[deliveryArea];
  const orderNum = (b.orderNum && String(b.orderNum)) || ('FZ' + Date.now().toString().slice(-6));

  const orders = readOrders();
  if (orders.some(o => o.orderNum === orderNum)) {
    return res.status(409).json({ message: 'An order with this number already exists.' });
  }

  // If the customer is signed in (mandatory sign-in gate means most are),
  // record their account id on the order so history.html can find it
  // reliably even for accounts that skipped adding an email.
  let userId = null;
  try {
    const token = req.cookies && req.cookies[SESSION_COOKIE];
    if (token) userId = jwt.verify(token, JWT_SECRET).id;
  } catch (e) { /* not signed in / expired session — order still allowed as guest */ }

  const order = {
    orderNum,
    userId,
    createdAt: new Date().toISOString(),
    fname, lname, email: email || '', phone,
    address: address || '', city: city || '', postcode: postcode || '',
    province: b.province || '',
    deliveryArea,
    items: verifiedItems,
    subtotal,
    shipping,
    total: subtotal + shipping,
    fulfillment: b.fulfillment === 'pickup' ? 'pickup' : 'delivery',
    payment: b.payment || 'cod',
    notes: b.notes || '',
    status: 'Pending approval'
  };

  // Decrement stock server-side now that the order is confirmed real —
  // this is the actual source of truth admins edit via the Dashboard.
  const stock = readStock();
  verifiedItems.forEach(it => {
    const { base, size } = splitItemName(it.name);
    const key = stockKeyFor(base, size);
    const current = stock[key] !== undefined ? stock[key] : 10;
    stock[key] = Math.max(0, current - it.qty);
  });
  writeStock(stock);

  orders.unshift(order);
  writeOrders(orders);
  res.status(201).json({ order });
});

// GET orders placed by the currently signed-in user - used by history.html
// so order history follows the account across devices/browsers.
app.get('/api/orders/mine', (req, res) => {
  const user = requireSession(req, res);
  if (!user) return; // requireSession already sent the response
  const mine = readOrders().filter(o =>
    o.userId === user.id ||
    (user.email && o.email && o.email.toLowerCase() === user.email.toLowerCase())
  );
  res.json({ orders: mine });
});

// GET all orders - admin only, powers the dashboard Orders tab.
app.get('/api/orders', (req, res) => {
  if (!checkAdminKey(req, res)) return;
  res.json({ orders: readOrders() });
});

// PATCH an order's status - admin only.
app.patch('/api/orders/:orderNum', (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const { status } = req.body || {};
  const ALLOWED = ['Pending approval', 'Confirmed', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];
  if (!ALLOWED.includes(status)) {
    return res.status(400).json({ message: 'Invalid status value.' });
  }
  const orders = readOrders();
  const order = orders.find(o => o.orderNum === req.params.orderNum);
  if (!order) return res.status(404).json({ message: 'Order not found.' });
  order.status = status;
  writeOrders(orders);
  res.json({ order });
});

// DELETE a single order - admin only.
app.delete('/api/orders/:orderNum', (req, res) => {
  if (!checkAdminKey(req, res)) return;
  const orders = readOrders();
  const next = orders.filter(o => o.orderNum !== req.params.orderNum);
  if (next.length === orders.length) return res.status(404).json({ message: 'Order not found.' });
  writeOrders(next);
  res.json({ deleted: req.params.orderNum });
});

// DELETE all orders - admin only, used by the dashboard's Clear History button.
app.delete('/api/orders', (req, res) => {
  if (!checkAdminKey(req, res)) return;
  writeOrders([]);
  res.json({ cleared: true });
});

// POST image upload — admin only
app.post('/api/upload-image', upload.single('image'), (req, res) => {
  if (!checkAdminKey(req, res)) return;

  if (!req.file) {
    return res.status(400).json({ message: 'No image file received (or file type not allowed)' });
  }

  const relativePath = 'Images/' + req.file.filename;
  res.json({ img: relativePath });
});

// ===== START SERVER =====
// HTTPS: if you have real cert files, put them at ./certs/key.pem and ./certs/cert.pem
// (e.g. from Let's Encrypt/certbot for a real domain, or a self-signed pair for local
// dev — see generate-dev-cert.sh). If they're not present, we fall back to plain HTTP,
// which is fine for local development but NOT for production.
const CERT_DIR = path.join(__dirname, 'certs');
const KEY_PATH = path.join(CERT_DIR, 'key.pem');
const CERT_PATH = path.join(CERT_DIR, 'cert.pem');

if (fs.existsSync(KEY_PATH) && fs.existsSync(CERT_PATH)) {
  const options = {
    key: fs.readFileSync(KEY_PATH),
    cert: fs.readFileSync(CERT_PATH)
  };
  https.createServer(options, app).listen(HTTPS_PORT, () => {
    console.log(`🔒 Forza Sport server running at https://localhost:${HTTPS_PORT}`);
  });
  // Optional: also listen on plain HTTP and redirect to HTTPS
  express().use((req, res) => {
    res.redirect(`https://${req.hostname}:${HTTPS_PORT}${req.url}`);
  }).listen(PORT, () => {
    console.log(`↪  HTTP requests on :${PORT} will redirect to HTTPS`);
  });
} else {
  app.listen(PORT, () => {
    console.log(`Forza Sport server running at port ${PORT}`);
    console.log('⚠  Running over plain HTTP — no certs/key.pem + certs/cert.pem found.');
    console.log('   For local HTTPS testing, run ./generate-dev-cert.sh then restart.');
    console.log('   For a real deployment, use a real certificate (Let\'s Encrypt via');
    console.log('   certbot is free) — see DEPLOY-NOTES.md for details.');
  });
}