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
const IMAGES_DIR = path.join(__dirname, 'Images');

// ===== ENSURE FOLDERS/FILES EXIST =====
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(IMAGES_DIR)) fs.mkdirSync(IMAGES_DIR, { recursive: true });
if (!fs.existsSync(USERS_FILE)) fs.writeFileSync(USERS_FILE, JSON.stringify([], null, 2));
if (!fs.existsSync(ORDERS_FILE)) fs.writeFileSync(ORDERS_FILE, JSON.stringify([], null, 2));

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
  const token = jwt.sign({ email: user.email }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie(SESSION_COOKIE, token, COOKIE_OPTS);
}

function requireSession(req, res) {
  const token = req.cookies && req.cookies[SESSION_COOKIE];
  if (!token) { res.status(401).json({ message: 'Not signed in' }); return null; }
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const users = readUsers();
    const user = users.find(u => u.email.toLowerCase() === payload.email.toLowerCase());
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
  const { fname, lname, email, phone, password, address, city, postcode, province } = req.body || {};
  if (!fname || !lname || !email || !phone || !password) {
    return res.status(400).json({ message: 'Missing required fields.' });
  }
  if (password.length < 8) {
    return res.status(400).json({ message: 'Password must be at least 8 characters.' });
  }
  const emailLc = String(email).trim().toLowerCase();
  const users = readUsers();
  if (users.some(u => u.email.toLowerCase() === emailLc)) {
    return res.status(409).json({ message: 'An account with this email already exists.' });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const user = {
    id: Date.now(),
    fname, lname,
    email,
    phone,
    passwordHash,
    address: address || '',
    city: city || '',
    postcode: postcode || '',
    province: province || '',
    createdAt: new Date().toISOString()
  };
  users.push(user);
  writeUsers(users);

  issueSession(res, user);
  res.status(201).json({ user: toPublicUser(user) });
});

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body || {};
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }
  const emailLc = String(email).trim().toLowerCase();
  const users = readUsers();
  const user = users.find(u => u.email.toLowerCase() === emailLc);
  if (!user) return res.status(401).json({ message: 'No account found with this email.' });

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

// ---- ORDERS ----
// POST a new order - public (any customer, logged in or guest, can place one).
// The server is authoritative here: it assigns the id/timestamp and starting
// status rather than trusting whatever the browser sends for those fields.
app.post('/api/orders', (req, res) => {
  const b = req.body || {};
  const { fname, lname, email, phone, address, city, postcode, items } = b;

  if (!fname || !lname || !email || !phone) {
    return res.status(400).json({ message: 'Missing required customer fields.' });
  }
  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: 'Order must include at least one item.' });
  }

  // Cart items look like "Product Name (42)" once a size is picked — strip
  // that suffix so we can look the real product up in the catalog.
  function baseItemName(fullName) {
    const m = String(fullName || '').match(/^(.*) \(([^)]+)\)$/);
    return m ? m[1] : String(fullName || '');
  }

  // Never trust a price the browser sends — a customer could edit the
  // request (or call this endpoint directly) and claim any price they like.
  // Re-price every line item against the current catalog instead.
  const catalog = readProducts();
  const priceByName = new Map(catalog.map(p => [p.name, p.price]));
  const verifiedItems = items.map(it => {
    const qty = Math.max(0, Number(it.qty) || 0);
    const catalogPrice = priceByName.get(baseItemName(it.name));
    return {
      name: String(it.name || ''),
      qty,
      price: catalogPrice !== undefined ? catalogPrice : 0, // unknown product name -> priced at 0, never trusted from the client
      category: it.category || ''
    };
  });

  const subtotal = verifiedItems.reduce((sum, it) => sum + it.price * it.qty, 0);
  const shipping = subtotal >= 500 ? 0 : 20;
  const orderNum = (b.orderNum && String(b.orderNum)) || ('FZ' + Date.now().toString().slice(-6));

  const orders = readOrders();
  if (orders.some(o => o.orderNum === orderNum)) {
    return res.status(409).json({ message: 'An order with this number already exists.' });
  }

  const order = {
    orderNum,
    createdAt: new Date().toISOString(),
    fname, lname, email, phone,
    address: address || '', city: city || '', postcode: postcode || '',
    province: b.province || '',
    items: verifiedItems,
    subtotal,
    shipping,
    total: subtotal + shipping,
    fulfillment: b.fulfillment === 'pickup' ? 'pickup' : 'delivery',
    payment: b.payment || 'cod',
    notes: b.notes || '',
    status: 'Pending approval'
  };

  orders.unshift(order);
  writeOrders(orders);
  res.status(201).json({ order });
});

// GET orders placed by the currently signed-in user - used by history.html
// so order history follows the account across devices/browsers.
app.get('/api/orders/mine', (req, res) => {
  const user = requireSession(req, res);
  if (!user) return; // requireSession already sent the response
  const mine = readOrders().filter(o => o.email.toLowerCase() === user.email.toLowerCase());
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