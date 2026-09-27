/**
 * AquaPets - Express + SQLite Backend
 * Run: node server.js
 * API Base: /api
 */

const express = require("express");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { body, param, query, validationResult } = require('express-validator');
const Database = require("libsql");
const path = require("path");
const fs = require('fs');
const multer = require('multer');
const crypto = require('crypto');
const cookieParser = require('cookie-parser');

// Load environment variables from .env when present
require('dotenv').config();

const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

const app = express();
const PORT = parseInt(process.env.PORT || '5000', 10);
const isProduction = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (isProduction ? '' : crypto.randomBytes(64).toString('hex'));
const JWT_EXPIRES = process.env.JWT_EXPIRES || '15m';
const corsOrigin = process.env.CORS_ORIGIN || '*';
const trustProxy = parseInt(process.env.TRUST_PROXY || '0', 10);

if (isProduction) {
  if (!/^[a-f0-9]{128}$/i.test(JWT_SECRET)) {
    throw new Error('JWT_SECRET must be a 64-byte random hex value (128 hexadecimal characters) in production.');
  }
  if (!process.env.CORS_ORIGIN || corsOrigin === '*') {
    throw new Error('CORS_ORIGIN must be set to the deployed frontend origin in production.');
  }
  if (!process.env.ADMIN_PASSWORD) {
    throw new Error('ADMIN_PASSWORD must be configured in production.');
  }
}

// ── Security / Production-ready defaults ───────────────────────────────────
app.disable('x-powered-by');
if (trustProxy > 0) app.set('trust proxy', trustProxy);
app.use(helmet());
// Content Security Policy: restrict resources to self and allow images from uploads and data URIs
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'blob:'],
    connectSrc: ["'self'", process.env.CORS_ORIGIN || '*'],
    objectSrc: ["'none'"],
    ...(isProduction ? { upgradeInsecureRequests: [] } : {})
  }
}));

// CORS: allow explicit origin via env in production
app.use(cors({ origin: corsOrigin === '*' ? true : corsOrigin, credentials: true }));

// Limit request body size to avoid large payload abuse
app.use(express.json({ limit: '10kb' }));

// Parse cookies for refresh token handling
app.use(cookieParser());

// Request logging
app.use(morgan(process.env.MORGAN_FORMAT || 'combined'));

// General rate limiter (sensible defaults)
// Skip admin endpoints here so we can apply a separate admin limiter with
// tailored limits and JSON error handling for the dashboard.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => req.path && req.path.startsWith('/api/admin'),
  handler: (req, res) => res.status(429).json({ success: false, message: 'Too many requests' })
});
app.use(generalLimiter);

// Narrower limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX || '15', 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ success: false, message: 'Too many requests' })
});

// --- Simple request validation helpers ---
function requireFields(fields) {
  return (req, res, next) => {
    const body = req.body || {};
    for (const f of fields) {
      if (typeof f === 'string') {
        if (body[f] === undefined || body[f] === null || body[f] === '') return res.status(400).json({ error: `${f} is required.` });
      } else if (typeof f === 'object') {
        const { name, type } = f;
        if (body[name] === undefined || body[name] === null || body[name] === '') return res.status(400).json({ error: `${name} is required.` });
        if (type) {
          if (type === 'email') {
            const re = /^[^@\s]+@[^@\s]+\.[^@\s]+$/; if (!re.test(body[name])) return res.status(400).json({ error: 'Invalid email address.' });
          } else if (type === 'number') {
            if (Number.isNaN(Number(body[name]))) return res.status(400).json({ error: `${name} must be a number.` });
          }
        }
      }
    }
    next();
  };
}

// express-validator result handler
function handleValidation(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array().map(e => e.msg).join('; ') });
  }
  next();
}

// Handle malformed JSON body errors from body-parser
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') {
    console.warn('Malformed JSON body received:', err.message);
    return res.status(400).json({ error: 'Invalid JSON payload.' });
  }
  next(err);
});

// Prevent process from exiting on uncaught exceptions/rejections during dev
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception:', err && err.stack ? err.stack : err);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection:', reason);
});

// ── Database Setup ──────────────────────────────────────────────────────────
const DB_PATH = process.env.DB_PATH || path.join(__dirname, "aquapets.db");
const TURSO_DATABASE_URL = process.env.TURSO_DATABASE_URL;
const TURSO_AUTH_TOKEN = process.env.TURSO_AUTH_TOKEN;

const db = TURSO_DATABASE_URL
  ? new Database(TURSO_DATABASE_URL, { authToken: TURSO_AUTH_TOKEN })
  : new Database(DB_PATH);
// Enable WAL mode for better performance
if (!TURSO_DATABASE_URL) db.pragma("journal_mode = WAL");
if (!TURSO_DATABASE_URL) db.pragma("foreign_keys = ON");

// Create tables
if (!TURSO_DATABASE_URL) db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name      TEXT    NOT NULL,
    email     TEXT    NOT NULL UNIQUE,
    phone     TEXT,
    password  TEXT    NOT NULL,
    avatar    TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    category    TEXT    NOT NULL,
    price       REAL    NOT NULL,
    rating      REAL    DEFAULT 0,
    stock       INTEGER DEFAULT 0,
    emoji       TEXT,
    description TEXT,
    tag         TEXT,
    image_gallery TEXT DEFAULT '[]',
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cart_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    qty        INTEGER NOT NULL DEFAULT 1,
    UNIQUE(user_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id),
    total       REAL    NOT NULL,
    status      TEXT    DEFAULT 'Confirmed',
    method      TEXT,
    address     TEXT,
    city        TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    cancelled_at DATETIME,
    cancellation_reason TEXT
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id   INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER NOT NULL REFERENCES products(id),
    name       TEXT,
    emoji      TEXT,
    price      REAL,
    qty        INTEGER
  );

  CREATE TABLE IF NOT EXISTS addresses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    label      TEXT    DEFAULT 'Home',
    address    TEXT    NOT NULL,
    city       TEXT,
    pin        TEXT,
    phone      TEXT,
    is_default INTEGER DEFAULT 0
  );

  CREATE TABLE IF NOT EXISTS notifications (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type       TEXT,
    message    TEXT,
    is_read    INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wishlist (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, product_id)
  );

  CREATE TABLE IF NOT EXISTS contact_messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT    NOT NULL,
    email       TEXT    NOT NULL,
    phone       TEXT,
    message     TEXT    NOT NULL,
    is_replied  INTEGER DEFAULT 0,
    reply       TEXT,
    created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

// Refresh tokens table for issuing long-lived refresh tokens (rotation supported)
if (!TURSO_DATABASE_URL) db.exec(`
  CREATE TABLE IF NOT EXISTS refresh_tokens (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at INTEGER NOT NULL,
    revoked INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

if (!TURSO_DATABASE_URL) db.exec(`
  CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
  CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);
  CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
  CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at);
  CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
  CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);
  CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);
  CREATE INDEX IF NOT EXISTS idx_order_items_product_id ON order_items(product_id);
  CREATE INDEX IF NOT EXISTS idx_cart_items_user_id ON cart_items(user_id);
  CREATE INDEX IF NOT EXISTS idx_wishlist_user_id ON wishlist(user_id);
  CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, is_read);
  CREATE INDEX IF NOT EXISTS idx_contact_messages_email ON contact_messages(email);
  CREATE INDEX IF NOT EXISTS idx_contact_messages_created_at ON contact_messages(created_at);
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);
  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
`);

// ── Ensure image columns exist for products ───────────────────────────────
try {
  const pcols = db.prepare("PRAGMA table_info(products)").all();
  if (!pcols.find(c => c.name === 'image_path')) {
    db.prepare("ALTER TABLE products ADD COLUMN image_path TEXT").run();
    console.log("✅ Added 'image_path' column to products table.");
  }
  if (!pcols.find(c => c.name === 'image_gallery')) {
    db.prepare("ALTER TABLE products ADD COLUMN image_gallery TEXT DEFAULT '[]'").run();
    console.log("✅ Added 'image_gallery' column to products table.");
  }
} catch (e) {
  console.warn("Image path migration skipped or failed:", e.message);
}

// ── Uploads directory & static serving ───────────────────────────────────
const UPLOAD_DIR = process.env.UPLOAD_DIR || 'uploads';
const UPLOAD_MAX_SIZE = parseInt(process.env.UPLOAD_MAX_SIZE || '2097152', 10);
const uploadPath = path.isAbsolute(UPLOAD_DIR)
  ? UPLOAD_DIR
  : path.join(__dirname, UPLOAD_DIR);
try { if (!fs.existsSync(uploadPath)) fs.mkdirSync(uploadPath, { recursive: true }); } catch (e) { console.warn('Failed to create upload directory:', e.message); }
app.use('/uploads', express.static(uploadPath, {
  setHeaders: (res) => {
    res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  }
}));

// ── Multer configuration ─────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadPath),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const name = `${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`;
    cb(null, name);
  }
});
const allowedMimes = ['image/jpeg','image/png','image/webp'];
const allowedExts = ['.jpg', '.jpeg', '.png', '.webp'];
const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    if (!allowedMimes.includes(file.mimetype) || !allowedExts.includes(ext)) return cb(new Error('Only JPG, PNG and WEBP images are allowed.'));
    cb(null, true);
  },
  limits: { fileSize: UPLOAD_MAX_SIZE }
});

// ── Migrate / Ensure role column ───────────────────────────────────────────
try {
  const cols = db.prepare("PRAGMA table_info(users)").all();
  if (!cols.find(c => c.name === 'role')) {
    db.prepare("ALTER TABLE users ADD COLUMN role TEXT DEFAULT 'customer'").run();
    db.prepare("UPDATE users SET role = 'customer' WHERE role IS NULL").run();
    console.log("✅ Added 'role' column to users table and set default 'customer'.");
  }
} catch (e) {
  console.warn("Role migration skipped or failed:", e.message);
}

// ── Ensure 'disabled' column exists for user management ───────────────────
try {
  const cols2 = db.prepare("PRAGMA table_info(users)").all();
  if (!cols2.find(c => c.name === 'disabled')) {
    db.prepare("ALTER TABLE users ADD COLUMN disabled INTEGER DEFAULT 0").run();
    db.prepare("UPDATE users SET disabled = 0 WHERE disabled IS NULL").run();
    console.log("✅ Added 'disabled' column to users table and set default 0.");
  }
} catch (e) {
  console.warn("Disabled migration skipped or failed:", e.message);
}

// ── Ensure 'cancelled_at' and 'cancellation_reason' columns exist for orders ─
try {
  const orderCols = db.prepare("PRAGMA table_info(orders)").all();
  if (!orderCols.find(c => c.name === 'cancelled_at')) {
    db.prepare("ALTER TABLE orders ADD COLUMN cancelled_at DATETIME").run();
    console.log("✅ Added 'cancelled_at' column to orders table.");
  }
  if (!orderCols.find(c => c.name === 'cancellation_reason')) {
    db.prepare("ALTER TABLE orders ADD COLUMN cancellation_reason TEXT").run();
    console.log("✅ Added 'cancellation_reason' column to orders table.");
  }
} catch (e) {
  console.warn("Order cancellation columns migration skipped or failed:", e.message);
}

// ── Seed Products ───────────────────────────────────────────────────────────
const productCount = db.prepare("SELECT COUNT(*) as cnt FROM products").get();

// Validate phone number format
function isValidPhone(phone) {
  // Remove spaces, dashes, parentheses
  const cleaned = phone.replace(/[\s\-\(\)]/g, '');
  // Should start with + or digit, and be 10-15 digits
  const phoneRegex = /^(\+?\d{1,3})?[\d]{10,14}$/;
  return phoneRegex.test(cleaned);
}

// Normalize phone number for storage
function normalizePhone(phone) {
  // Remove all non-digit characters except leading +
  let normalized = phone.replace(/[\s\-\(\)]/g, '');
  // Ensure it starts with + for international format
  if (!normalized.startsWith('+')) {
    // Assume Indian number if no country code
    normalized = '+91' + normalized;
  }
  return normalized;
}

if (productCount.cnt === 0) {
  const insert = db.prepare(
    "INSERT INTO products (name, category, price, rating, stock, emoji, description, tag) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
  );
  const seedProducts = db.transaction((products) => {
    for (const p of products) insert.run(...p);
  });
  seedProducts([
    ["Betta Splendens",      "fish",     349,   4.8, 12,  "🐠", "Vibrant red & blue crowntail betta. Hardy & beautiful.", "Bestseller"],
    ["Neon Tetra (x6)",     "fish",     199,   4.6, 40,  "🐟", "Schooling fish with electric blue-red stripe.", null],
    ["Goldfish Fancy",       "fish",     249,   4.5, 20,  "🐡", "Fancy oranda goldfish with wen growth.", null],
    ["Clownfish",            "fish",     599,   4.9,  8,  "🐠", "Marine clownfish, bold orange & white stripes.", "Premium"],
    ["Nano Cube 20L",        "tank",    2499,   4.7, 15,  "🪣", "Compact 20-litre all-in-one cube with LED & filter.", null],
    ["Classic Bow 60L",      "tank",    4999,   4.8,  7,  "🐋", "Curved-front tank with built-in filtration system.", "Bestseller"],
    ["Marine Reef 120L",     "tank",   11999,   4.9,  3,  "🌊", "Full reef setup with skimmer & LED coral spectrum.", "Premium"],
    ["Planted 45L Kit",      "tank",    3799,   4.6, 10,  "🌿", "CO₂-ready planted tank with substrate & lights.", null],
    ["Hikari Micro Pellets", "fishfood", 299,   4.9,100,  "🫙", "High-protein micro pellets for tropical fish.", "Bestseller"],
    ["Tetra Color Flakes",   "fishfood", 199,   4.5, 80,  "🧂", "Color-enhancing flake food for community fish.", null],
    ["Frozen Bloodworms",    "fishfood", 149,   4.7, 50,  "🧊", "Premium frozen bloodworms, 100g blister pack.", null],
    ["Holland Lop Rabbit",   "pets",    2999,   4.9,  4,  "🐇", "Floppy-eared Holland Lop, very friendly & docile.", "Premium"],
    ["Guinea Pig",           "pets",    1499,   4.7,  6,  "🐹", "Social & playful guinea pig, great for families.", null],
    ["Hamster (Syrian)",     "pets",     799,   4.6, 10,  "🐭", "Golden Syrian hamster, active and curious.", null],
    ["Royal Canin Small",    "petfood",  899,   4.8, 60,  "🍖", "Balanced diet kibble for small breed dogs.", "Bestseller"],
    ["Whiskas Wet Cat",      "petfood",  249,   4.6, 90,  "🐈", "Tender tuna chunks in gravy, 12-pack.", null],
    ["Rabbit Pellets 1kg",   "petfood",  349,   4.7, 40,  "🥕", "Timothy hay-based pellets, vitamin enriched.", null],
    ["Java Fern Plant",      "aquarium", 179,   4.7, 35,  "🌱", "Hardy low-light aquatic plant, attaches to driftwood.", null],
    ["Dragon Stone Set",     "aquarium", 499,   4.8, 20,  "🪨", "Natural volcanic dragon stones, 3-piece set.", null],
    ["Aquarium Pump 300L/h", "aquarium", 699,   4.6, 25,  "⚙️", "Submersible motor pump, ultra-quiet operation.", null],
    ["LED Reef Light",       "aquarium",1999,   4.9,  8,  "💡", "Full spectrum LED with timer & dimmer.", "Premium"],
    ["Canister Filter 500L", "aquarium",3499,   4.8,  5,  "🔧", "External canister filter with 3-stage media.", "Bestseller"],
  ]);
  console.log("✅ Products seeded.");
}

// ── Ensure admin user exists (configurable via env) ─────────────────────────
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@aquapets.local';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Site Admin';

try {
  const admin = db.prepare("SELECT * FROM users WHERE email = ?").get(ADMIN_EMAIL);
  (async () => {
    if (!admin) {
      const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
      const avatar = ADMIN_NAME.slice(0,2).toUpperCase();
      db.prepare("INSERT INTO users (name, email, phone, password, avatar, role) VALUES (?, ?, ?, ?, ?, 'admin')").run(ADMIN_NAME, ADMIN_EMAIL, '', hashed, avatar);
      console.log(`✅ Admin user created: ${ADMIN_EMAIL} (username: ${ADMIN_USERNAME})`);
    } else {
      // ensure role is admin
      if ((admin.role || 'customer') !== 'admin') db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(admin.id);
    }
  })();
} catch (e) {
  console.warn('Admin user bootstrap failed:', e.message);
}

// ── Auth Middleware ─────────────────────────────────────────────────────────
function authMiddleware(req, res, next) {
  const token = req.cookies && req.cookies.accessToken;
  if (!token) return res.status(401).json({ error: "Unauthorized. Please log in." });
  try {
    req.user = jwt.verify(token, JWT_SECRET, { algorithms: ['HS256'] });
    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token. Please log in again." });
  }
}

// ── Admin Middleware ───────────────────────────────────────────────────────
function adminMiddleware(req, res, next) {
  if (!req.user) return res.status(401).json({ error: "Unauthorized. Please log in." });
  if ((req.user.role || 'customer') !== 'admin') return res.status(403).json({ error: "Forbidden. Admins only." });
  next();
}

// Admin-specific rate limiter: higher limits for dashboard operations
const adminLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: parseInt(process.env.ADMIN_RATE_LIMIT_MAX || '1000', 10),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => res.status(429).json({ success: false, message: 'Too many requests' })
});

// Apply admin limiter to all admin routes
app.use('/api/admin', adminLimiter);

// ── ROUTES ──────────────────────────────────────────────────────────────────

// Health check
app.get("/api/health", (req, res) => res.json({ status: "ok", message: "AquaPets API running 🐠" }));

function normalizeProductImagePath(imagePath) {
  if (!imagePath) return null;
  let normalized = String(imagePath).trim().replace(/\\/g, '/');
  normalized = normalized.replace(/^https?:\/\/[^/]+\//i, '').replace(/^\/+/, '');

  const uploadsMarker = '/uploads/';
  const markerIndex = normalized.indexOf(uploadsMarker);
  if (markerIndex >= 0) normalized = normalized.slice(markerIndex + 1);

  if (normalized.startsWith('uploads/')) return normalized;
  if (normalized.startsWith(`${UPLOAD_DIR}/`)) {
    return `uploads/${normalized.slice(UPLOAD_DIR.length + 1)}`;
  }

  return `uploads/${path.basename(normalized)}`;
}

function productImageFilePath(imagePath) {
  const normalized = normalizeProductImagePath(imagePath);
  return normalized ? path.join(uploadPath, path.basename(normalized)) : null;
}

function normalizeProductGallery(value) {
  if (!value) return [];
  const parsed = Array.isArray(value) ? value : (() => { try { return JSON.parse(value); } catch { return []; } })();
  if (!Array.isArray(parsed)) return [];
  const list = [];
  for (const item of parsed) {
    if (!item) continue;
    const s = typeof item === 'string' ? item.trim() : String(item).trim();
    if (!s) continue;
    const normalized = normalizeProductImagePath(s);
    if (normalized) list.push(`/${normalized}`);
  }
  return list;
}

// Helper: attach browser-loadable image URL to a product object (if image_path present)
function attachImageUrlToProduct(product, req) {
  if (!product) return product;
  const p = { ...product };
  const gallery = normalizeProductGallery(p.image_gallery);
  const direct = p.image_path ? normalizeProductImagePath(p.image_path) : null;

  if (direct) {
    p.image_path = direct;
    p.image_url = `/${direct}`;
  }

  if (gallery.length) {
    p.gallery = gallery;
  } else if (direct) {
    p.gallery = [`/${direct}`];
  }

  if (!p.gallery && direct) {
    p.gallery = [`/${direct}`];
  }

  return p;
}

// --- Refresh token helpers ---
function generateRefreshToken() {
  return crypto.randomBytes(48).toString('hex');
}

function saveRefreshToken(token, userId, ttlMs) {
  const expiresAt = Date.now() + ttlMs;
  try {
    db.prepare('INSERT INTO refresh_tokens (token, user_id, expires_at) VALUES (?, ?, ?)').run(token, userId, expiresAt);
    return true;
  } catch (e) { console.warn('Failed to save refresh token:', e.message); return false; }
}

function revokeRefreshToken(token) {
  try { db.prepare('UPDATE refresh_tokens SET revoked = 1 WHERE token = ?').run(token); } catch (e) { /* ignore */ }
}

function clearRefreshCookie(res) {
  res.cookie('refreshToken', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 0 });
}

function setRefreshCookie(res, token, ttlMs) {
  const opts = { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: ttlMs };
  res.cookie('refreshToken', token, opts);
}

function getAccessCookieMaxAge() {
  const match = String(JWT_EXPIRES).match(/^(\d+)([smhd])$/);
  if (!match) return 15 * 60 * 1000;
  const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return Number(match[1]) * multipliers[match[2]];
}

function clearAccessCookie(res) {
  res.cookie('accessToken', '', { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 0 });
}

function setAccessCookie(res, token) {
  res.cookie('accessToken', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: getAccessCookieMaxAge()
  });
}

// ── AUTH ────────────────────────────────────────────────────────────────────
app.post("/api/auth/signup", authLimiter,
  [
    body('name').trim().notEmpty().withMessage('Name is required.'),
    body('email').trim().isEmail().withMessage('Valid email is required.'),
    body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 chars.')
      .matches(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9])/).withMessage('Password must include upper, lower, number and special char.'),
  ], handleValidation, async (req, res) => {
  const { name, email, phone, password } = req.body;

  // Stronger password policy: min 8, upper, lower, digit, special
  const pwdRule = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  if (!pwdRule.test(password)) return res.status(400).json({ error: "Password must be at least 8 characters and include uppercase, lowercase, number and special character." });

  const existing = db.prepare("SELECT id FROM users WHERE email = ?").get(email);
  if (existing) return res.status(409).json({ error: "Email already registered. Please log in." });

  const hashed = await bcrypt.hash(password, 10);
  const avatar = name.slice(0, 2).toUpperCase();
  const result = db.prepare("INSERT INTO users (name, email, phone, password, avatar) VALUES (?, ?, ?, ?, ?)").run(name, email, phone || "", hashed, avatar);
  const user = { id: result.lastInsertRowid, name, email, phone: phone || "", avatar };
  const token = jwt.sign({ ...user, role: 'customer' }, JWT_SECRET, { expiresIn: JWT_EXPIRES, algorithm: 'HS256' });
  setAccessCookie(res, token);
  // create refresh token (httpOnly cookie)
  try {
    const refreshDays = parseInt(process.env.REFRESH_EXPIRES_DAYS || '30', 10);
    const ttlMs = refreshDays * 24 * 3600 * 1000;
    const rtoken = generateRefreshToken();
    saveRefreshToken(rtoken, user.id, ttlMs);
    setRefreshCookie(res, rtoken, ttlMs);
  } catch (e) { /* non-fatal */ }
  res.status(201).json({ user });
});

app.post("/api/auth/login", authLimiter,
  [ body('email').trim().notEmpty().withMessage('Email or username is required.'), body('password').notEmpty().withMessage('Password is required.') ], handleValidation,
  async (req, res) => {
  const { email: identifier, password } = req.body;

  const isAdminLogin = identifier === ADMIN_USERNAME;
  const user = db.prepare("SELECT * FROM users WHERE email = ?").get(isAdminLogin ? ADMIN_EMAIL : identifier);
  if (!user) return res.status(404).json({ error: "No account found. Please sign up." });

  if (user.disabled === 1) return res.status(403).json({ error: "Account disabled. Contact support." });

  const match = isAdminLogin
    ? password === ADMIN_PASSWORD
    : await bcrypt.compare(password, user.password);
  if (!match) return res.status(401).json({ error: "Incorrect password." });

  const payload = { id: user.id, name: user.name, email: user.email, phone: user.phone, avatar: user.avatar, role: isAdminLogin ? 'admin' : (user.role || 'customer') };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES, algorithm: 'HS256' });
  setAccessCookie(res, token);
  try {
    const refreshDays = parseInt(process.env.REFRESH_EXPIRES_DAYS || '30', 10);
    const ttlMs = refreshDays * 24 * 3600 * 1000;
    const rtoken = generateRefreshToken();
    saveRefreshToken(rtoken, user.id, ttlMs);
    setRefreshCookie(res, rtoken, ttlMs);
  } catch (e) { /* ignore */ }
  res.json({ user: payload });
});

// Admin login (uses configured ADMIN_USERNAME / ADMIN_PASSWORD)
app.post('/api/auth/admin-login', authLimiter, async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: 'Username and password required.' });
  if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) return res.status(401).json({ error: 'Invalid admin credentials.' });
  // find admin user in DB by admin email
  let user = db.prepare('SELECT * FROM users WHERE email = ?').get(ADMIN_EMAIL);
  if (!user) return res.status(500).json({ error: 'Admin account not found.' });
  const payload = { id: user.id, name: user.name, email: user.email, phone: user.phone, avatar: user.avatar, role: 'admin' };
  const token = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES, algorithm: 'HS256' });
  setAccessCookie(res, token);
  try {
    const refreshDays = parseInt(process.env.REFRESH_EXPIRES_DAYS || '30', 10);
    const ttlMs = refreshDays * 24 * 3600 * 1000;
    const rtoken = generateRefreshToken();
    saveRefreshToken(rtoken, user.id, ttlMs);
    setRefreshCookie(res, rtoken, ttlMs);
  } catch (e) { /* ignore */ }
  res.json({ user: payload });
});

// Refresh access token using httpOnly refresh token cookie
app.post('/api/auth/refresh', async (req, res) => {
  const token = req.cookies && req.cookies.refreshToken ? req.cookies.refreshToken : (req.body && req.body.refreshToken);
  if (!token) return res.status(401).json({ error: 'No refresh token provided.' });
  try {
    const row = db.prepare('SELECT * FROM refresh_tokens WHERE token = ?').get(token);
    if (!row || row.revoked === 1 || Number(row.expires_at) < Date.now()) {
      clearRefreshCookie(res);
      return res.status(401).json({ error: 'Invalid or expired refresh token.' });
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(row.user_id);
    if (!user) { clearRefreshCookie(res); return res.status(401).json({ error: 'User not found.' }); }
    const payload = { id: user.id, name: user.name, email: user.email, phone: user.phone, avatar: user.avatar, role: user.role || 'customer' };
    const accessToken = jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES, algorithm: 'HS256' });
    setAccessCookie(res, accessToken);

    // rotate refresh token: revoke old, create new
    try {
      revokeRefreshToken(token);
      const refreshDays = parseInt(process.env.REFRESH_EXPIRES_DAYS || '30', 10);
      const ttlMs = refreshDays * 24 * 3600 * 1000;
      const newToken = generateRefreshToken();
      saveRefreshToken(newToken, user.id, ttlMs);
      setRefreshCookie(res, newToken, ttlMs);
    } catch (e) { /* ignore */ }

    res.json({ user: payload });
  } catch (e) {
    clearRefreshCookie(res);
    return res.status(500).json({ error: 'Failed to refresh token.' });
  }
});

// Logout: revoke refresh token cookie and remove mapping
app.post('/api/auth/logout', authMiddleware, (req, res) => {
  const token = req.cookies && req.cookies.refreshToken ? req.cookies.refreshToken : (req.body && req.body.refreshToken);
  if (token) revokeRefreshToken(token);
  clearAccessCookie(res);
  clearRefreshCookie(res);
  res.json({ message: 'Logged out.' });
});

// ── ADMIN ROUTES ──────────────────────────────────────────────────────────
// List users (admin only)
app.get("/api/admin/users", authMiddleware, adminMiddleware, (req, res) => {
  const users = db.prepare("SELECT id, name, email, phone, avatar, role, created_at FROM users ORDER BY id ASC").all();
  res.json(users);
});

// Create product (admin only)
app.post("/api/admin/products", authMiddleware, adminMiddleware,
  [ body('name').trim().notEmpty().withMessage('Name is required.'), body('category').trim().notEmpty().withMessage('Category is required.'), body('price').isFloat({ min: 0 }).withMessage('Price must be a positive number.') ], handleValidation,
  (req, res) => {
  const { name, category, price, rating = 0, stock = 0, emoji = '', description = '', tag = null, gallery } = req.body;
  const priceNum = Number(price);
  const ratingNum = Number(rating || 0);
  const stockNum = Number(stock || 0);
  if (Number.isNaN(priceNum) || priceNum < 0) return res.status(400).json({ error: 'Invalid price.' });
  let imageGallery = '[]';
  if (gallery) {
    try {
      const list = Array.isArray(gallery) ? gallery : JSON.parse(String(gallery));
      imageGallery = JSON.stringify(Array.isArray(list) ? list.filter(Boolean).map(String) : []);
    } catch (e) {
      imageGallery = '[]';
    }
  }
  const stmt = db.prepare("INSERT INTO products (name, category, price, rating, stock, emoji, description, tag, image_gallery) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
  const result = stmt.run(name, category, priceNum, ratingNum, stockNum, emoji || '', description || '', tag || null, imageGallery);
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(result.lastInsertRowid);
  res.status(201).json(attachImageUrlToProduct(product, req));
});

// ── Upload / Replace product image(s) (admin only)
app.post('/api/admin/products/:id/image', authMiddleware, adminMiddleware, (req, res, next) => {
  const handler = upload.fields([
    { name: 'images', maxCount: 10 },
    { name: 'image', maxCount: 10 }
  ]);
  handler(req, res, async function (err) {
    if (err) return res.status(400).json({ error: err.message || 'Invalid upload.' });
    const id = Number(req.params.id);
    const uploadedFiles = req.files ? Object.values(req.files).flat() : [];
    if (Number.isNaN(id)) {
      if (uploadedFiles.length) uploadedFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
      return res.status(400).json({ error: 'Invalid product id.' });
    }
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
    if (!product) {
      if (uploadedFiles.length) uploadedFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
      return res.status(404).json({ error: 'Product not found.' });
    }
    try {
      const uploaded = uploadedFiles.map(file => `uploads/${file.filename}`);
      const previousGallery = normalizeProductGallery(product.image_gallery);
      if (previousGallery.length) {
        previousGallery.forEach(file => {
          try {
            const prev = productImageFilePath(file);
            if (prev && fs.existsSync(prev)) fs.unlinkSync(prev);
          } catch (e) { /* ignore */ }
        });
      }
      if (product.image_path) {
        try { const prev = productImageFilePath(product.image_path); if (prev && fs.existsSync(prev)) fs.unlinkSync(prev); } catch(e) { /* ignore */ }
      }
      const nextGallery = JSON.stringify(uploaded);
      db.prepare('UPDATE products SET image_path = ?, image_gallery = ? WHERE id = ?').run(uploaded[0] || null, nextGallery, id);
      const updated = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
      res.json(attachImageUrlToProduct(updated, req));
    } catch (e) {
      if (uploadedFiles.length) uploadedFiles.forEach(f => { try { fs.unlinkSync(f.path); } catch (e) {} });
      next(e);
    }
  });
});

// ── Delete product image (admin only)
app.delete('/api/admin/products/:id/image', authMiddleware, adminMiddleware, (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid product id.' });
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  if (product.image_path) {
    try { const p = productImageFilePath(product.image_path); if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch (e) { /* ignore */ }
    db.prepare('UPDATE products SET image_path = NULL WHERE id = ?').run(id);
  }
  res.json({ message: 'Image removed.' });
});

// Update product (admin only)
app.put("/api/admin/products/:id", authMiddleware, adminMiddleware, (req, res) => {
  const id = req.params.id;
  const fields = ['name','category','price','rating','stock','emoji','description','tag'];
  const updates = [];
  const params = [];
  for (const f of fields) {
    if (req.body[f] === undefined) continue;
    let val = req.body[f];
    if (['price','rating','stock'].includes(f)) {
      val = Number(val);
      if (Number.isNaN(val)) return res.status(400).json({ error: `Invalid value for ${f}` });
    }
    updates.push(`${f} = ?`);
    params.push(val);
  }
  if (updates.length === 0) return res.status(400).json({ error: 'No fields to update.' });
  params.push(id);
  const sql = `UPDATE products SET ${updates.join(', ')} WHERE id = ?`;
  db.prepare(sql).run(...params);
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id);
  res.json(attachImageUrlToProduct(product, req));
});

// Delete product (admin only)
app.delete("/api/admin/products/:id", authMiddleware, adminMiddleware, (req, res) => {
  const id = req.params.id;
  db.prepare("DELETE FROM products WHERE id = ?").run(id);
  res.json({ message: 'Product deleted.' });
});

// ── USER PROFILE ────────────────────────────────────────────────────────────
app.get("/api/user/profile", authMiddleware, (req, res) => {
  const user = db.prepare("SELECT id, name, email, phone, avatar, role, disabled, created_at FROM users WHERE id = ?").get(req.user.id);
  if (!user) return res.status(404).json({ error: "User not found." });
  res.json(user);
});

// ── ADMIN: Orders & Management ───────────────────────────────────────────
app.get("/api/admin/orders", authMiddleware, adminMiddleware, (req, res) => {
  const orders = db.prepare("SELECT o.*, u.name as user_name, u.email as user_email FROM orders o JOIN users u ON o.user_id = u.id ORDER BY o.created_at DESC").all();
  const result = orders.map(o => ({
    ...o,
    id: `AQ${o.id}`,
    items: db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(o.id),
  }));
  res.json(result);
});

app.get("/api/admin/orders/:id", authMiddleware, adminMiddleware, (req, res) => {
  const id = req.params.id.replace(/^AQ/, "") || req.params.id;
  const order = db.prepare("SELECT o.*, u.name as user_name, u.email as user_email FROM orders o JOIN users u ON o.user_id = u.id WHERE o.id = ?").get(id);
  if (!order) return res.status(404).json({ error: "Order not found." });
  order.items = db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id);
  order.id = `AQ${order.id}`;
  res.json(order);
});

app.put("/api/admin/orders/:id/status", authMiddleware, adminMiddleware, (req, res) => {
  const id = req.params.id.replace(/^AQ/, "") || req.params.id;
  const { status } = req.body;
  const allowed = ['Pending','Processing','Shipped','Delivered','Cancelled','Confirmed'];
  if (!allowed.includes(status)) return res.status(400).json({ error: 'Invalid status.' });
  const updateOrder = db.transaction(() => {
    const order = db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
    if (!order) return null;

    if (status === 'Cancelled' && order.status !== 'Cancelled') {
      db.prepare("UPDATE orders SET status = 'Cancelled', cancelled_at = CURRENT_TIMESTAMP WHERE id = ? AND status != 'Cancelled'").run(id);
      const items = db.prepare('SELECT product_id, qty FROM order_items WHERE order_id = ?').all(id);
      for (const item of items) {
        db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.qty, item.product_id);
      }
    } else if (order.status !== 'Cancelled') {
      db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
    }

    return db.prepare("SELECT * FROM orders WHERE id = ?").get(id);
  });
  const order = updateOrder();
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  // create a notification for the user about status change
  try {
    if (order && order.user_id) {
      db.prepare("INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)").run(order.user_id, 'order_update', `Your order #AQ${order.id} status updated to ${status}`);
    }
  } catch (e) { console.warn('Failed to create notification for order status change:', e.message); }
  res.json(order);
});

// User management
app.put("/api/admin/users/:id/disable", authMiddleware, adminMiddleware, (req, res) => {
  const id = req.params.id;
  db.prepare("UPDATE users SET disabled = 1 WHERE id = ?").run(id);
  res.json({ message: 'User disabled.' });
});
app.put("/api/admin/users/:id/enable", authMiddleware, adminMiddleware, (req, res) => {
  const id = req.params.id;
  db.prepare("UPDATE users SET disabled = 0 WHERE id = ?").run(id);
  res.json({ message: 'User enabled.' });
});
app.delete("/api/admin/users/:id", authMiddleware, adminMiddleware, (req, res) => {
  const id = req.params.id;
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
  res.json({ message: 'User deleted.' });

});

// Admin overview & analytics
app.get("/api/admin/overview", authMiddleware, adminMiddleware, (req, res) => {
  const totalUsers = db.prepare("SELECT COUNT(*) as cnt FROM users").get().cnt;
  const totalOrders = db.prepare("SELECT COUNT(*) as cnt FROM orders").get().cnt;
  const totalRevenue = db.prepare("SELECT IFNULL(SUM(total),0) as rev FROM orders").get().rev;
  const totalProducts = db.prepare("SELECT COUNT(*) as cnt FROM products").get().cnt;
  const pendingOrders = db.prepare("SELECT COUNT(*) as cnt FROM orders WHERE status IN ('Pending','Confirmed')").get().cnt;
  res.json({ totalUsers, totalOrders, totalRevenue, totalProducts, pendingOrders });
});

function formatDate(date) {
  return date.toISOString().slice(0, 10);
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function buildDateRange(range) {
  const today = new Date();
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

  if (range === 'all') {
    const first = db.prepare(`
      SELECT MIN(day) as day FROM (
        SELECT date(created_at) as day FROM users
        UNION ALL
        SELECT date(created_at) as day FROM orders
      )
    `).get();
    const start = first && first.day ? new Date(`${first.day}T00:00:00.000Z`) : end;
    const days = [];
    for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) days.push(formatDate(cursor));
    return days;
  }

  const daysBack = range === '7d' ? 6 : 29;
  const start = addDays(end, -daysBack);
  const days = [];
  for (let cursor = start; cursor <= end; cursor = addDays(cursor, 1)) days.push(formatDate(cursor));
  return days;
}

app.get("/api/admin/analytics/dashboard", authMiddleware, adminMiddleware, (req, res) => {
  const range = ['7d', '30d', 'all'].includes(req.query.range) ? req.query.range : '7d';
  const days = buildDateRange(range);
  const startDay = days[0];
  const endDay = days[days.length - 1];

  const totals = {
    totalUsers: db.prepare("SELECT COUNT(*) as cnt FROM users").get().cnt,
    totalProducts: db.prepare("SELECT COUNT(*) as cnt FROM products").get().cnt,
    totalOrders: db.prepare("SELECT COUNT(*) as cnt FROM orders").get().cnt,
    totalRevenue: db.prepare("SELECT IFNULL(SUM(total),0) as total FROM orders").get().total,
  };

  const revenueRows = db.prepare(`
    SELECT date(created_at) as day, IFNULL(SUM(total), 0) as revenue
    FROM orders
    WHERE date(created_at) BETWEEN ? AND ?
    GROUP BY date(created_at)
  `).all(startDay, endDay);

  const orderRows = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as orders
    FROM orders
    WHERE date(created_at) BETWEEN ? AND ?
    GROUP BY date(created_at)
  `).all(startDay, endDay);

  const userRows = db.prepare(`
    SELECT date(created_at) as day, COUNT(*) as users
    FROM users
    WHERE date(created_at) BETWEEN ? AND ?
    GROUP BY date(created_at)
  `).all(startDay, endDay);

  const usersBeforeRange = db.prepare("SELECT COUNT(*) as cnt FROM users WHERE date(created_at) < ?").get(startDay).cnt;
  const revenueByDay = new Map(revenueRows.map(row => [row.day, Number(row.revenue || 0)]));
  const ordersByDay = new Map(orderRows.map(row => [row.day, Number(row.orders || 0)]));
  const usersByDay = new Map(userRows.map(row => [row.day, Number(row.users || 0)]));
  let cumulativeUsers = usersBeforeRange;

  const timeline = days.map(day => {
    cumulativeUsers += usersByDay.get(day) || 0;
    return {
      date: day,
      label: range === 'all' ? day : day.slice(5),
      revenue: revenueByDay.get(day) || 0,
      orders: ordersByDay.get(day) || 0,
      users: cumulativeUsers,
    };
  });

  res.json({
    range,
    totals,
    revenue: timeline.map(({ date, label, revenue }) => ({ date, label, revenue })),
    orders: timeline.map(({ date, label, orders }) => ({ date, label, orders })),
    users: timeline.map(({ date, label, users }) => ({ date, label, users })),
  });
});

app.get("/api/admin/analytics/daily-sales", authMiddleware, adminMiddleware, (req, res) => {
  const days = parseInt(req.query.days || '30', 10);
  const rows = db.prepare(`SELECT date(created_at) as day, IFNULL(SUM(total),0) as total FROM orders GROUP BY date(created_at) ORDER BY day DESC LIMIT ?`).all(days);
  res.json(rows.reverse());
});

app.get("/api/admin/analytics/monthly-sales", authMiddleware, adminMiddleware, (req, res) => {
  const months = parseInt(req.query.months || '12', 10);
  const rows = db.prepare(`SELECT strftime('%Y-%m', created_at) as month, IFNULL(SUM(total),0) as total FROM orders GROUP BY month ORDER BY month DESC LIMIT ?`).all(months);
  res.json(rows.reverse());
});

app.get("/api/admin/analytics/top-products", authMiddleware, adminMiddleware, (req, res) => {
  const limit = parseInt(req.query.limit || '10', 10);
  const rows = db.prepare(`SELECT p.id, p.name, p.emoji, SUM(oi.qty) as qty, SUM(oi.qty * oi.price) as revenue FROM order_items oi JOIN products p ON oi.product_id = p.id GROUP BY oi.product_id ORDER BY qty DESC LIMIT ?`).all(limit);
  res.json(rows);
});

app.get("/api/admin/analytics/revenue-stats", authMiddleware, adminMiddleware, (req, res) => {
  const totalRevenue = db.prepare("SELECT IFNULL(SUM(total),0) as rev FROM orders").get().rev;
  const totalOrders = db.prepare("SELECT COUNT(*) as cnt FROM orders").get().cnt;
  const avgOrder = totalOrders === 0 ? 0 : totalRevenue / totalOrders;
  res.json({ totalRevenue, totalOrders, avgOrder });
});

app.put("/api/user/profile", authMiddleware, (req, res) => {
  const { name, phone } = req.body;
  db.prepare("UPDATE users SET name = ?, phone = ? WHERE id = ?").run(name, phone, req.user.id);
  res.json({ message: "Profile updated successfully." });
});

app.put("/api/user/password", authMiddleware, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const user = db.prepare("SELECT * FROM users WHERE id = ?").get(req.user.id);
  const match = await bcrypt.compare(currentPassword, user.password);
  if (!match) return res.status(401).json({ error: "Current password is incorrect." });
  const pwdRule = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  if (!pwdRule.test(newPassword)) return res.status(400).json({ error: "New password must be at least 8 characters and include uppercase, lowercase, number and special character." });
  const hashed = await bcrypt.hash(newPassword, 10);
  db.prepare("UPDATE users SET password = ? WHERE id = ?").run(hashed, req.user.id);
  res.json({ message: "Password updated successfully." });
});

// ── PRODUCTS ────────────────────────────────────────────────────────────────
app.get("/api/products", (req, res) => {
  const { category, search } = req.query;
  let query = "SELECT * FROM products WHERE 1=1";
  const params = [];
  if (category && category !== "all") { query += " AND category = ?"; params.push(category); }
  if (search) { query += " AND (name LIKE ? OR description LIKE ?)"; params.push(`%${search}%`, `%${search}%`); }
  query += " ORDER BY id ASC";
  const rows = db.prepare(query).all(...params);
  res.json(rows.map(r => attachImageUrlToProduct(r, req)));
});

app.get("/api/products/best-sellers", (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, COUNT(oi.product_id) AS sales_count
    FROM products p
    LEFT JOIN order_items oi ON oi.product_id = p.id
    GROUP BY p.id
    ORDER BY sales_count DESC, p.id ASC
    LIMIT 8
  `).all();
  res.json(rows.map(r => attachImageUrlToProduct(r, req)));
});

app.get("/api/products/:id", (req, res) => {
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(req.params.id);
  if (!product) return res.status(404).json({ error: "Product not found." });
  res.json(attachImageUrlToProduct(product, req));
});

// ── CART ─────────────────────────────────────────────────────────────────────
app.get("/api/cart", authMiddleware, (req, res) => {
  const items = db.prepare(`
    SELECT c.id, c.qty, p.id as product_id, p.name, p.price, p.emoji, p.category, p.stock
    FROM cart_items c JOIN products p ON c.product_id = p.id
    WHERE c.user_id = ?
  `).all(req.user.id);
  res.json(items);
});

app.post("/api/cart", authMiddleware, (req, res) => {
  const { productId, qty = 1 } = req.body;
  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
  if (!product) return res.status(404).json({ error: "Product not found." });
  db.prepare("INSERT INTO cart_items (user_id, product_id, qty) VALUES (?, ?, ?) ON CONFLICT(user_id, product_id) DO UPDATE SET qty = qty + ?").run(req.user.id, productId, qty, qty);
  res.json({ message: "Added to cart." });
});

app.put("/api/cart/:productId", authMiddleware, (req, res) => {
  const { qty } = req.body;
  if (qty < 1) {
    db.prepare("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?").run(req.user.id, req.params.productId);
  } else {
    db.prepare("UPDATE cart_items SET qty = ? WHERE user_id = ? AND product_id = ?").run(qty, req.user.id, req.params.productId);
  }
  res.json({ message: "Cart updated." });
});

app.delete("/api/cart/:productId", authMiddleware, (req, res) => {
  db.prepare("DELETE FROM cart_items WHERE user_id = ? AND product_id = ?").run(req.user.id, req.params.productId);
  res.json({ message: "Item removed." });
});

app.delete("/api/cart", authMiddleware, (req, res) => {
  db.prepare("DELETE FROM cart_items WHERE user_id = ?").run(req.user.id);
  res.json({ message: "Cart cleared." });
});

// ── WISHLIST ──────────────────────────────────────────────────────────────
app.get('/api/wishlist', authMiddleware, (req, res) => {
  const rows = db.prepare(`SELECT p.* FROM wishlist w JOIN products p ON w.product_id = p.id WHERE w.user_id = ? ORDER BY w.created_at DESC`).all(req.user.id);
  res.json(rows.map(r => attachImageUrlToProduct(r, req)));
});

app.post('/api/wishlist', authMiddleware, (req, res) => {
  const { productId } = req.body;
  if (!productId) return res.status(400).json({ error: 'productId required' });
  const product = db.prepare('SELECT * FROM products WHERE id = ?').get(productId);
  if (!product) return res.status(404).json({ error: 'Product not found.' });
  try {
    db.prepare('INSERT OR IGNORE INTO wishlist (user_id, product_id) VALUES (?, ?)').run(req.user.id, productId);
    res.json({ message: 'Added to wishlist.' });
  } catch (e) { res.status(500).json({ error: 'Failed to add to wishlist.' }); }
});

app.delete('/api/wishlist/:productId', authMiddleware, (req, res) => {
  const pid = req.params.productId;
  db.prepare('DELETE FROM wishlist WHERE user_id = ? AND product_id = ?').run(req.user.id, pid);
  res.json({ message: 'Removed from wishlist.' });
});

// ── ORDERS ───────────────────────────────────────────────────────────────────
app.post("/api/orders", authMiddleware, [ body('items').isArray({ min: 1 }).withMessage('Items array is required.'), body('method').trim().notEmpty().withMessage('Payment method is required.'), body('address').trim().notEmpty().withMessage('Address is required.') ], handleValidation, (req, res) => {
  const { items, method, address } = req.body;
  if (!items || !Array.isArray(items) || !items.length) return res.status(400).json({ error: "Cart is empty." });

  for (const it of items) {
    if (!it || !Number.isInteger(Number(it.id)) || Number(it.id) < 1 || !Number.isInteger(Number(it.qty)) || Number(it.qty) < 1) return res.status(400).json({ error: 'Invalid item in order.' });
  }

  const placeOrder = db.transaction(() => {
    const productsById = new Map();
    let total = 0;
    for (const item of items) {
      const productId = Number(item.id);
      const quantity = Number(item.qty);
      const product = db.prepare("SELECT id, name, emoji, price, stock FROM products WHERE id = ?").get(productId);
      if (!product) throw new Error('INVALID_PRODUCT');
      if (product.stock < quantity) throw new Error('INSUFFICIENT_STOCK');
      productsById.set(productId, { product, quantity });
      total += product.price * quantity;
    }

    const order = db.prepare("INSERT INTO orders (user_id, total, method, address) VALUES (?, ?, ?, ?)").run(req.user.id, total, method, address);
    const insertItem = db.prepare("INSERT INTO order_items (order_id, product_id, name, emoji, price, qty) VALUES (?, ?, ?, ?, ?, ?)");
    for (const item of items) {
      const { product, quantity } = productsById.get(Number(item.id));
      insertItem.run(order.lastInsertRowid, product.id, product.name, product.emoji, product.price, quantity);
      const stockUpdate = db.prepare("UPDATE products SET stock = stock - ? WHERE id = ? AND stock >= ?").run(quantity, product.id, quantity);
      if (stockUpdate.changes !== 1) throw new Error('INSUFFICIENT_STOCK');
    }
    db.prepare("DELETE FROM cart_items WHERE user_id = ?").run(req.user.id);
    // Create notification
    db.prepare("INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)").run(req.user.id, "order", `Your order #AQ${order.lastInsertRowid} has been confirmed! 🎉`);
    return order.lastInsertRowid;
  });

  try {
    const orderId = placeOrder();
    res.status(201).json({ orderId: `AQ${orderId}`, message: "Order placed successfully!" });
  } catch (error) {
    if (error.message === 'INVALID_PRODUCT') return res.status(400).json({ error: 'One or more products are invalid.' });
    if (error.message === 'INSUFFICIENT_STOCK') return res.status(400).json({ error: 'One or more products do not have enough stock.' });
    throw error;
  }
});

app.get("/api/orders", authMiddleware, (req, res) => {
  const orders = db.prepare("SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC").all(req.user.id);
  const result = orders.map(order => ({
    ...order,
    id: `AQ${order.id}`,
    items: db.prepare("SELECT * FROM order_items WHERE order_id = ?").all(order.id),
  }));
  res.json(result);
});

// Customer: get single order details (including items and timeline) if it belongs to them
app.get('/api/orders/:id', authMiddleware, (req, res) => {
  const id = req.params.id.replace(/^AQ/, '') || req.params.id;
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  if (order.user_id !== req.user.id) return res.status(403).json({ error: 'Forbidden.' });
  order.items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(order.id);
  order.id = `AQ${order.id}`;
  res.json(order);
});

// Customer: cancel order (only for Pending/Processing status)
app.patch('/api/orders/:id/cancel', authMiddleware,
  [ body('reason').trim().notEmpty().withMessage('Cancellation reason is required.') ], handleValidation,
  (req, res) => {
  const id = req.params.id.replace(/^AQ/, '') || req.params.id;
  const { reason } = req.body;
  
  // Fetch the order
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  if (!order) return res.status(404).json({ error: 'Order not found.' });
  
  // Verify ownership
  if (order.user_id !== req.user.id) return res.status(403).json({ error: 'You can only cancel your own orders.' });
  
  // Check if order status allows cancellation
  const cancellableStatuses = ['Pending', 'Processing', 'Confirmed'];
  if (!cancellableStatuses.includes(order.status)) {
    return res.status(400).json({ 
      error: `Cannot cancel order with status "${order.status}". Only orders with status Pending, Processing, or Confirmed can be cancelled.` 
    });
  }
  
  // Update order status to Cancelled
  const cancelTransaction = db.transaction(() => {
    const result = db.prepare("UPDATE orders SET status = 'Cancelled', cancelled_at = CURRENT_TIMESTAMP, cancellation_reason = ? WHERE id = ? AND user_id = ? AND status IN ('Pending', 'Processing', 'Confirmed')")
      .run(reason, id, req.user.id);
    if (result.changes !== 1) throw new Error('ORDER_NOT_CANCELLABLE');
    
    // Restore product stock
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ?').all(id);
    for (const item of items) {
      db.prepare('UPDATE products SET stock = stock + ? WHERE id = ?').run(item.qty, item.product_id);
    }
    
    // Create notification
    db.prepare("INSERT INTO notifications (user_id, type, message) VALUES (?, ?, ?)")
      .run(order.user_id, 'order_cancelled', `Your order #AQ${id} has been cancelled.`);
  });
  
  try {
    cancelTransaction();
  } catch (error) {
    if (error.message === 'ORDER_NOT_CANCELLABLE') {
      const currentOrder = db.prepare('SELECT status FROM orders WHERE id = ?').get(id);
      return res.status(400).json({ error: `Cannot cancel order with status "${currentOrder?.status || 'unknown'}".` });
    }
    throw error;
  }
  
  const updatedOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(id);
  updatedOrder.id = `AQ${updatedOrder.id}`;
  res.json({ 
    message: 'Order cancelled successfully.',
    order: updatedOrder 
  });
});

// ── ADDRESSES ────────────────────────────────────────────────────────────────
app.get("/api/addresses", authMiddleware, (req, res) => {
  res.json(db.prepare("SELECT * FROM addresses WHERE user_id = ?").all(req.user.id));
});

app.post("/api/addresses", authMiddleware, (req, res) => {
  const { label, address, city, pin, phone, is_default } = req.body;
  if (!address) return res.status(400).json({ error: 'Address is required.' });
  if (is_default) db.prepare("UPDATE addresses SET is_default = 0 WHERE user_id = ?").run(req.user.id);
  const result = db.prepare("INSERT INTO addresses (user_id, label, address, city, pin, phone, is_default) VALUES (?, ?, ?, ?, ?, ?, ?)").run(req.user.id, label || "Home", address, city || '', pin || '', phone || '', is_default ? 1 : 0);
  res.status(201).json({ id: result.lastInsertRowid, message: "Address saved." });
});

app.delete("/api/addresses/:id", authMiddleware, (req, res) => {
  db.prepare("DELETE FROM addresses WHERE id = ? AND user_id = ?").run(req.params.id, req.user.id);
  res.json({ message: "Address deleted." });
});

// ── NOTIFICATIONS ─────────────────────────────────────────────────────────────
app.get("/api/notifications", authMiddleware, (req, res) => {
  res.json(db.prepare("SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 20").all(req.user.id));
});

app.put("/api/notifications/read", authMiddleware, (req, res) => {
  db.prepare("UPDATE notifications SET is_read = 1 WHERE user_id = ?").run(req.user.id);
  res.json({ message: "All notifications marked as read." });
});

// ── CONTACT (public) ───────────────────────────────────────────────────────
app.post('/api/contact', [ body('name').trim().notEmpty().withMessage('Name is required.'), body('email').trim().isEmail().withMessage('Valid email is required.'), body('message').trim().notEmpty().withMessage('Message is required.') ], handleValidation, (req, res) => {
  const { name, email, phone, message } = req.body;
  const stmt = db.prepare('INSERT INTO contact_messages (name, email, phone, message) VALUES (?, ?, ?, ?)');
  const result = stmt.run(name, email, phone || '', message);
  res.status(201).json({ id: result.lastInsertRowid, message: 'Message received. We will get back to you soon.' });
});

// Customers: list their own contact messages and replies (requires auth)
app.get('/api/contact', authMiddleware, (req, res) => {
  const email = req.user.email;
  const msgs = db.prepare('SELECT id, name, email, phone, message, is_replied, reply, created_at FROM contact_messages WHERE email = ? ORDER BY created_at DESC').all(email);
  res.json(msgs);
});

// Customers: view a single message (must belong to requester)
app.get('/api/contact/:id', authMiddleware, (req, res) => {
  const id = req.params.id;
  const msg = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(id);
  if (!msg) return res.status(404).json({ error: 'Message not found.' });
  if (msg.email !== req.user.email) return res.status(403).json({ error: 'Forbidden.' });
  res.json(msg);
});

// ── ADMIN: Contact management ──────────────────────────────────────────────
app.get('/api/admin/contacts', authMiddleware, adminMiddleware, (req, res) => {
  const msgs = db.prepare('SELECT id, name, email, phone, is_replied, created_at FROM contact_messages ORDER BY created_at DESC').all();
  res.json(msgs);
});

app.get('/api/admin/contacts/:id', authMiddleware, adminMiddleware, (req, res) => {
  const id = req.params.id;
  const msg = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(id);
  if (!msg) return res.status(404).json({ error: 'Message not found.' });
  res.json(msg);
});

app.put('/api/admin/contacts/:id/reply', authMiddleware, adminMiddleware, (req, res) => {
  const id = req.params.id;
  const { reply } = req.body;
  db.prepare('UPDATE contact_messages SET is_replied = 1, reply = ? WHERE id = ?').run(reply || '', id);
  const msg = db.prepare('SELECT * FROM contact_messages WHERE id = ?').get(id);
  res.json(msg);
});

app.delete('/api/admin/contacts/:id', authMiddleware, adminMiddleware, (req, res) => {
  const id = req.params.id;
  db.prepare('DELETE FROM contact_messages WHERE id = ?').run(id);
  res.json({ message: 'Message deleted.' });
});

// ── Start Server ─────────────────────────────────────────────────────────────
// Centralized error handler (must be after routes)
app.use((err, req, res, next) => {
  console.error(err && err.stack ? err.stack : err);
  const status = err && err.status ? err.status : 500;
  const isProd = process.env.NODE_ENV === 'production';
  const message = isProd ? 'Internal Server Error' : (err && err.message ? err.message : 'Internal Server Error');
  res.status(status).json({ error: message });
});

app.listen(PORT, () => {
  const serverOrigin = isProduction ? 'https://aquapets.com' : `http://localhost:${PORT}`;
  console.log(`\n🐠 AquaPets API running at ${serverOrigin}`);
  console.log(`📋 Health check at ${serverOrigin}/api/health\n`);
});
