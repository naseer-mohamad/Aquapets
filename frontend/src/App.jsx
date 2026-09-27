import { Component, useState, useEffect, useRef } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// ─── Local storage helpers (keeps non-auth data like cart/orders)
const DB = {
  get: (key) => { try { return JSON.parse(localStorage.getItem(key)) || null; } catch { return null; } },
  set: (key, val) => localStorage.setItem(key, JSON.stringify(val)),
  // Users list is kept only as a convenience cache for non-sensitive fields (no passwords)
  getUsers: () => DB.get("aq_users") || [],
  saveUser: (user) => {
    // store a safe copy without sensitive fields
    const safe = { name: user.name, email: user.email, phone: user.phone || "", avatar: user.avatar || (user.name ? user.name.slice(0,2).toUpperCase() : ""), role: user.role || 'customer', createdAt: user.createdAt || new Date().toISOString() };
    const users = DB.getUsers(); const idx = users.findIndex(u => u.email === safe.email);
    if (idx >= 0) users[idx] = { ...users[idx], ...safe }; else users.push(safe);
    DB.set("aq_users", users);
  },
  findUser: (email) => DB.getUsers().find(u => u.email === email) || null,
  getCart: (email) => DB.get(`aq_cart_${email}`) || [],
  saveCart: (email, cart) => DB.set(`aq_cart_${email}`, cart),
  getOrders: (email) => DB.get(`aq_orders_${email}`) || [],
  saveOrder: (email, order) => { const orders = DB.getOrders(email); orders.push(order); DB.set(`aq_orders_${email}`, orders); },
};

const API_BASE_URL = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');
const apiUrl = (path) => `${API_BASE_URL}${path}`;
const apiFetch = (path, options = {}) => fetch(apiUrl(path), { ...options, credentials: 'include' });

// ─── Product Catalog ───────────────────────────────────────────────────────
const PRODUCTS = [
  // Fish
  { id: 1, name: "Betta Splendens", category: "fish", price: 349, rating: 4.8, stock: 12, emoji: "🐠", desc: "Vibrant red & blue crowntail betta. Hardy & beautiful.", tag: "Bestseller" },
  { id: 2, name: "Neon Tetra (x6)", category: "fish", price: 199, rating: 4.6, stock: 40, emoji: "🐟", desc: "Schooling fish with electric blue-red stripe.", tag: null },
  { id: 3, name: "Goldfish Fancy", category: "fish", price: 249, rating: 4.5, stock: 20, emoji: "🐡", desc: "Fancy oranda goldfish with wen growth.", tag: null },
  { id: 4, name: "Clownfish", category: "fish", price: 599, rating: 4.9, stock: 8, emoji: "🐠", desc: "Marine clownfish, bold orange & white stripes.", tag: "Premium" },
  // Fish Tanks
  { id: 5, name: "Nano Cube 20L", category: "tank", price: 2499, rating: 4.7, stock: 15, emoji: "🪣", desc: "Compact 20-litre all-in-one cube with LED & filter.", tag: null },
  { id: 6, name: "Classic Bow 60L", category: "tank", price: 4999, rating: 4.8, stock: 7, emoji: "🐋", desc: "Curved-front tank with built-in filtration system.", tag: "Bestseller" },
  { id: 7, name: "Marine Reef 120L", category: "tank", price: 11999, rating: 4.9, stock: 3, emoji: "🌊", desc: "Full reef setup with skimmer & LED coral spectrum.", tag: "Premium" },
  { id: 8, name: "Planted 45L Kit", category: "tank", price: 3799, rating: 4.6, stock: 10, emoji: "🌿", desc: "CO₂-ready planted tank with substrate & lights.", tag: null },
  // Fish Food
  { id: 9, name: "Hikari Micro Pellets", category: "fishfood", price: 299, rating: 4.9, stock: 100, emoji: "🫙", desc: "High-protein micro pellets for tropical fish.", tag: "Bestseller" },
  { id: 10, name: "Tetra Color Flakes", category: "fishfood", price: 199, rating: 4.5, stock: 80, emoji: "🧂", desc: "Color-enhancing flake food for community fish.", tag: null },
  { id: 11, name: "Frozen Bloodworms", category: "fishfood", price: 149, rating: 4.7, stock: 50, emoji: "🧊", desc: "Premium frozen bloodworms, 100g blister pack.", tag: null },
  // Pets
  { id: 12, name: "Holland Lop Rabbit", category: "pets", price: 2999, rating: 4.9, stock: 4, emoji: "🐇", desc: "Floppy-eared Holland Lop, very friendly & docile.", tag: "Premium" },
  { id: 13, name: "Guinea Pig", category: "pets", price: 1499, rating: 4.7, stock: 6, emoji: "🐹", desc: "Social & playful guinea pig, great for families.", tag: null },
  { id: 14, name: "Hamster (Syrian)", category: "pets", price: 799, rating: 4.6, stock: 10, emoji: "🐭", desc: "Golden Syrian hamster, active and curious.", tag: null },
  // Pet Food
  { id: 15, name: "Royal Canin Small", category: "petfood", price: 899, rating: 4.8, stock: 60, emoji: "🍖", desc: "Balanced diet kibble for small breed dogs.", tag: "Bestseller" },
  { id: 16, name: "Whiskas Wet Cat", category: "petfood", price: 249, rating: 4.6, stock: 90, emoji: "🐈", desc: "Tender tuna chunks in gravy, 12-pack.", tag: null },
  { id: 17, name: "Rabbit Pellets 1kg", category: "petfood", price: 349, rating: 4.7, stock: 40, emoji: "🥕", desc: "Timothy hay-based pellets, vitamin enriched.", tag: null },
  // Aquarium Products
  { id: 18, name: "Java Fern Plant", category: "aquarium", price: 179, rating: 4.7, stock: 35, emoji: "🌱", desc: "Hardy low-light aquatic plant, attaches to driftwood.", tag: null },
  { id: 19, name: "Dragon Stone Set", category: "aquarium", price: 499, rating: 4.8, stock: 20, emoji: "🪨", desc: "Natural volcanic dragon stones, 3-piece set.", tag: null },
  { id: 20, name: "Aquarium Pump 300L/h", category: "aquarium", price: 699, rating: 4.6, stock: 25, emoji: "⚙️", desc: "Submersible motor pump, ultra-quiet operation.", tag: null },
  { id: 21, name: "LED Reef Light", category: "aquarium", price: 1999, rating: 4.9, stock: 8, emoji: "💡", desc: "Full spectrum LED with timer & dimmer.", tag: "Premium" },
  { id: 22, name: "Canister Filter 500L", category: "aquarium", price: 3499, rating: 4.8, stock: 5, emoji: "🔧", desc: "External canister filter with 3-stage media.", tag: "Bestseller" },
];

const CATEGORIES = [
  { id: "all", label: "All Products", icon: "✨" },
  { id: "fish", label: "Fish", icon: "🐠" },
  { id: "tank", label: "Fish Tanks", icon: "🌊" },
  { id: "fishfood", label: "Fish Food", icon: "🫙" },
  { id: "pets", label: "Pets", icon: "🐇" },
  { id: "petfood", label: "Pet Food", icon: "🍖" },
  { id: "aquarium", label: "Aquarium Products", icon: "🌿" },
];
function getProductGallery(product) {
  const gallery = [];
  const pushUnique = (value) => {
    if (!value) return;
    const item = String(value).trim().replace(/\\/g, "/");
    if (!item) return;
    const normalized = /^https?:\/\//i.test(item) ? item : (item.startsWith("/") ? item : `/${item.replace(/^\/+/, "")}`);
    if (!gallery.includes(normalized)) gallery.push(normalized);
  };

  const rawGallery = Array.isArray(product?.gallery) ? product.gallery : (Array.isArray(product?.images) ? product.images : []);
  if (rawGallery.length) rawGallery.forEach(pushUnique);

  const direct = product?.image_url || product?.image_path || product?.image;
  if (direct) pushUnique(direct);

  if (!gallery.length && product?.emoji) return [];
  return gallery;
}

function getProductImageSrc(product, index = 0) {
  const gallery = getProductGallery(product);
  const raw = gallery[index] || gallery[0] || (product?.image_url || product?.image_path || product?.image || "");
  if (!raw) return "";
  const value = String(raw).trim().replace(/\\/g, "/");
  if (!value) return "";

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const currentOrigin = typeof window !== 'undefined' ? window.location.origin : '';
      if (!currentOrigin || url.origin === currentOrigin) {
        return `${url.pathname}${url.search}`;
      }
      return value;
    } catch {
      return value;
    }
  }

  return value.startsWith("/") ? value : `/${value.replace(/^\/+/, "")}`;
}

function ProductImage({ product, style, fallbackSize = 28, index = 0 }) {
  const src = getProductImageSrc(product, index);
  if (!src) return <div style={{ fontSize: fallbackSize }}>{product?.emoji}</div>;
  return <img src={src} alt={product?.name || "Product"} style={style} />;
}

// Advanced search/filter/sort utilities
function advancedSearch(products, options = {}) {
  const { query, category, priceMin, priceMax, availability, sort } = options;
  const q = (query || "").trim().toLowerCase();

  let results = products.filter(p => {
    if (category === 'best-sellers') {
      return true;
    }
    // Category filter (if provided and not 'all')
    if (category && category !== 'all' && p.category !== category) return false;

    // Availability filter
    if (typeof availability === 'boolean') {
      if (availability && !(p.stock > 0)) return false;
      if (!availability && p.stock > 0) return false; // if explicitly false, means show out-of-stock only
    }

    // Price range
    if (typeof priceMin === 'number' && p.price < priceMin) return false;
    if (typeof priceMax === 'number' && p.price > priceMax) return false;

    // Search query across name, category, description
    if (!q) return true;
    const name = (p.name || "").toString().toLowerCase();
    const cat = (p.category || "").toString().toLowerCase();
    const desc = (p.desc || p.description || "").toString().toLowerCase();
    // split into terms and require all terms to appear in any field
    const terms = q.split(/\s+/).filter(Boolean);
    return terms.every(t => name.includes(t) || cat.includes(t) || desc.includes(t));
  });

  // Sorting
  if (sort === 'price-asc') results.sort((a, b) => a.price - b.price);
  else if (sort === 'price-desc') results.sort((a, b) => b.price - a.price);
  else if (sort === 'newest') results.sort((a, b) => (b.id || 0) - (a.id || 0));
  else if (sort === 'best-selling') {
    // no sales data on frontend; use rating as a proxy for popularity
    results.sort((a, b) => (b.rating || 0) - (a.rating || 0));
  }

  return results;
}

// ─── Theme ─────────────────────────────────────────────────────────────────
const theme = {
  primary: "#4A2C20",
  primaryDark: "#2B1D18",
  primaryLight: "#6B4636",
  accent: "#D5A441",
  accentLight: "#F4E5C5",
  bg: "#F3EDE4",
  bgCard: "#FFFBF5",
  bgNav: "#2B1D18",
  text: "#2D211C",
  textMuted: "#715F55",
  textLight: "#FFFBF5",
  border: "#D9CBBB",
  success: "#3F6B4F",
  error: "#9B3E32",
  warning: "#B87924",
};

const css = `
  @import url('https://fonts.googleapis.com/css2?family=Raleway:wght@400;500;600;700;800&family=Nunito:wght@400;500;600;700&display=swap');
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Nunito', sans-serif; background: ${theme.bg}; color: ${theme.text}; }
  h1,h2,h3,h4 { font-family: 'Raleway', sans-serif; }
  
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 18px; border-radius: 6px; font-family: 'Nunito', sans-serif; font-weight: 700; font-size: 14px; cursor: pointer; border: 1px solid ${theme.primaryLight}; background: ${theme.primaryLight}; color: #fff; transition: all 0.15s; box-shadow: 0 2px 5px rgba(74,44,32,0.12); }
  .btn-primary { background: ${theme.primaryLight}; color: #fff; border-color: ${theme.primaryLight}; box-shadow: 0 2px 5px rgba(74,44,32,0.16); }
  .btn-primary:hover { background: ${theme.primaryDark}; border-color: ${theme.primaryDark}; box-shadow: 0 2px 6px rgba(74,44,32,0.22); }
  .btn-outline { background: ${theme.primaryLight}; color: #fff; border: 1px solid ${theme.primaryLight}; box-shadow: 0 2px 5px rgba(74,44,32,0.1); }
  .btn-outline:hover { background: ${theme.primaryDark}; border-color: ${theme.primaryDark}; }
  .btn-danger { background: ${theme.primaryLight}; color: #fff; border-color: ${theme.primaryLight}; }
  .btn-danger:hover { background: ${theme.primaryDark}; }
  .btn-sm { padding: 6px 14px; font-size: 13px; }
  .btn-icon { padding: 8px; border-radius: 6px; background: ${theme.primaryLight}; border: 1px solid ${theme.primaryLight}; color: #fff; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; transition: all 0.15s; }
  .btn-icon:hover { background: ${theme.primaryDark}; border-color: ${theme.primaryDark}; }
  
  .input { width: 100%; padding: 10px 12px; border-radius: 4px; border: 1px solid #BDAE9E; font-family: 'Nunito', sans-serif; font-size: 14px; color: ${theme.text}; background: ${theme.bgCard}; transition: border 0.15s, box-shadow 0.15s; outline: none; }
  .input:focus { border-color: ${theme.accent}; box-shadow: 0 0 0 3px rgba(213,164,65,0.25); }
  textarea.input { font-family: 'Nunito', sans-serif; }
  .input-group { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
  .input-group label { font-size: 13px; font-weight: 600; color: ${theme.textMuted}; text-transform: uppercase; letter-spacing: 0.5px; }
  
  .card { background: ${theme.bgCard}; border-radius: 8px; border: 1px solid ${theme.border}; overflow: hidden; transition: box-shadow 0.15s; }
  .card:hover { box-shadow: 0 8px 20px rgba(74,44,32,0.14); }
  
  .badge { display: inline-block; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; }
  .badge-primary { background: ${theme.accentLight}; color: ${theme.primaryDark}; }
  .badge-premium { background: #F2DEC0; color: #7A4A1E; }
  .badge-success { background: #DCE9DD; color: ${theme.success}; }
  
  .alert { padding: 12px 16px; border-radius: 10px; font-size: 14px; font-weight: 500; margin-bottom: 14px; }
  .alert-error { background: #F7E2DE; color: ${theme.error}; border: 1px solid #E4BDB6; }
  .alert-success { background: #DCE9DD; color: ${theme.success}; border: 1px solid #B9D1BC; }

  .nav { position: sticky; top: 0; z-index: 100; background: ${theme.bgNav}; color: #fff; box-shadow: 0 1px 2px rgba(0,0,0,0.25); }
  .nav-main { height: 60px; padding: 0 18px; display: flex; align-items: center; gap: 14px; }
  .nav-left { display: flex; align-items: center; gap: 12px; flex-shrink: 0; }
  .nav-brand { font-family: Arial, 'Nunito', sans-serif; font-weight: 800; font-size: 27px; line-height: 1; color: #fff; display: flex; align-items: flex-end; gap: 2px; cursor: pointer; flex-shrink: 0; padding: 8px 6px; border: 1px solid transparent; }
  .nav-brand:hover, .nav-location:hover, .nav-btn:hover, .nav-menu-btn:hover { border-color: #fff; }
  .nav-smile { color: ${theme.accent}; font-size: 18px; margin-left: -4px; }
  .nav-location { color: #fff; cursor: pointer; padding: 8px 9px; border: 1px solid transparent; line-height: 1.05; min-width: 140px; }
  .nav-location small, .nav-btn small { display: block; color: #D6D6D6; font-size: 12px; font-weight: 600; }
  .nav-location strong, .nav-btn strong { display: block; color: #fff; font-size: 14px; font-weight: 800; white-space: nowrap; }
  .nav-search { flex: 1; max-width: none; min-width: 240px; height: 44px; display: flex; position: relative; border-radius: 5px; overflow: hidden; border: 2px solid transparent; }
  .nav-search:focus-within { border-color: ${theme.accent}; box-shadow: 0 0 0 2px rgba(213,164,65,0.35); }
  .nav-search-select { width: 64px; border: none; border-right: 1px solid #BDAE9E; background: #E9DED0; color: ${theme.text}; padding: 0 8px; font-weight: 600; outline: none; }
  .nav-search input { height: 100%; border: none; border-radius: 0; color: ${theme.text}; padding-left: 12px; font-size: 16px; box-shadow: none; }
  .nav-search input:focus { border: none; box-shadow: none; }
  .nav-search-icon { width: 54px; display: flex; align-items: center; justify-content: center; background: ${theme.accent}; color: #111; font-size: 22px; font-weight: 800; }
  .nav-actions { margin-left: 0; display: flex; align-items: stretch; gap: 2px; }
  .nav-btn { background: transparent; border: 1px solid transparent; color: #fff; padding: 8px 9px; border-radius: 0; font-family: 'Nunito', sans-serif; font-size: 13px; font-weight: 700; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: border-color 0.1s; min-height: 46px; }
  .nav-cart { font-size: 17px; }
  .nav-cart-count { color: ${theme.accent}; min-width: 16px; height: 18px; font-size: 18px; font-weight: 900; display: inline-flex; align-items: center; justify-content: center; }
  .nav-sub { height: 39px; background: ${theme.primaryLight}; display: flex; align-items: center; gap: 2px; padding: 0 18px; overflow-x: auto; scrollbar-width: none; }
  .nav-sub::-webkit-scrollbar { display: none; }
  .nav-menu-btn { height: 32px; background: transparent; border: 1px solid transparent; color: #fff; padding: 4px 10px; font-weight: 700; font-size: 14px; cursor: pointer; white-space: nowrap; transition: border-color 0.1s; }
  .nav-menu-btn:hover { border-color: #fff; }

  .page { min-height: calc(100vh - 99px); }
  .container { max-width: 1500px; margin: 0 auto; padding: 0 20px; }
  
  .hero { background: linear-gradient(110deg, #E8D7C3 0%, #D6B48A 52%, #B8794D 100%); color: ${theme.primaryDark}; padding: 42px 20px 96px; text-align: center; position: relative; overflow: hidden; }
  .hero h1 { font-size: clamp(28px, 4vw, 48px); font-weight: 900; letter-spacing: 0; margin-bottom: 10px; }
  .hero p { font-size: 18px; color: #4A3429; max-width: 650px; margin: 0 auto 24px; }
  .hero-btns { display: flex; gap: 12px; justify-content: center; flex-wrap: wrap; }
  
  .category-strip { display: flex; gap: 0; padding: 14px 0; overflow-x: auto; scrollbar-width: none; background: ${theme.bgCard}; border-bottom: 1px solid ${theme.border}; margin: 0 -20px 16px; padding-left: 20px; padding-right: 20px; }
  .category-strip::-webkit-scrollbar { display: none; }
  .cat-chip { display: flex; align-items: center; gap: 6px; padding: 8px 16px; border-radius: 0; border: 1px solid transparent; background: ${theme.bgCard}; cursor: pointer; white-space: nowrap; font-size: 14px; font-weight: 700; color: ${theme.text}; transition: border-color 0.1s, color 0.1s; }
  .cat-chip:hover, .cat-chip.active { color: ${theme.primary}; border-color: ${theme.border}; box-shadow: inset 0 -3px 0 ${theme.accent}; }
  .cat-chip span { font-size: 18px; }
  
  .product-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(245px, 1fr)); gap: 16px; padding: 20px 0 40px; align-items: stretch; }
  .product-card { display: flex; flex-direction: column; background: ${theme.bgCard}; min-height: 360px; }
  .product-emoji { font-size: 56px; background: ${theme.bgCard}; padding: 14px; text-align: center; min-height: 156px; display: flex; flex-direction: column; justify-content: center; }
  .product-body { padding: 12px 18px 14px; flex: 1; display: flex; flex-direction: column; text-align: left; }
  .product-name { font-family: Arial, 'Nunito', sans-serif; font-weight: 700; font-size: 16px; margin-bottom: 7px; color: ${theme.text}; }
  .product-desc { font-size: 14px; color: ${theme.textMuted}; flex: 1; margin-bottom: 10px; line-height: 1.45; }
  .product-price { font-family: Arial, 'Nunito', sans-serif; font-size: 24px; font-weight: 800; color: ${theme.error}; }
  .product-price span { font-size: 13px; font-weight: 500; color: ${theme.textMuted}; }
  .product-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 12px; padding-top: 12px; border-top: 1px solid ${theme.border}; }
  .product-rating { font-size: 13px; color: ${theme.warning}; font-weight: 600; }
  .product-stock { font-size: 12px; color: ${theme.textMuted}; }

  .product-detail-shell { display: grid; grid-template-columns: 1.1fr 0.9fr; gap: 28px; align-items: start; }
  .product-detail-gallery { background: ${theme.bgCard}; border: 1px solid ${theme.border}; border-radius: 18px; padding: 18px; }
  .product-detail-main { position: relative; background: linear-gradient(135deg, #FFF8ED, #E9DED0); border-radius: 16px; min-height: 520px; overflow: hidden; display: flex; align-items: center; justify-content: center; }
  .product-detail-main img { width: 100%; height: 520px; object-fit: cover; display: block; }
  .product-detail-thumbs { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin-top: 12px; }
  .product-detail-thumb { border: 1px solid ${theme.border}; border-radius: 10px; background: ${theme.bgCard}; padding: 6px; cursor: pointer; transition: all 0.2s; overflow: hidden; }
  .product-detail-thumb.active { border-color: ${theme.primary}; box-shadow: 0 0 0 2px rgba(19,25,33,0.08); }
  .product-detail-thumb img { width: 100%; height: 76px; object-fit: cover; border-radius: 8px; display: block; }
  .product-detail-info { background: #fff; border: 1px solid #E7E7E7; border-radius: 18px; padding: 24px; }
  .product-detail-label { font-size: 12px; letter-spacing: 0.1em; text-transform: uppercase; font-weight: 800; color: ${theme.textMuted}; }
  .product-detail-title { font-size: clamp(28px, 3vw, 42px); line-height: 1.12; font-weight: 800; margin: 10px 0 8px; }
  .product-detail-price { font-size: clamp(26px, 2vw, 38px); font-weight: 900; color: ${theme.error}; margin-bottom: 10px; }
  .product-detail-row { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
  .product-detail-specs { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 10px; margin: 20px 0; }
  .product-detail-spec { background: #F5EDE2; border: 1px solid ${theme.border}; border-radius: 12px; padding: 12px 14px; }
  .product-detail-spec small { display: block; color: ${theme.textMuted}; text-transform: uppercase; letter-spacing: 0.08em; font-size: 11px; font-weight: 800; }
  .product-detail-spec strong { display: block; margin-top: 6px; font-size: 16px; }
  .product-detail-actions { display: flex; gap: 12px; flex-wrap: wrap; margin-top: 12px; }
  .product-detail-actions .btn-primary { min-width: 200px; }
  .product-detail-summary { margin-top: 20px; padding: 16px 18px; border: 1px solid ${theme.border}; border-radius: 12px; background: #F8F1E8; }
  .detail-feature-list { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; margin-top: 18px; }
  .detail-feature { background: #F5EDE2; border: 1px solid ${theme.border}; border-radius: 10px; padding: 12px 10px; font-size: 13px; font-weight: 700; color: ${theme.text}; text-align: center; }
  .product-detail-description { padding: 24px; }
  .product-detail-description h3 { margin-bottom: 12px; font-size: 22px; }
  .product-detail-description p { color: ${theme.textMuted}; line-height: 1.8; font-size: 16px; }
  @media (max-width: 900px) {
    .product-detail-shell { grid-template-columns: 1fr; }
    .product-detail-main, .product-detail-main img { min-height: 360px; height: 360px; }
  }
  
  .auth-container { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(135deg, #E8D7C3 0%, #F6EFE6 100%); padding: 20px; }
  .auth-card { background: ${theme.bgCard}; border-radius: 24px; padding: 40px; max-width: 420px; width: 100%; box-shadow: 0 20px 60px rgba(74,44,32,0.18); }
  .auth-logo { text-align: center; margin-bottom: 28px; }
  .auth-logo h1 { font-size: 28px; font-weight: 800; color: ${theme.primary}; }
  .auth-tabs { display: flex; background: ${theme.bg}; border-radius: 12px; padding: 4px; margin-bottom: 24px; }
  .auth-tab { flex: 1; padding: 9px; border-radius: 9px; text-align: center; font-weight: 700; font-size: 14px; cursor: pointer; transition: all 0.2s; color: ${theme.textMuted}; }
  .auth-tab.active { background: ${theme.bgCard}; color: ${theme.primary}; box-shadow: 0 2px 8px rgba(74,44,32,0.12); }
  .contact-layout { display: grid; grid-template-columns: minmax(220px, 0.75fr) minmax(0, 1.25fr); gap: 24px; align-items: start; }
  .contact-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; }
  .profile-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 18px; max-width: 680px; margin: 24px auto 0; }
  .saved-address-picker { display: flex; align-items: center; justify-content: space-between; gap: 18px; background: ${theme.accentLight}; border: 1px solid ${theme.border}; border-radius: 12px; padding: 14px 16px; margin-bottom: 18px; }
  .saved-address-picker strong, .saved-address-picker span { display: block; }
  .saved-address-picker span { color: ${theme.textMuted}; font-size: 12px; margin-top: 3px; }
  .saved-address-picker .input { max-width: 300px; }
  .address-form { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 16px; max-width: 720px; margin: 24px auto 0; }
  .address-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 14px; max-width: 720px; margin: 26px auto 0; }
  .saved-address-card { border: 1px solid ${theme.border}; border-radius: 12px; padding: 16px; background: ${theme.bg}; }
  @media (max-width: 700px) {
    .contact-layout, .contact-fields, .profile-fields, .address-form { grid-template-columns: 1fr; }
    .saved-address-picker { align-items: stretch; flex-direction: column; }
    .saved-address-picker .input { max-width: none; }
  }
  @media (max-width: 700px) {
    .contact-layout, .contact-fields, .profile-fields { grid-template-columns: 1fr; }
  }
  
  .cart-item { display: flex; align-items: center; gap: 14px; padding: 16px 0; border-bottom: 1px solid ${theme.border}; }
  .cart-emoji { font-size: 36px; background: ${theme.accentLight}; width: 64px; height: 64px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .cart-details { flex: 1; min-width: 0; }
  .cart-name { font-weight: 700; font-size: 15px; margin-bottom: 2px; }
  .cart-price { font-size: 14px; color: ${theme.textMuted}; }
  .qty-ctrl { display: flex; align-items: center; gap: 8px; }
  .qty-btn { width: 28px; height: 28px; border-radius: 6px; border: 1.5px solid ${theme.primaryLight}; background: ${theme.primaryLight}; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center; font-weight: 700; color: #fff; transition: all 0.15s; }
  .qty-btn:hover { background: ${theme.primary}; color: #fff; border-color: ${theme.primary}; }
  
  .order-summary { background: ${theme.bg}; border-radius: 16px; padding: 20px; }
  .summary-row { display: flex; justify-content: space-between; font-size: 15px; margin-bottom: 10px; }
  .summary-row.total { font-weight: 800; font-size: 18px; color: ${theme.primary}; border-top: 2px solid ${theme.border}; padding-top: 12px; margin-top: 4px; }
  
  .payment-card { background: ${theme.bgCard}; border-radius: 16px; border: 1.5px solid ${theme.border}; padding: 20px; margin-bottom: 16px; cursor: pointer; transition: all 0.2s; }
  .payment-card:hover, .payment-card.selected { border-color: ${theme.primary}; background: ${theme.accentLight}; }
  .payment-label { font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 10px; }
  
  .settings-nav { display: flex; flex-direction: column; gap: 4px; }
  .settings-nav-item { padding: 11px 16px; border-radius: 10px; cursor: pointer; font-weight: 600; font-size: 14px; color: ${theme.textMuted}; display: flex; align-items: center; gap: 10px; transition: all 0.15s; }
  .settings-nav-item:hover, .settings-nav-item.active { background: ${theme.accentLight}; color: ${theme.primary}; }
  .settings-nav-item span { font-size: 18px; }
  
  .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.45); z-index: 200; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .modal { background: ${theme.bgCard}; border-radius: 20px; padding: 28px; max-width: 480px; width: 100%; max-height: 90vh; overflow-y: auto; }
  .modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; }
  .modal-title { font-family: 'Raleway', sans-serif; font-size: 20px; font-weight: 800; color: ${theme.primary}; }

  .section-title { font-family: Arial, 'Nunito', sans-serif; font-size: 24px; font-weight: 800; color: ${theme.text}; margin-bottom: 4px; text-align: left; }
  .section-sub { font-size: 14px; color: ${theme.textMuted}; margin-bottom: 20px; text-align: left; }

  .empty-state { text-align: center; padding: 60px 20px; }
  .empty-state .icon { font-size: 64px; margin-bottom: 16px; }
  .empty-state h3 { font-size: 20px; font-weight: 700; margin-bottom: 8px; }
  .empty-state p { color: ${theme.textMuted}; font-size: 14px; margin-bottom: 20px; }
  
  .toast { position: fixed; bottom: 24px; right: 24px; background: ${theme.primaryDark}; color: #fff; padding: 12px 20px; border-radius: 12px; font-size: 14px; font-weight: 600; z-index: 999; box-shadow: 0 8px 24px rgba(0,0,0,0.25); animation: slideUp 0.3s ease; }
  @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
  @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes popIn { 0% { transform: scale(0.4); opacity: 0; } 70% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
  @keyframes growBar { from { width: 0; } to { width: 200px; } }
  
  .tab-bar { display: flex; border-bottom: 2px solid ${theme.border}; margin-bottom: 24px; }
  .tab-item { padding: 10px 20px; font-weight: 700; font-size: 14px; cursor: pointer; color: ${theme.textMuted}; border-bottom: 2px solid transparent; margin-bottom: -2px; transition: all 0.2s; }
  .tab-item.active { color: ${theme.primary}; border-bottom-color: ${theme.primary}; }

  .stars { color: ${theme.warning}; font-size: 14px; }
  
  input[type=text],input[type=email],input[type=password],input[type=tel] { font-family: 'Nunito', sans-serif; }
  select { font-family: 'Nunito', sans-serif; }
  
  @media (max-width: 640px) {
    .nav-main { padding: 0 10px; height: auto; min-height: 60px; flex-wrap: wrap; gap: 8px; padding-bottom: 8px; }
    .nav-location { display: none; }
    .nav-search { order: 3; flex-basis: 100%; min-width: 0; }
    .hero { padding: 36px 16px 74px; }
    .product-grid { grid-template-columns: repeat(auto-fill, minmax(160px, 1fr)); gap: 12px; }
  }

  /* Mobile / Tablet improvements */
  @media (max-width: 900px) {
    .container { max-width: 920px; padding: 0 16px; }
    .nav-main { padding: 0 12px; gap: 8px; }
    .nav-location { min-width: 110px; }
    .nav-btn { padding: 7px 6px; }
    .product-grid { grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); }
    .auth-card { padding: 28px; }
  }

  /* Mobile nav visibility */
  .nav-hamburger { display: none; background: transparent; border: 1px solid transparent; color: #fff; font-size: 22px; padding: 6px 8px; cursor: pointer; }
  .nav-actions.mobile-visible, .nav-search.mobile-visible { display: flex !important; }
  @media (max-width: 720px) {
    .nav-search { display: none; }
    .nav-actions { display: none; }
    .nav-hamburger { display: inline-flex; }
    .nav-actions.mobile-visible { position: absolute; left: 0; right: 0; top: 99px; background: ${theme.bgNav}; padding: 12px; flex-direction: column; gap: 4px; box-shadow: 0 8px 30px rgba(0,0,0,0.25); z-index: 120; }
    .nav-actions.mobile-visible .nav-btn { width: 100%; justify-content: flex-start; }
    .nav-search.mobile-visible { display: flex; width: 100%; padding: 0; }
    .nav-sub { padding: 0 10px; }
  }

  .nav-menu-panel { position: relative; background: rgba(255,251,245,0.98); border: 1px solid ${theme.border}; border-top: none; box-shadow: 0 10px 26px rgba(74,44,32,0.14); z-index: 120; }
  .nav-menu-panel-inner { max-width: 1500px; margin: 0 auto; padding: 16px 20px 20px; }
  .nav-menu-categories { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 10px; margin-bottom: 18px; }
  .nav-menu-item { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border: 1px solid ${theme.border}; background: ${theme.bgCard}; color: ${theme.text}; border-radius: 10px; font-size: 15px; font-weight: 700; cursor: pointer; text-align: left; }
  .nav-menu-item.active { background: ${theme.accentLight}; border-color: ${theme.accent}; color: ${theme.primary}; }
  .nav-menu-filters { display: grid; grid-template-columns: 1.8fr 1fr 1fr; gap: 12px; align-items: end; }
  .nav-menu-filter-box { display: flex; flex-direction: column; gap: 8px; }
  .nav-menu-filter-box label { font-size: 12px; font-weight: 700; color: ${theme.textMuted}; text-transform: uppercase; letter-spacing: 0.55px; }
  .nav-menu-filter-row { display: flex; gap: 8px; }
  .nav-menu-filter-row .input { min-width: 0; }

`;

// ─── Toast ─────────────────────────────────────────────────────────────────
function Toast({ msg, onClose }) {
  useEffect(() => { const t = setTimeout(onClose, 2800); return () => clearTimeout(t); }, []);
  return <div className="toast">{msg}</div>;
}

// ─── Navbar ────────────────────────────────────────────────────────────────
function Navbar({ user, cart, onNav, onSearch, searchQ, menuOpen, setMenuOpen, activeCat, setActiveCat, priceMin, setPriceMin, priceMax, setPriceMax, availability, setAvailability, sortBy, setSortBy }) {
  const cartCount = cart.reduce((s, i) => s + i.qty, 0);
  return (
    <header className="nav">
      <div className="nav-main">
        <div className="nav-left">
          <div className="nav-brand" onClick={() => { onNav("home"); setMenuOpen(false); }}>
            AquaPets<span className="nav-smile">.in</span>
          </div>
          <button className="nav-hamburger" onClick={() => setMenuOpen(o => !o)} aria-label="Toggle menu">{menuOpen ? 'X' : '☰'}</button>
          <div className="nav-location" onClick={() => { if (user) localStorage.setItem('account_section', 'address'); onNav(user ? "account" : "login"); setMenuOpen(false); }}>
            <small>Delivering to</small>
            <strong>Update location</strong>
          </div>
        </div>
        <div className={`nav-search ${menuOpen ? 'mobile-visible' : ''}`}>
          <select className="nav-search-select" aria-label="Search category">
            <option>All</option>
            <option>Fish</option>
            <option>Tanks</option>
            <option>Food</option>
          </select>
          <input className="input" placeholder="Search AquaPets.in" value={searchQ} onChange={e => onSearch(e.target.value)} />
          <span className="nav-search-icon">⌕</span>
        </div>
        <div className={`nav-actions ${menuOpen ? 'mobile-visible' : ''}`}>
          <button className="nav-btn" onClick={() => { onNav(user ? "account" : "login"); setMenuOpen(false); }}>
            <span><small>Hello, {user ? user.name.split(" ")[0] : "sign in"}</small><strong>Account & Lists</strong></span>
          </button>
          <button className="nav-btn" onClick={() => { onNav("wishlist"); setMenuOpen(false); }}>
            <span><small>Saved</small><strong>Wishlist</strong></span>
          </button>
          <button className="nav-btn nav-cart" onClick={() => { onNav("cart"); setMenuOpen(false); }}>
            🛒 {cartCount > 0 && <span className="nav-cart-count">{cartCount}</span>} <strong>Cart</strong>
          </button>
        </div>
      </div>
      <div className="nav-sub">
        <button className="nav-menu-btn" onClick={() => setMenuOpen(o => !o)}>☰ All</button>
        <button className="nav-menu-btn" onClick={() => { onNav("home"); setMenuOpen(false); setActiveCat("all"); }}>Home</button>
        <button className="nav-menu-btn" onClick={() => { onNav("home"); setMenuOpen(false); setActiveCat("best-sellers"); }}>Best Sellers</button>
        <button className="nav-menu-btn" onClick={() => { onNav("contact"); setMenuOpen(false); }}>Customer Service</button>
        {user && user.role === 'admin' && <button className="nav-menu-btn" onClick={() => { onNav("admin"); setMenuOpen(false); }}>Admin</button>}
        <div style={{ marginLeft: 'auto' }}></div>
        {user && <button className="nav-menu-btn" onClick={() => { onNav("account"); setMenuOpen(false); }} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>👤 {user.name.split(' ')[0]}</button>}
      </div>
      {menuOpen && (
        <div className="nav-menu-panel">
          <div className="nav-menu-panel-inner">
            <div className="nav-menu-categories">
              {CATEGORIES.map(cat => (
                <button key={cat.id} className={`nav-menu-item ${activeCat === cat.id ? 'active' : ''}`} onClick={() => { setActiveCat(cat.id); setMenuOpen(false); }}>
                  <span>{cat.icon}</span>
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="nav-menu-filters">
              <div className="nav-menu-filter-box">
                <label>Price</label>
                <div className="nav-menu-filter-row">
                  <input className="input" placeholder="Min" value={priceMin} onChange={e => setPriceMin(e.target.value.replace(/[^0-9]/g, ''))} />
                  <input className="input" placeholder="Max" value={priceMax} onChange={e => setPriceMax(e.target.value.replace(/[^0-9]/g, ''))} />
                </div>
              </div>
              <div className="nav-menu-filter-box">
                <label>Availability</label>
                <select className="input" value={availability} onChange={e => setAvailability(e.target.value)}>
                  <option value="any">All</option>
                  <option value="in">In Stock</option>
                  <option value="out">Out of Stock</option>
                </select>
              </div>
              <div className="nav-menu-filter-box">
                <label>Sort</label>
                <select className="input" value={sortBy} onChange={e => setSortBy(e.target.value)}>
                  <option value="">Default</option>
                  <option value="price-asc">Price Low-High</option>
                  <option value="price-desc">Price High-Low</option>
                  <option value="newest">Newest</option>
                  <option value="best-selling">Best Selling</option>
                </select>
              </div>
              <button className="btn btn-outline" style={{ width: '100%' }} onClick={() => { setPriceMin(''); setPriceMax(''); setAvailability('any'); setSortBy(''); }}>Reset Filters</button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

// ─── Product Card ──────────────────────────────────────────────────────────
function ProductCard({ product, onAddCart, onBuyNow, onView, wished, onToggleWish }) {
  return (
    <div className="card product-card" onClick={() => onView(product)} style={{ cursor: "pointer" }}>
      <div className="product-emoji" style={{ cursor: "pointer" }}>
        <ProductImage product={product} style={{ width: '100%', height: 150, objectFit: 'cover', borderRadius: 8 }} />
        {product.tag && <div style={{ marginTop: 8 }}><span className={`badge ${product.tag === "Premium" ? "badge-premium" : "badge-primary"}`}>{product.tag}</span></div>}
      </div>
      <div className="product-body">
        <div className="product-name">{product.name}</div>
        <div className="product-desc">{product.desc || product.description}</div>
        <div className="product-price">₹{product.price.toLocaleString()} <span>/ unit</span></div>
        <div className="product-footer">
          <div>
            <div className="stars">{"★".repeat(Math.floor(product.rating))}{"☆".repeat(5 - Math.floor(product.rating))}</div>
            <div className="product-stock">Stock: {product.stock}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
            <button className="btn btn-icon" title={wished ? 'Remove from wishlist' : 'Add to wishlist'} onClick={(e) => { e.stopPropagation(); onToggleWish(product); }}>{wished ? '❤️' : '🤍'}</button>
            <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); onBuyNow(product); }}>Buy Now</button>
            <button className="btn btn-primary btn-sm" onClick={(e) => { e.stopPropagation(); onAddCart(product); }}>+ Add</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Product Modal ─────────────────────────────────────────────────────────
function ProductModal({ product, onClose, onAddCart, onBuyNow }) {
  if (!product) return null;
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <span className="modal-title">Product Details</span>
          <button className="btn btn-outline btn-sm" onClick={onClose}>✕ Close</button>
        </div>
        <div style={{ textAlign: "center", fontSize: 80, background: theme.accentLight, borderRadius: 16, padding: 24, marginBottom: 20 }}>
          <ProductImage product={product} fallbackSize={80} style={{ width: '100%', maxHeight: 260, objectFit: 'cover', borderRadius: 12 }} />
        </div>
        {product.tag && <span className={`badge ${product.tag === "Premium" ? "badge-premium" : "badge-primary"}`} style={{ marginBottom: 12, display: "inline-block" }}>{product.tag}</span>}
        <h2 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>{product.name}</h2>
        <p style={{ color: theme.textMuted, marginBottom: 16, lineHeight: 1.6 }}>{product.desc || product.description}</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 12, marginBottom: 20 }}>
          {[["Price", `₹${product.price.toLocaleString()}`], ["Rating", `${product.rating} ★`], ["In Stock", product.stock]].map(([l, v]) => (
            <div key={l} style={{ background: theme.bg, borderRadius: 12, padding: "12px 8px", textAlign: "center" }}>
              <div style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 4 }}>{l}</div>
              <div style={{ fontSize: 16, fontWeight: 800, color: theme.primary }}>{v}</div>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={() => { onBuyNow(product); onClose(); }}>⚡ Buy Now</button>
          <button className="btn btn-outline" style={{ flex: 1 }} onClick={() => { onAddCart(product); onClose(); }}>🛒 Add to Cart</button>
        </div>
      </div>
    </div>
  );
}

function ProductDetailPage({ product, onBack, onAddCart, onBuyNow, onToggleWish, wished }) {
  if (!product) return null;

  const description = product.details || product.desc || product.description || "Premium AquaPets product selected for your home aquarium or pet setup.";
  const gallery = getProductGallery(product);
  const [mainIndex, setMainIndex] = useState(0);

  useEffect(() => setMainIndex(0), [product.id]);

  const galleryImages = gallery.length ? gallery : [getProductImageSrc(product) || ""];

  return (
    <div className="page" style={{ paddingTop: 40, paddingBottom: 60 }}>
      <div className="container" style={{ display: 'grid', gap: 24 }}>
        <button className="btn btn-outline" onClick={onBack} style={{ justifySelf: 'flex-start' }}>← Back to products</button>

        <div className="product-detail-shell">
          <div className="product-detail-gallery">
            <div className="product-detail-main">
              {galleryImages[mainIndex] ? (
                <img src={galleryImages[mainIndex]} alt={product.name} />
              ) : (
                <div style={{ fontSize: 92 }}>{product.emoji || '🐠'}</div>
              )}
            </div>
            {galleryImages.length > 1 && (
              <div className="product-detail-thumbs">
                {galleryImages.map((img, idx) => (
                  <button
                    key={`${img}-${idx}`}
                    type="button"
                    className={`product-detail-thumb ${idx === mainIndex ? 'active' : ''}`}
                    onClick={() => setMainIndex(idx)}
                    aria-label={`View image ${idx + 1}`}
                  >
                    <img src={img} alt={`${product.name} preview ${idx + 1}`} />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="product-detail-info">
            {product.tag && <span className={`badge ${product.tag === "Premium" ? "badge-premium" : "badge-primary"}`} style={{ marginBottom: 10, display: 'inline-block' }}>{product.tag}</span>}
            <div className="product-detail-label">AquaPets</div>
            <h1 className="product-detail-title">{product.name}</h1>
            <div className="product-detail-price">₹{product.price.toLocaleString()}</div>
            <div className="product-detail-row">
              <div className="stars">{'★'.repeat(Math.floor(product.rating || 5))}{'☆'.repeat(5 - Math.floor(product.rating || 5))}</div>
              <span style={{ color: theme.textMuted, fontWeight: 700 }}>{product.rating || 5} / 5</span>
              <span style={{ color: theme.success, fontWeight: 800 }}>{product.stock > 0 ? `${product.stock} in stock` : 'Out of stock'}</span>
            </div>

            <div className="product-detail-specs">
              <div className="product-detail-spec">
                <small>Category</small>
                <strong>{product.category || 'General'}</strong>
              </div>
              <div className="product-detail-spec">
                <small>Delivery</small>
                <strong>Free in Madurai</strong>
              </div>
              <div className="product-detail-spec">
                <small>Care</small>
                <strong>Healthy & Safe</strong>
              </div>
              <div className="product-detail-spec">
                <small>Support</small>
                <strong>7-day returns</strong>
              </div>
            </div>

            <div className="product-detail-actions">
              <button className="btn btn-primary" onClick={() => onBuyNow(product)}>⚡ Buy Now</button>
              <button className="btn btn-primary" onClick={() => onAddCart(product)}>🛒 Add to Cart</button>
              <button className="btn btn-outline" onClick={() => onToggleWish(product)}>{wished ? '❤️ Remove from wishlist' : '🤍 Save to wishlist'}</button>
            </div>

            <div className="product-detail-summary">
              <div style={{ fontWeight: 800, marginBottom: 6 }}>Why customers choose this</div>
              <div style={{ color: theme.textMuted, lineHeight: 1.6 }}>Handpicked quality, expert support, and a healthy start for your pets or aquarium setup.</div>
            </div>
          </div>
        </div>

        <div className="card product-detail-description">
          <h3>Product Description</h3>
          <p>{description}</p>
          <div className="detail-feature-list">
            {['Premium quality', 'Easy setup', 'Trusted by pet parents'].map(item => (
              <div key={item} className="detail-feature">{item}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── CONTACT PAGE ───────────────────────────────────────────────────────────
function ContactPage({ onNav, user }) {
  const [form, setForm] = useState({ name: '', email: '', phone: '', topic: '', message: '' });
  const [msg, setMsg] = useState({ type: '', text: '' });
  const [messages, setMessages] = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setMsg({});
    if (!form.name || !form.email || !form.topic || !form.message) return setMsg({ type: 'error', text: 'Name, email, topic and message are required.' });
    try {
      // If logged in, prefill name/email
      if (user) { setForm(f => ({ ...f, name: user.name || f.name, email: user.email || f.email })); }

      try {
          const res = await apiFetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
          // read body as text once, then attempt JSON parse to avoid 'body stream already read' errors
          let text = '';
          try { text = await res.text(); } catch (e) { /* ignore */ }
          let data = null;
          if (text) {
            try { data = JSON.parse(text); } catch (e) { data = { raw: text }; }
          }
          if (!res.ok) return setMsg({ type: 'error', text: `Failed to send message: ${(data && (data.error || data.raw)) || `Server responded ${res.status}`}` });
          setMsg({ type: 'success', text: (data && (data.message || data.raw)) || 'Message sent.' });
          setForm({ name: '', email: '', phone: '', topic: '', message: '' });
          // refresh user's messages if authenticated
          if (user) fetchMessages();
      } catch (err) {
        return setMsg({ type: 'error', text: `Failed to send message: ${err.message || String(err)}` });
      }
    } catch (e) { setMsg({ type: 'error', text: `Network error: ${e.message || e}` }); }
  };

  const fetchMessages = async () => {
    if (!user) return;
    setLoadingMsgs(true);
    try {
        const res = await apiFetch('/api/contact');
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = { raw: text }; }
        if (!res.ok) return setMsg({ type: 'error', text: `Failed to load messages: ${(data && (data.error || data.raw)) || `Server responded ${res.status}`}` });
        setMessages(Array.isArray(data) ? data : []);
    } catch (err) {
      setMsg({ type: 'error', text: `Failed to load messages: ${err.message || String(err)}` });
    }
    setLoadingMsgs(false);
  };

  useEffect(() => { if (user) fetchMessages(); }, [user]);

  return (
    <div className="page">
      <div className="container" style={{ paddingTop: 44, paddingBottom: 56 }}>
        <div style={{ maxWidth: 1040, margin: '0 auto', textAlign: 'center' }}>
          <div style={{ color: theme.primary, fontSize: 13, fontWeight: 800, letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: 8 }}>AquaPets Support</div>
          <h2 className="section-title" style={{ marginBottom: 8 }}>How can we help?</h2>
          <div className="section-sub">Our customer care team is ready to help with your aquarium and order questions.</div>
        </div>
        <div className="contact-layout" style={{ maxWidth: 1040, margin: '28px auto 0' }}>
          <div className="card" style={{ padding: 28, background: `linear-gradient(145deg, ${theme.primary}, ${theme.primaryLight})`, color: '#fff', textAlign: 'left' }}>
            <div style={{ fontSize: 34, marginBottom: 18 }}>🐠</div>
            <h3 style={{ fontSize: 22, marginBottom: 10 }}>Support that feels personal</h3>
            <p style={{ lineHeight: 1.6, marginBottom: 24, opacity: 0.9 }}>Tell us what you need and we will get back to you as soon as possible.</p>
            <div style={{ display: 'grid', gap: 14, fontSize: 14 }}>
              <div><strong style={{ display: 'block', marginBottom: 3 }}>Response time</strong><span style={{ opacity: 0.85 }}>Usually within 1 business day</span></div>
              <div><strong style={{ display: 'block', marginBottom: 3 }}>Order support</strong><span style={{ opacity: 0.85 }}>Delivery, returns and cancellations</span></div>
              <div><strong style={{ display: 'block', marginBottom: 3 }}>Aquarium advice</strong><span style={{ opacity: 0.85 }}>Products, setup and care</span></div>
            </div>
          </div>
          <div className="card" style={{ padding: 28, textAlign: 'left' }}>
          {msg.text && <div className={`alert alert-${msg.type === 'error' ? 'error' : 'success'}`}>{msg.type === 'error' ? '⚠️' : '✅'} {msg.text}</div>}
          <div className="contact-fields">
            <div className="input-group"><label>Name <span style={{ color: theme.error }}>*</span></label><input className="input" value={form.name} onChange={e => set('name', e.target.value)} /></div>
            <div className="input-group"><label>Email <span style={{ color: theme.error }}>*</span></label><input className="input" type="email" value={form.email} onChange={e => set('email', e.target.value)} /></div>
            <div className="input-group"><label>Phone <span style={{ color: theme.textMuted, fontWeight: 400 }}>(optional)</span></label><input className="input" type="tel" value={form.phone} onChange={e => set('phone', e.target.value)} /></div>
            <div className="input-group"><label>What can we help with? <span style={{ color: theme.error }}>*</span></label><select className="input" value={form.topic} onChange={e => set('topic', e.target.value)}><option value="">Select a topic</option><option value="Order support">Order support</option><option value="Delivery">Delivery</option><option value="Returns and cancellations">Returns and cancellations</option><option value="Product advice">Product advice</option><option value="Other">Something else</option></select></div>
          </div>
          <div className="input-group"><label>Message <span style={{ color: theme.error }}>*</span></label><textarea className="input" rows={6} placeholder="Tell us how we can help..." value={form.message} onChange={e => set('message', e.target.value)} /></div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
            <button className="btn btn-outline" onClick={() => onNav('home')}>Back to Home</button>
            <button className="btn btn-primary" onClick={submit}>Send Message</button>
          </div>
          </div>

          {/* If logged in, show customer's messages and admin replies */}
          {user && (
            <div style={{ gridColumn: '1 / -1', marginTop: 4, textAlign: 'left' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <h3 className="section-title" style={{ fontSize: 18 }}>My Messages</h3>
                <div>
                  <button className="btn btn-sm" onClick={fetchMessages}>Refresh</button>
                </div>
              </div>
              {loadingMsgs ? <div className="alert">Loading…</div> : (
                messages.length === 0 ? <div className="empty-state"><div className="icon">✉️</div><h3>No messages yet</h3><p>Messages you send will appear here with admin replies.</p></div>
                : messages.map(m => (
                  <div key={m.id} className="card" style={{ padding: 14, marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <div style={{ fontWeight: 800 }}>{m.name} • <span style={{ fontSize: 12, color: theme.textMuted }}>{new Date(m.created_at).toLocaleString()}</span></div>
                      <div>{m.is_replied ? <span className="badge badge-success">Replied</span> : <span className="badge">Pending</span>}</div>
                    </div>
                    <div style={{ color: theme.textMuted, marginBottom: 8 }}>{m.message}</div>
                    {m.is_replied ? <div style={{ marginTop: 8, padding: 12, background: theme.bg, borderRadius: 8 }}><strong>Admin Reply:</strong><div style={{ marginTop: 6 }}>{m.reply || '(no reply text)'}</div></div> : null}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── HOME PAGE ─────────────────────────────────────────────────────────────
function HomePage({ products: productsProp = PRODUCTS, totalProductCount = productsProp.length, loading = false, onAddCart, onBuyNow, onView, searchQ, onToggleWish, wishlist, user, onAuth, onSignupAuth, activeCat, setActiveCat, priceMin, setPriceMin, priceMax, setPriceMax, availability, setAvailability, sortBy, setSortBy }) {
  const filtered = advancedSearch(productsProp, { query: searchQ, category: activeCat });
  const showHero = !searchQ || !searchQ.trim();

  return (
    <div className="page">
      {showHero && (
        <div className="hero">
          <h1>🐠 Your Complete Aquatic & Pet World</h1>
          <p>Premium fish, tanks, aquarium plants, pets and foods — everything your aquatic & furry friends need.</p>
          <div className="hero-btns">
            <button className="btn btn-primary" onClick={() => setActiveCat("fish")}>Shop Fish</button>
            <button className="btn btn-outline" onClick={() => setActiveCat("tank")}>Browse Tanks</button>
            {!user && (
              <div style={{ display: 'flex', gap: 8, marginLeft: 12 }}>
                <button className="btn" onClick={() => onAuth && onAuth()}>Sign In</button>
                <button className="btn btn-primary" onClick={() => onSignupAuth && onSignupAuth()}>Create Account</button>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="container">
        {/* Products */}
        <div className="section-title">{searchQ ? `Results for "${searchQ}"` : (activeCat === 'best-sellers' ? 'Best Sellers' : CATEGORIES.find(c => c.id === activeCat)?.label)}</div>
        <div className="section-sub">{(activeCat === 'best-sellers' && !searchQ && !priceMin && !priceMax && availability === 'any' && !sortBy ? totalProductCount : advancedSearch(productsProp, {
          query: searchQ,
          category: activeCat === 'all' ? undefined : activeCat,
          priceMin: priceMin ? Number(priceMin) : undefined,
          priceMax: priceMax ? Number(priceMax) : undefined,
          availability: availability === 'any' ? undefined : (availability === 'in'),
          sort: sortBy || undefined,
        }).length)} products found</div>
        {loading ? (
          <div className="empty-state"><div className="icon">...</div><h3>Loading products</h3><p>Fetching the latest AquaPets catalog.</p></div>
        ) : advancedSearch(productsProp, {
          query: searchQ,
          category: activeCat === 'all' ? undefined : activeCat,
          priceMin: priceMin ? Number(priceMin) : undefined,
          priceMax: priceMax ? Number(priceMax) : undefined,
          availability: availability === 'any' ? undefined : (availability === 'in'),
          sort: sortBy || undefined,
        }).length === 0
          ? <div className="empty-state"><div className="icon">🔍</div><h3>No products found</h3><p>Try a different search or category.</p></div>
          : <div className="product-grid">{advancedSearch(productsProp, {
            query: searchQ,
            category: activeCat === 'all' ? undefined : activeCat,
            priceMin: priceMin ? Number(priceMin) : undefined,
            priceMax: priceMax ? Number(priceMax) : undefined,
            availability: availability === 'any' ? undefined : (availability === 'in'),
            sort: sortBy || undefined,
          }).map(p => <ProductCard key={p.id} product={p} onAddCart={onAddCart} onBuyNow={onBuyNow} onView={onView} wished={wishlist.includes(String(p.id))} onToggleWish={onToggleWish} />)}</div>
        }

        {/* Features */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, padding: "32px 0 48px" }}>
          {[["🚚", "Free Delivery", "On orders above ₹999 in Madurai"], ["💧", "Live Guarantee", "Healthy fish guaranteed or replaced"], ["🌿", "Expert Advice", "Free aquarium setup consultation"], ["🔄", "Easy Returns", "7-day hassle-free return policy"]].map(([icon, title, desc]) => (
            <div key={title} style={{ background: "#fff", border: "1px solid #DDD", borderRadius: 0, padding: "20px 16px", textAlign: "left" }}>
              <div style={{ fontSize: 32, marginBottom: 10 }}>{icon}</div>
              <div style={{ fontWeight: 800, fontFamily: "Arial, Nunito, sans-serif", marginBottom: 4 }}>{title}</div>
              <div style={{ fontSize: 13, color: theme.textMuted }}>{desc}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── SIGNUP FLOW ──────────────────────────────────────────────────────────
function SignupFlow({ onSuccess }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: '', phone: '', password: '', confirm: '', email: '' });
  const [err, setErr] = useState('');
  const [ok, setOk] = useState('');
  const [loading, setLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const pwdRule = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

  const handleSignup = async () => {
    setErr(''); setOk('');
    if (!form.name.trim()) return setErr('Full name is required.');
    const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (!form.email.trim()) return setErr('Email address is required.');
    if (!emailRe.test(form.email)) return setErr('Enter a valid email address.');
    if (!form.password) return setErr('Password is required.');
    if (form.password !== form.confirm) return setErr('Passwords do not match.');
    if (!pwdRule.test(form.password)) return setErr('Password must be 8+ chars with uppercase, lowercase, number and special character.');

    setLoading(true);
    try {
      const res = await apiFetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: form.name.trim(), email: form.email.trim(), phone: form.phone.trim(), password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) return setErr(data.error || 'Signup failed.');
      DB.saveUser(data.user);
      setStep(4);
      setOk('Account created! Logging you in…');
      setTimeout(() => onSuccess(data.user), 800);
    } catch (e) {
      setErr('Network error. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ width: '100%' }}>
      {err && <div className="alert alert-error" style={{ marginBottom: 16 }}>⚠️ {err}</div>}
      {ok && <div className="alert alert-success" style={{ marginBottom: 16 }}>✅ {ok}</div>}

      {/* ── SIGNUP FORM ── */}
      {step === 1 && (
        <div style={{ animation: 'fadeIn 0.3s ease' }}>
          <div className="input-group">
            <label>Full Name</label>
            <input id="signup-name" className="input" type="text" placeholder="Jane Doe" value={form.name} onChange={e => set('name', e.target.value)} onKeyDown={e => e.key === 'Enter' && document.getElementById('signup-phone')?.focus()} />
          </div>
          <div className="input-group">
            <label>Phone Number</label>
            <input id="signup-phone" className="input" type="tel" placeholder="+91 9876543210" value={form.phone} onChange={e => set('phone', e.target.value)} onKeyDown={e => e.key === 'Enter' && document.getElementById('signup-pwd')?.focus()} />
            <span style={{ fontSize: 12, color: theme.textMuted }}>Include country code, e.g. +91 for India</span>
          </div>
          <div className="input-group">
            <label>Password</label>
            <input id="signup-pwd" className="input" type="password" placeholder="Min 8 chars, upper+lower+number+symbol" value={form.password} onChange={e => set('password', e.target.value)} onKeyDown={e => e.key === 'Enter' && document.getElementById('signup-confirm')?.focus()} />
          </div>
          <div className="input-group">
            <label>Confirm Password</label>
            <input id="signup-confirm" className="input" type="password" placeholder="Repeat password" value={form.confirm} onChange={e => set('confirm', e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSignup()} />
          </div>
          <div className="input-group">
            <label>Email Address</label>
            <input id="signup-email" className="input" type="email" placeholder="you@email.com" value={form.email} onChange={e => set('email', e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSignup()} />
          </div>
          <button className="btn btn-primary" id="signup-submit" style={{ width: '100%', justifyContent: 'center', padding: 13, fontSize: 15, marginTop: 4 }} onClick={handleSignup} disabled={loading}>
            {loading ? 'Creating Account…' : '🐠 Create My Account'}
          </button>
        </div>
      )}

      {/* ── STEP 4: Success ── */}
      {step === 4 && (
        <div style={{ textAlign: 'center', animation: 'fadeIn 0.5s ease', padding: '16px 0' }}>
          <div style={{ fontSize: 72, marginBottom: 12, animation: 'popIn 0.4s ease' }}>🎊</div>
          <div style={{ fontSize: 22, fontWeight: 800, fontFamily: 'Raleway, sans-serif', color: theme.primary, marginBottom: 8 }}>Welcome to AquaPets!</div>
          <div style={{ fontSize: 14, color: theme.textMuted }}>Your account is ready. Logging you in…</div>
          <div style={{ marginTop: 20 }}>
            <div style={{ width: 48, height: 4, borderRadius: 4, background: theme.primary, margin: '0 auto', animation: 'growBar 1.8s ease forwards' }} />
          </div>
        </div>
      )}
    </div>
  );
}

// ─── AUTH PAGE ─────────────────────────────────────────────────────────────
function AuthPage({ onLogin, onSignup, onNav }) {
  const [tab, setTab] = useState(() => { const t = localStorage.getItem('auth_tab'); if (t === 'signup') { localStorage.removeItem('auth_tab'); return 'signup'; } return 'login'; });
  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", confirm: "" });
  const [err, setErr] = useState("");
  const [ok, setOk] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const handleLogin = async () => {
    setErr(""); setOk("");
    if (!form.email || !form.password) return setErr("Please fill all fields.");
    try {
      const res = await apiFetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) return setErr(data.error || "Login failed.");
      const session = { ...data.user };
      DB.saveUser(data.user);
      setOk(`Welcome back, ${data.user.name.split(" ")[0]}!`);
      setTimeout(() => onLogin(session), 600);
    } catch (err) {
      setErr("Network error. Unable to reach server. Please try again.");
    }
  };

  const handleSignup = async () => {
    setErr(""); setOk("");
    const emailRe = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    const pwdRule = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
    if (!form.name || !form.email || !form.password || !form.confirm) return setErr("Please fill all fields.");
    if (!emailRe.test(form.email)) return setErr("Enter a valid email address.");
    if (form.password !== form.confirm) return setErr("Passwords do not match.");
    if (!pwdRule.test(form.password)) return setErr("Password must be at least 8 chars and include uppercase, lowercase, number and special character.");
    try {
      const res = await apiFetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, email: form.email, phone: form.phone, password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) return setErr(data.error || "Signup failed.");
      const session = { ...data.user };
      DB.saveUser(data.user);
      setOk("Account created! Logging you in…");
      setTimeout(() => onSignup(session), 800);
    } catch (err) {
      setErr("Network error. Unable to reach server. Please try again.");
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card" style={{ position: 'relative' }}>
        <button className="btn btn-outline" aria-label="Back to Home" title="Back to Home" style={{ position: 'absolute', top: 12, left: 12, width: 30, height: 30, padding: 0, borderRadius: '50%', fontSize: 18 }} onClick={() => onNav("home")}>
          ←
        </button>
        <div className="auth-logo">
          <div style={{ fontSize: 48, marginBottom: 8 }}>🐠</div>
          <h1>AquaPets</h1>
          <p style={{ fontSize: 14, color: theme.textMuted, marginTop: 4 }}>Your aquatic world awaits</p>
        </div>
        <div className="auth-tabs">
          <div className={`auth-tab ${tab === "login" ? "active" : ""}`} onClick={() => { setTab("login"); setErr(""); setOk(""); }}>Sign In</div>
          <div className={`auth-tab ${tab === "signup" ? "active" : ""}`} onClick={() => { setTab("signup"); setErr(""); setOk(""); }}>Create Account</div>
        </div>
        {err && <div className="alert alert-error">⚠️ {err}</div>}
        {ok && <div className="alert alert-success">✅ {ok}</div>}
        {tab === "login" ? (
          <>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Sign In</div>
            <div className="input-group"><label>Email or Username</label><input className="input" type="text" placeholder="you@email.com or admin" value={form.email} onChange={e => set("email", e.target.value)} /></div>
            <div className="input-group"><label>Password</label><input className="input" type="password" placeholder="Your password" value={form.password} onChange={e => set("password", e.target.value)} /></div>
            <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", padding: 13, fontSize: 15 }} onClick={handleLogin}>Sign In →</button>
            <p style={{ textAlign: "center", fontSize: 13, color: theme.textMuted, marginTop: 16 }}>
              Don't have an account? <span style={{ color: theme.primary, cursor: "pointer", fontWeight: 700 }} onClick={() => setTab("signup")}>Create one</span>
            </p>
          </>
        ) : (
          <>
            <SignupFlow onSuccess={onSignup} />
            <p style={{ textAlign: "center", fontSize: 13, color: theme.textMuted, marginTop: 20 }}>
              Already have an account? <span style={{ color: theme.primary, cursor: "pointer", fontWeight: 700 }} onClick={() => setTab("login")}>Sign in</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

// ─── CART PAGE ─────────────────────────────────────────────────────────────
function CartPage({ cart, onUpdateQty, onRemove, onCheckout, user, onNav, onBuyNow }) {
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);
  const delivery = subtotal >= 999 ? 0 : 79;
  const tax = Math.round(subtotal * 0.05);
  const total = subtotal + delivery + tax;

  if (!user) return (
    <div className="page">
      <div className="container" style={{ paddingTop: 60 }}>
        <div className="empty-state">
          <div className="icon">🔒</div>
          <h3>Please sign in</h3>
          <p>You need to be logged in to view your cart.</p>
          <button className="btn btn-primary" onClick={() => onNav("login")}>Sign In</button>
        </div>
      </div>
    </div>
  );

  if (cart.length === 0) return (
    <div className="page">
      <div className="container" style={{ paddingTop: 60 }}>
        <div className="empty-state">
          <div className="icon">🛒</div>
          <h3>Your cart is empty</h3>
          <p>Explore our products and add some to your cart!</p>
          <button className="btn btn-primary" onClick={() => onNav("home")}>Shop Now</button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="page">
      <div className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <h2 className="section-title">🛒 Your Cart</h2>
        <p className="section-sub">{cart.reduce((s, i) => s + i.qty, 0)} items</p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr min(340px, 100%)", gap: 28, alignItems: "start" }}>
          <div>
            {cart.map(item => (
              <div key={item.id} className="cart-item">
                <div className="cart-emoji">
                  <ProductImage product={item} style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 12 }} fallbackSize={36} />
                </div>
                <div className="cart-details">
                  <div className="cart-name">{item.name}</div>
                  <div className="cart-price">₹{item.price.toLocaleString()} each</div>
                </div>
                <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
                  <div style={{ fontWeight: 800, color: theme.primary }}>₹{(item.price * item.qty).toLocaleString()}</div>
                  <div className="qty-ctrl">
                    <button className="qty-btn" onClick={() => onUpdateQty(item.id, item.qty - 1)}>−</button>
                    <span style={{ fontWeight: 700, minWidth: 24, textAlign: "center" }}>{item.qty}</span>
                    <button className="qty-btn" onClick={() => onUpdateQty(item.id, item.qty + 1)}>+</button>
                    <button className="qty-btn" style={{ color: theme.error, borderColor: "#FFCDD2" }} onClick={() => onRemove(item.id)}>🗑</button>
                  </div>
                  <button className="btn btn-sm" style={{ marginTop: 8 }} onClick={() => onBuyNow(item)}>Buy Now</button>
                </div>
              </div>
            ))}
          </div>
          <div>
            <div className="card" style={{ padding: 24 }}>
              <h3 style={{ fontFamily: "Raleway, sans-serif", fontSize: 18, fontWeight: 800, marginBottom: 16 }}>Order Summary</h3>
              <div className="order-summary">
                <div className="summary-row"><span>Subtotal</span><span>₹{subtotal.toLocaleString()}</span></div>
                <div className="summary-row"><span>Delivery</span><span style={{ color: delivery === 0 ? theme.success : theme.text }}>{delivery === 0 ? "FREE" : `₹${delivery}`}</span></div>
                <div className="summary-row"><span>GST (5%)</span><span>₹{tax.toLocaleString()}</span></div>
                <div className="summary-row total"><span>Total</span><span>₹{total.toLocaleString()}</span></div>
              </div>
              {subtotal < 999 && <p style={{ fontSize: 12, color: theme.textMuted, margin: "10px 0 16px" }}>Add ₹{(999 - subtotal).toLocaleString()} more for free delivery!</p>}
              <button className="btn btn-primary" style={{ width: "100%", justifyContent: "center", marginTop: 16, padding: 13, fontSize: 15 }} onClick={() => onCheckout(total)}>Proceed to Payment →</button>
              <button className="btn btn-outline" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} onClick={() => onNav("home")}>Continue Shopping</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── WISHLIST PAGE ────────────────────────────────────────────────────────
function WishlistPage({ user, wishlist, onNav, onAddCart, onBuyNow, onRemove }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    const load = async () => {
      if (!user) return;
      try {
        const res = await apiFetch('/api/wishlist');
        if (!res.ok) return setItems([]);
        const rows = await res.json();
        setItems(rows);
      } catch (e) { setItems([]); }
    };
    load();
  }, [user]);

  if (!user) return (
    <div className="page">
      <div className="container" style={{ paddingTop: 60 }}>
        <div className="empty-state"><div className="icon">🔒</div><h3>Please sign in</h3><p>You need an account to manage your wishlist.</p><button className="btn btn-primary" onClick={() => onNav('login')}>Sign In</button></div>
      </div>
    </div>
  );

  if (items.length === 0) return (
    <div className="page"><div className="container" style={{ paddingTop: 60 }}><div className="empty-state"><div className="icon">🤍</div><h3>Your wishlist is empty</h3><p>Add products you love to save them for later.</p><button className="btn btn-primary" onClick={() => onNav('home')}>Browse Products</button></div></div></div>
  );

  return (
    <div className="page">
      <div className="container" style={{ paddingTop: 32 }}>
        <h2 className="section-title">❤️ Your Wishlist</h2>
        <div className="product-grid">
          {items.map(p => (
            <div key={p.id} className="card product-card">
              <div className="product-emoji">
                <ProductImage product={p} style={{ width: '100%', height: 112, objectFit: 'cover', borderRadius: 8 }} />
              </div>
              <div className="product-body">
                <div className="product-name">{p.name}</div>
                <div className="product-desc">{p.description}</div>
                <div className="product-price">₹{p.price.toLocaleString()}</div>
                <div className="product-footer">
                  <div>
                    <div className="stars">{"★".repeat(Math.floor(p.rating))}{"☆".repeat(5 - Math.floor(p.rating))}</div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="btn" onClick={() => onBuyNow(p)}>Buy Now</button>
                    <button className="btn" onClick={() => onAddCart(p)}>+ Add to cart</button>
                    <button className="btn btn-outline" onClick={() => onRemove(p)}>Remove</button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── PAYMENT PAGE ──────────────────────────────────────────────────────────
function PaymentPage({ total, user, cart, onSuccess, onNav, startAtAddress = false }) {
  const [method, setMethod] = useState("upi");
  const [step, setStep] = useState(startAtAddress ? 1 : 2);
  const [form, setForm] = useState({ upi: "", card: "", expiry: "", cvv: "", name: "", addr: "", city: "Madurai", pin: "", phone: user?.phone || "" });
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [selectedAddressId, setSelectedAddressId] = useState("");
  const [processing, setProcessing] = useState(false);
  const [err, setErr] = useState("");
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  useEffect(() => {
    const loadAddresses = async () => {
      try {
        const res = await apiFetch('/api/addresses');
        if (!res.ok) return;
        const rows = await res.json();
        setSavedAddresses(rows);
        const preferred = rows.find(a => a.is_default) || rows[0];
        if (preferred) {
          setSelectedAddressId(String(preferred.id));
          setForm(f => ({ ...f, addr: preferred.address, city: preferred.city || f.city, pin: preferred.pin || f.pin, phone: preferred.phone || f.phone }));
        }
      } catch (e) { /* saved addresses are optional */ }
    };
    loadAddresses();
  }, []);

  const applySavedAddress = (id) => {
    setSelectedAddressId(id);
    const address = savedAddresses.find(item => String(item.id) === String(id));
    if (address) setForm(f => ({ ...f, addr: address.address, city: address.city || f.city, pin: address.pin || f.pin, phone: address.phone || f.phone }));
  };

  const METHODS = [
    { id: "upi", label: "UPI / GPay / PhonePe", icon: "📱" },
    { id: "card", label: "Credit / Debit Card", icon: "💳" },
    { id: "netbank", label: "Net Banking", icon: "🏦" },
    { id: "cod", label: "Cash on Delivery", icon: "💵" },
  ];

  const handlePay = () => {
    setErr("");
    if (step === 1) {
      return setStep(2);
    }
    // Validate delivery details before placing the order
    const pinRe = /^\d{6}$/;
    const phoneRe = /^[+\d\s()-]{7,20}$/;
    if (!form.addr || !form.pin || !form.phone) return setErr("Please fill delivery details.");
    if (!pinRe.test(form.pin)) return setErr('Invalid PIN code.');
    if (!phoneRe.test(form.phone)) return setErr('Invalid phone number.');
    if (method === "upi" && !form.upi) return setErr("Enter UPI ID.");
    if (method === "card" && (!form.card || !form.expiry || !form.cvv || !form.name)) return setErr("Fill all card details.");
    
    setProcessing(true);
    
    // Send order to backend API
    // Prepare order data for API
    const orderData = {
      items: cart.map(item => ({
        id: item.id,
        qty: item.qty
      })),
      method: method,
      address: form.addr
    };
    
    (async () => {
      try {
          const res = await apiFetch('/api/orders', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(orderData)
          });
          
          if (res.ok) {
            const data = await res.json();
            setProcessing(false);
            onSuccess(data.orderId);
            return;
          } else {
            const errorData = await res.json();
            setErr(errorData.error || `Server error (${res.status})`);
          }
      } catch (e) {
        setErr(e.message || 'Failed to place order. Please try again.');
      }
      setProcessing(false);
    })();
  };

  if (!user) return <div className="page"><div className="container" style={{ paddingTop: 60 }}><div className="empty-state"><div className="icon">🔒</div><h3>Please sign in first</h3><button className="btn btn-primary" onClick={() => onNav("login")}>Sign In</button></div></div></div>;

  return (
    <div className="page">
      <div className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <h2 className="section-title">💳 Checkout</h2>
        <p className="section-sub">Total: <strong style={{ color: theme.primary }}>₹{total.toLocaleString()}</strong></p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr min(320px, 100%)", gap: 28 }}>
          <div>
            <div className="tab-bar">
              {["Delivery Address", "Payment"].map((t, i) => (
                <div key={t} className={`tab-item ${step === i + 1 ? "active" : ""}`} style={{ cursor: "pointer" }} onClick={() => setStep(i + 1)}>{i + 1}. {t}</div>
              ))}
            </div>
            {err && <div className="alert alert-error">⚠️ {err}</div>}

            {step === 1 && (
              <div>
                {savedAddresses.length > 0 && <div className="saved-address-picker">
                  <div><strong>Use a saved address</strong><span>Choose a delivery location or enter a new one below.</span></div>
                  <select className="input" value={selectedAddressId} onChange={e => applySavedAddress(e.target.value)}>
                    <option value="">Enter a new address</option>
                    {savedAddresses.map(address => <option key={address.id} value={address.id}>{address.label || 'Saved address'} - {address.city || address.address}</option>)}
                  </select>
                </div>}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                  <div className="input-group" style={{ gridColumn: "span 2" }}><label>Full Address</label><textarea className="input" rows={2} placeholder="House no, Street, Area" value={form.addr} onChange={e => set("addr", e.target.value)} style={{ resize: "none" }} /></div>
                  <div className="input-group"><label>City</label><input className="input" value={form.city} onChange={e => set("city", e.target.value)} /></div>
                  <div className="input-group"><label>PIN Code</label><input className="input" placeholder="625001" value={form.pin} onChange={e => set("pin", e.target.value)} /></div>
                  <div className="input-group"><label>Phone</label><input className="input" type="tel" placeholder="+91 9876543210" value={form.phone} onChange={e => set("phone", e.target.value)} /></div>
                </div>
                <button className="btn btn-primary" style={{ marginTop: 8 }} onClick={handlePay}>Continue to Payment →</button>
              </div>
            )}

            {step === 2 && (
              <div>
                <div style={{ marginBottom: 20 }}>
                  {METHODS.map(m => (
                    <div key={m.id} className={`payment-card ${method === m.id ? "selected" : ""}`} onClick={() => setMethod(m.id)}>
                      <div className="payment-label">
                        <div style={{ width: 18, height: 18, borderRadius: "50%", border: `2px solid ${method === m.id ? theme.primary : theme.border}`, display: "flex", alignItems: "center", justifyContent: "center" }}>
                          {method === m.id && <div style={{ width: 10, height: 10, borderRadius: "50%", background: theme.primary }} />}
                        </div>
                        <span>{m.icon}</span> {m.label}
                      </div>
                    </div>
                  ))}
                </div>
                {method === "upi" && (
                  <div className="input-group"><label>UPI ID</label><input className="input" placeholder="yourname@upi" value={form.upi} onChange={e => set("upi", e.target.value)} /></div>
                )}
                {method === "card" && (
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div className="input-group" style={{ gridColumn: "span 2" }}><label>Name on Card</label><input className="input" placeholder="Full name" value={form.name} onChange={e => set("name", e.target.value)} /></div>
                    <div className="input-group" style={{ gridColumn: "span 2" }}><label>Card Number</label><input className="input" placeholder="0000 0000 0000 0000" value={form.card} onChange={e => set("card", e.target.value)} /></div>
                    <div className="input-group"><label>Expiry</label><input className="input" placeholder="MM/YY" value={form.expiry} onChange={e => set("expiry", e.target.value)} /></div>
                    <div className="input-group"><label>CVV</label><input className="input" placeholder="•••" type="password" value={form.cvv} onChange={e => set("cvv", e.target.value)} /></div>
                  </div>
                )}
                {method === "netbank" && <div className="alert alert-success">You will be redirected to your bank's portal.</div>}
                {method === "cod" && <div className="alert alert-success">Pay in cash when your order arrives. ₹{total.toLocaleString()} to be paid on delivery.</div>}
                <button className="btn btn-primary" style={{ marginTop: 8, padding: "13px 28px", fontSize: 15 }} onClick={handlePay} disabled={processing}>
                  {processing ? "⌛ Processing…" : `✅ Pay ₹${total.toLocaleString()}`}
                </button>
              </div>
            )}
          </div>

          <div>
            <div className="card" style={{ padding: 20 }}>
              <h4 style={{ fontFamily: "Raleway, sans-serif", fontWeight: 800, marginBottom: 14 }}>Order Items</h4>
              {cart.map(item => (
                <div key={item.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginBottom: 8 }}>
                  <span>{item.emoji} {item.name} × {item.qty}</span>
                  <span style={{ fontWeight: 700 }}>₹{(item.price * item.qty).toLocaleString()}</span>
                </div>
              ))}
              <div style={{ borderTop: `2px solid ${theme.border}`, marginTop: 12, paddingTop: 12, display: "flex", justifyContent: "space-between", fontWeight: 800, color: theme.primary }}>
                <span>Total</span><span>₹{total.toLocaleString()}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ACCOUNT PAGE ──────────────────────────────────────────────────────────
function AccountPage({ user, onLogout, onNav, onUpdateUser }) {
  const [section, setSection] = useState(() => {
    const requestedSection = localStorage.getItem('account_section');
    localStorage.removeItem('account_section');
    return requestedSection || "profile";
  });
  const [form, setForm] = useState({ name: user?.name || "", phone: user?.phone || "", email: user?.email || "" });
  const [pwForm, setPwForm] = useState({ current: "", new: "", confirm: "" });
  const [msg, setMsg] = useState({ type: "", text: "" });
  const [orders, setOrders] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [addressForm, setAddressForm] = useState({ label: "Home", address: "", city: "Madurai", pin: "", phone: user?.phone || "", is_default: true });
  const [cancelModal, setCancelModal] = useState({ show: false, orderId: null, reason: '' });
  const [loadingCancel, setLoadingCancel] = useState(false);

  // Fetch orders from API
  useEffect(() => {
    const loadOrders = async () => {
      if (!user || section !== 'orders') return;
      try {
        const res = await apiFetch('/api/orders');
        if (!res.ok) return;
        const data = await res.json();
        setOrders(data);
      } catch (e) { console.error('Failed to load orders:', e); }
    };
    loadOrders();
  }, [user, section]);

  useEffect(() => {
    const loadAddresses = async () => {
      if (!user || section !== 'address') return;
      try {
        const res = await apiFetch('/api/addresses');
        if (res.ok) setAddresses(await res.json());
      } catch (e) { setAddresses([]); }
    };
    loadAddresses();
  }, [user, section]);

  useEffect(() => {
    const load = async () => {
      if (!user || section !== 'notifications') return;
      try {
        const res = await apiFetch('/api/notifications');
        if (!res.ok) return setNotifications([]);
        const rows = await res.json();
        setNotifications(rows);
      } catch (e) { setNotifications([]); }
    };
    load();
  }, [user, section]);

  const markAllNotificationsRead = async () => {
    try {
      await apiFetch('/api/notifications/read', { method: 'PUT' });
      setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    } catch (e) { /* ignore */ }
  };

  const handleCancelOrder = async () => {
    if (!cancelModal.reason.trim()) {
      setMsg({ type: 'error', text: 'Please provide a cancellation reason.' });
      return;
    }
    
    setLoadingCancel(true);
    try {
      const res = await apiFetch(`/api/orders/${cancelModal.orderId}/cancel`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: cancelModal.reason }),
      });
      
      const data = await res.json();
      if (!res.ok) {
        setMsg({ type: 'error', text: data.error || 'Failed to cancel order.' });
        setLoadingCancel(false);
        return;
      }
      
      // Update local orders state
      setOrders(prev => prev.map(o => 
        o.id === cancelModal.orderId 
          ? { ...o, status: 'Cancelled', cancelled_at: data.order.cancelled_at, cancellation_reason: data.order.cancellation_reason }
          : o
      ));
      
      setMsg({ type: 'success', text: 'Order cancelled successfully!' });
      setCancelModal({ show: false, orderId: null, reason: '' });
    } catch (e) {
      setMsg({ type: 'error', text: 'Network error. Please try again.' });
    } finally {
      setLoadingCancel(false);
    }
  };

  const canCancelOrder = (status) => {
    return ['Pending', 'Processing', 'Confirmed'].includes(status);
  };

  if (!user) return (
    <div className="page"><div className="container" style={{ paddingTop: 60 }}>
      <div className="empty-state"><div className="icon">🔒</div><h3>Please sign in</h3><button className="btn btn-primary" onClick={() => onNav("login")}>Sign In</button></div>
    </div></div>
  );

  const SECTIONS = [
    { id: "profile", icon: "👤", label: "Profile" },
    { id: "orders", icon: "📦", label: "My Orders" },
    { id: "security", icon: "🔒", label: "Security" },
    { id: "notifications", icon: "🔔", label: "Notifications" },
    { id: "address", icon: "📍", label: "Saved Addresses" },
  ];

  const saveProfile = () => {
    if (!form.name.trim() || !form.email.trim() || !form.phone.trim()) {
      return setMsg({ type: "error", text: "Full name, email and phone number are required." });
    }
    (async () => {
      try {
        const res = await apiFetch("/api/user/profile", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: form.name, phone: form.phone }),
        });
        const data = await res.json();
        if (!res.ok) return setMsg({ type: "error", text: data.error || "Failed to update profile." });
        const updated = { ...user, name: form.name, phone: form.phone };
        DB.saveUser(updated);
        onUpdateUser(updated);
        setMsg({ type: "success", text: "Profile updated successfully!" });
      } catch (e) { setMsg({ type: "error", text: "Network error. Try again." }); }
    })();
  };

  const changePw = () => {
    if (pwForm.new.length < 6) return setMsg({ type: "error", text: "New password must be at least 6 characters." });
    if (pwForm.new !== pwForm.confirm) return setMsg({ type: "error", text: "New passwords do not match." });
    (async () => {
      try {
        const res = await apiFetch("/api/user/password", {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ currentPassword: pwForm.current, newPassword: pwForm.new }),
        });
        const data = await res.json();
        if (!res.ok) return setMsg({ type: "error", text: data.error || "Failed to change password." });
        setPwForm({ current: "", new: "", confirm: "" });
        setMsg({ type: "success", text: data.message || "Password changed successfully!" });
      } catch (e) { setMsg({ type: "error", text: "Network error. Try again." }); }
    })();
  };

  const saveAddress = async () => {
    if (!addressForm.label.trim() || !addressForm.address.trim() || !addressForm.city.trim() || !addressForm.pin.trim() || !addressForm.phone.trim()) {
      return setMsg({ type: "error", text: "Label, address, city, PIN code and phone are required." });
    }
    try {
      const res = await apiFetch('/api/addresses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(addressForm) });
      const data = await res.json();
      if (!res.ok) return setMsg({ type: "error", text: data.error || "Failed to save address." });
      const refreshed = await apiFetch('/api/addresses');
      setAddresses(await refreshed.json());
      setAddressForm({ label: "Home", address: "", city: "Madurai", pin: "", phone: user.phone || "", is_default: false });
      setMsg({ type: "success", text: "Address saved successfully!" });
    } catch (e) { setMsg({ type: "error", text: "Network error. Try again." }); }
  };

  const deleteAddress = async (id) => {
    try {
      const res = await apiFetch(`/api/addresses/${id}`, { method: 'DELETE' });
      if (!res.ok) return setMsg({ type: "error", text: "Failed to remove address." });
      setAddresses(prev => prev.filter(address => address.id !== id));
      setMsg({ type: "success", text: "Address removed." });
    } catch (e) { setMsg({ type: "error", text: "Network error. Try again." }); }
  };

  return (
    <div className="page">
      <div className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <div className="account-header" style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 28, background: "#fff", border: `1px solid ${theme.border}`, borderRadius: 16, padding: "20px 24px" }}>
          <div style={{ width: 60, height: 60, borderRadius: "50%", background: theme.primary, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 800, color: "#fff", flexShrink: 0 }}>{user.avatar || user.name.slice(0, 2).toUpperCase()}</div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, fontFamily: "Raleway, sans-serif" }}>{user.name}</div>
            <div style={{ fontSize: 14, color: theme.textMuted }}>{user.email}</div>
          </div>
          <button className="btn btn-danger btn-sm" style={{ marginLeft: "auto" }} onClick={onLogout}>Sign Out</button>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 24 }}>
          <div className="card" style={{ padding: 12, height: "fit-content" }}>
            <div className="settings-nav">
              {SECTIONS.map(s => (
                <div key={s.id} className={`settings-nav-item ${section === s.id ? "active" : ""}`} onClick={() => { setSection(s.id); setMsg({ type: "", text: "" }); }}>
                  <span>{s.icon}</span> {s.label}
                </div>
              ))}
            </div>
          </div>
          <div className="card" style={{ padding: 28 }}>
            {msg.text && <div className={`alert alert-${msg.type}`}>{msg.type === "error" ? "⚠️" : "✅"} {msg.text}</div>}

            {section === "profile" && <>
              <div style={{ textAlign: "center", maxWidth: 680, margin: "0 auto" }}>
                <div style={{ width: 76, height: 76, borderRadius: "50%", background: `linear-gradient(135deg, ${theme.primary}, ${theme.accent})`, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 28, fontWeight: 800, color: "#fff", margin: "0 auto 14px" }}>{user.avatar || user.name.slice(0, 2).toUpperCase()}</div>
                <h3 className="section-title" style={{ marginBottom: 6 }}>Profile Information</h3>
                <p className="section-sub">Keep your personal details up to date</p>
              </div>
              <div className="profile-fields">
                <div className="input-group"><label>Full Name <span style={{ color: theme.error }}>*</span></label><input className="input" required value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} /></div>
                <div className="input-group"><label>Email <span style={{ color: theme.error }}>*</span></label><input className="input" type="email" required value={form.email} disabled style={{ opacity: 0.6 }} /></div>
                <div className="input-group" style={{ gridColumn: "1 / -1" }}><label>Phone Number <span style={{ color: theme.error }}>*</span></label><input className="input" type="tel" required value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} /></div>
              </div>
              <div style={{ maxWidth: 680, margin: "0 auto", display: "flex", justifyContent: "flex-end" }}><button className="btn btn-primary" onClick={saveProfile}>Save Changes</button></div>
            </>}

              {section === "orders" && <>
              <h3 className="section-title">My Orders</h3>
              <p className="section-sub">{orders.length} orders placed</p>
              {orders.length === 0 ? <div className="empty-state"><div className="icon">📦</div><h3>No orders yet</h3><p>Shop now to see your orders here.</p><button className="btn btn-primary" onClick={() => onNav("home")}>Shop Now</button></div>
                : orders.slice().reverse().map(o => (
                  <div key={o.id} style={{ border: `1px solid ${theme.border}`, borderRadius: 14, padding: 16, marginBottom: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 10 }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 14 }}>Order #{o.id}</div>
                        <div style={{ fontSize: 12, color: theme.textMuted }}>
                          {new Date(o.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}
                        </div>
                      </div>
                      <div>
                        <span className={`badge ${o.status === 'Cancelled' ? 'badge-premium' : 'badge-success'}`}>
                          {o.status === 'Cancelled' ? '❌' : '✅'} {o.status}
                        </span>
                      </div>
                    </div>
                    <div style={{ fontSize: 13, color: theme.textMuted, marginBottom: 8 }}>
                      {o.items.map(i => `${i.emoji} ${i.name} ×${i.qty}`).join(" • ")}
                    </div>
                    <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
                      <div style={{ fontWeight: 800, color: theme.primary }}>₹{o.total.toLocaleString()} via {o.method?.toUpperCase() || 'N/A'}</div>
                      {canCancelOrder(o.status) && (
                        <button 
                          className="btn btn-danger btn-sm" 
                          style={{ marginLeft: 'auto' }}
                          onClick={() => setCancelModal({ show: true, orderId: o.id, reason: '' })}
                        >
                          Cancel Order
                        </button>
                      )}
                    </div>
                    {o.status === 'Cancelled' && o.cancellation_reason && (
                      <div style={{ background: theme.accentLight, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 10, marginBottom: 8, fontSize: 13 }}>
                        <div style={{ fontWeight: 700, color: theme.primary, marginBottom: 4 }}>Cancellation Reason:</div>
                        <div style={{ color: theme.textMuted }}>{o.cancellation_reason}</div>
                        {o.cancelled_at && (
                          <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
                            Cancelled on: {new Date(o.cancelled_at).toLocaleString("en-IN")}
                          </div>
                        )}
                      </div>
                    )}
                    {/* timeline */}
                    {o.status !== 'Cancelled' && (
                      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
                        {['Confirmed','Pending','Processing','Shipped','Delivered'].map((s, idx) => {
                          const currentIdx = ['Confirmed','Pending','Processing','Shipped','Delivered'].indexOf(o.status);
                          const done = idx <= currentIdx;
                          return (
                            <div key={s} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', fontSize: 12, color: done ? theme.primary : theme.textMuted }}>
                              <div style={{ width: 14, height: 14, borderRadius: 7, background: done ? theme.primary : '#FFF', border: `2px solid ${done ? theme.primary : theme.border}`, marginBottom: 6 }} />
                              <div>{s}</div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                ))}
            </>}

            {section === "security" && <>
              <h3 className="section-title">Change Password</h3>
              <p className="section-sub">Keep your account secure</p>
              <div className="input-group"><label>Current Password</label><input className="input" type="password" value={pwForm.current} onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))} /></div>
              <div className="input-group"><label>New Password</label><input className="input" type="password" value={pwForm.new} onChange={e => setPwForm(f => ({ ...f, new: e.target.value }))} /></div>
              <div className="input-group"><label>Confirm New Password</label><input className="input" type="password" value={pwForm.confirm} onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))} /></div>
              <button className="btn btn-primary" onClick={changePw}>Update Password</button>
            </>}

            {section === "notifications" && <>
              <h3 className="section-title">Notifications</h3>
              <p className="section-sub">Recent alerts about your orders and account</p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 8 }}><button className="btn btn-sm" onClick={markAllNotificationsRead}>Mark all read</button></div>
              {notifications.length === 0 ? <div className="empty-state"><div className="icon">🔔</div><h3>No notifications</h3><p>We'll send updates here when something happens.</p></div>
                : notifications.map(n => (
                  <div key={n.id} style={{ borderBottom: `1px solid ${theme.border}`, padding: '10px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: 700 }}>{n.type === 'order' ? 'Order Update' : (n.type || 'Notice')}</div>
                      <div style={{ fontSize: 13, color: theme.textMuted }}>{n.message}</div>
                    </div>
                    <div style={{ fontSize: 12, color: n.is_read ? theme.textMuted : theme.primary }}>{new Date(n.created_at).toLocaleString()}</div>
                  </div>
                ))}
            </>}

            {section === "address" && <>
              <div style={{ textAlign: "center", maxWidth: 720, margin: "0 auto" }}>
                <div style={{ fontSize: 34, marginBottom: 8 }}>📍</div>
                <h3 className="section-title" style={{ textAlign: "center", marginBottom: 6 }}>Saved Addresses</h3>
                <p className="section-sub">Save delivery details for a faster checkout</p>
              </div>
              <div className="address-form">
                <div className="input-group"><label>Address Label <span style={{ color: theme.error }}>*</span></label><input className="input" placeholder="Home, Work, etc." value={addressForm.label} onChange={e => setAddressForm(f => ({ ...f, label: e.target.value }))} /></div>
                <div className="input-group"><label>Phone <span style={{ color: theme.error }}>*</span></label><input className="input" type="tel" value={addressForm.phone} onChange={e => setAddressForm(f => ({ ...f, phone: e.target.value }))} /></div>
                <div className="input-group" style={{ gridColumn: "1 / -1" }}><label>Full Address <span style={{ color: theme.error }}>*</span></label><textarea className="input" rows={2} placeholder="House no, Street, Area" value={addressForm.address} onChange={e => setAddressForm(f => ({ ...f, address: e.target.value }))} /></div>
                <div className="input-group"><label>City <span style={{ color: theme.error }}>*</span></label><input className="input" value={addressForm.city} onChange={e => setAddressForm(f => ({ ...f, city: e.target.value }))} /></div>
                <div className="input-group"><label>PIN Code <span style={{ color: theme.error }}>*</span></label><input className="input" inputMode="numeric" placeholder="625001" value={addressForm.pin} onChange={e => setAddressForm(f => ({ ...f, pin: e.target.value }))} /></div>
                <label style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: theme.textMuted, marginBottom: 14 }}><input type="checkbox" checked={addressForm.is_default} onChange={e => setAddressForm(f => ({ ...f, is_default: e.target.checked }))} /> Set as default delivery address</label>
                <div style={{ gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" }}><button className="btn btn-primary" onClick={saveAddress}>Save Address</button></div>
              </div>
              {addresses.length > 0 && <div className="address-list">{addresses.map(address => <div className="saved-address-card" key={address.id}>
                <div style={{ display: "flex", justifyContent: "space-between", gap: 8, marginBottom: 10 }}><strong>{address.label || "Saved address"}</strong>{address.is_default ? <span className="badge badge-success">Default</span> : null}</div>
                <div style={{ color: theme.textMuted, fontSize: 14, lineHeight: 1.5 }}>{address.address}<br />{address.city} {address.pin}<br />{address.phone}</div>
                <button className="btn btn-outline btn-sm" style={{ marginTop: 14 }} onClick={() => deleteAddress(address.id)}>Remove</button>
              </div>)}</div>}
            </>}
          </div>
        </div>
        
        {/* Cancel Order Modal */}
        {cancelModal.show && (
          <div className="modal-overlay" onClick={() => !loadingCancel && setCancelModal({ show: false, orderId: null, reason: '' })}>
            <div className="modal" onClick={e => e.stopPropagation()}>
              <div className="modal-header">
                <span className="modal-title">Cancel Order #{cancelModal.orderId}</span>
                <button 
                  className="btn btn-outline btn-sm" 
                  onClick={() => setCancelModal({ show: false, orderId: null, reason: '' })}
                  disabled={loadingCancel}
                >
                  ✕ Close
                </button>
              </div>
              <div style={{ marginBottom: 20 }}>
                <p style={{ color: theme.textMuted, marginBottom: 16 }}>
                  Are you sure you want to cancel this order? This action cannot be undone.
                </p>
                <div className="input-group">
                  <label>Reason for Cancellation *</label>
                  <textarea 
                    className="input"
                    rows="4"
                    placeholder="Please tell us why you're cancelling this order..."
                    value={cancelModal.reason}
                    onChange={(e) => setCancelModal(prev => ({ ...prev, reason: e.target.value }))}
                    disabled={loadingCancel}
                    style={{ resize: 'vertical', minHeight: 80 }}
                  />
                </div>
              </div>
              <div style={{ display: 'flex', gap: 12 }}>
                <button 
                  className="btn btn-outline" 
                  style={{ flex: 1 }} 
                  onClick={() => setCancelModal({ show: false, orderId: null, reason: '' })}
                  disabled={loadingCancel}
                >
                  Keep Order
                </button>
                <button 
                  className="btn btn-danger" 
                  style={{ flex: 1 }} 
                  onClick={handleCancelOrder}
                  disabled={loadingCancel || !cancelModal.reason.trim()}
                >
                  {loadingCancel ? 'Cancelling...' : 'Confirm Cancellation'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SUCCESS PAGE ──────────────────────────────────────────────────────────
function SuccessPage({ orderId, onNav }) {
  return (
    <div className="page">
      <div className="container" style={{ paddingTop: 80, paddingBottom: 80 }}>
        <div style={{ maxWidth: 480, margin: "0 auto", textAlign: "center", background: "#fff", borderRadius: 24, padding: 48, border: `1px solid ${theme.border}` }}>
          <div style={{ fontSize: 80, marginBottom: 20 }}>🎉</div>
          <h2 style={{ fontFamily: "Raleway, sans-serif", fontSize: 28, fontWeight: 800, color: theme.primary, marginBottom: 12 }}>Order Placed!</h2>
          <p style={{ color: theme.textMuted, marginBottom: 8 }}>Your order has been confirmed.</p>
          <div style={{ background: theme.bg, borderRadius: 12, padding: "12px 20px", display: "inline-block", marginBottom: 28, fontWeight: 800, color: theme.primary, fontSize: 15 }}>Order ID: {orderId}</div>
          <p style={{ color: theme.textMuted, fontSize: 14, marginBottom: 28 }}>You'll receive a confirmation soon. Our team will deliver your aquatic companions with care! 🐠</p>
          <div style={{ display: "flex", gap: 12, justifyContent: "center" }}>
            <button className="btn btn-primary" onClick={() => onNav("account")}>View Orders</button>
            <button className="btn btn-outline" onClick={() => onNav("home")}>Continue Shopping</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ADMIN DASHBOARD ─────────────────────────────────────────────────────
const formatNumber = (value) => Number(value || 0).toLocaleString("en-IN");
const formatCurrency = (value) => `₹${Math.round(Number(value || 0)).toLocaleString("en-IN")}`;

function AnalyticsTooltip({ active, payload, label }) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div style={{ background: '#fff', border: `1px solid ${theme.border}`, borderRadius: 8, padding: '8px 10px', boxShadow: '0 8px 24px rgba(13,71,161,0.12)' }}>
      <div style={{ fontSize: 12, color: theme.textMuted, marginBottom: 4 }}>{label}</div>
      {payload.map(item => (
        <div key={item.dataKey} style={{ color: item.color, fontWeight: 800, fontSize: 13 }}>
          {item.name}: {item.dataKey === 'revenue' ? formatCurrency(item.value) : formatNumber(item.value)}
        </div>
      ))}
    </div>
  );
}

function MetricWidget({ label, value, sub, accent }) {
  return (
    <div className="card" style={{ padding: 16, minHeight: 112, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
        <div style={{ color: theme.textMuted, fontSize: 13, fontWeight: 800, textTransform: 'uppercase' }}>{label}</div>
        <div style={{ width: 10, height: 10, borderRadius: 10, background: accent }} />
      </div>
      <div style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 26, color: theme.text, marginTop: 12 }}>{value}</div>
      <div style={{ color: theme.textMuted, fontSize: 13, marginTop: 4 }}>{sub}</div>
    </div>
  );
}

function ChartPanel({ title, subtitle, children }) {
  return (
    <div className="card" style={{ padding: 16, minHeight: 330 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', marginBottom: 14 }}>
        <div>
          <div style={{ fontFamily: 'Raleway, sans-serif', fontWeight: 800, fontSize: 17 }}>{title}</div>
          <div style={{ color: theme.textMuted, fontSize: 13, marginTop: 3 }}>{subtitle}</div>
        </div>
      </div>
      <div style={{ width: '100%', height: 250 }}>{children}</div>
    </div>
  );
}

function AnalyticsDashboard({ data, range, onRangeChange, loading }) {
  const totals = data?.totals || {};
  const revenueData = data?.revenue || [];
  const ordersData = data?.orders || [];
  const usersData = data?.users || [];
  const rangeLabel = range === '7d' ? 'Last 7 days' : range === '30d' ? 'Last 30 days' : 'All time';

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div>
          <h2 className="section-title">Analytics</h2>
          <div className="section-sub">{loading ? 'Loading dashboard metrics...' : `${rangeLabel} chart view`}</div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {[
            ['7d', 'Last 7 days'],
            ['30d', 'Last 30 days'],
            ['all', 'All time'],
          ].map(([key, label]) => (
            <button key={key} className={`btn btn-sm ${range === key ? 'btn-primary' : 'btn-outline'}`} onClick={() => onRangeChange(key)}>
              {label}
            </button>
          ))}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginTop: 16 }}>
        <MetricWidget label="Total Users" value={formatNumber(totals.totalUsers)} sub="Registered accounts" accent={theme.primary} />
        <MetricWidget label="Total Products" value={formatNumber(totals.totalProducts)} sub="Catalog items" accent={theme.accent} />
        <MetricWidget label="Total Orders" value={formatNumber(totals.totalOrders)} sub="Orders placed" accent={theme.warning} />
        <MetricWidget label="Total Revenue" value={formatCurrency(totals.totalRevenue)} sub="All-time sales" accent={theme.success} />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', gap: 16, marginTop: 16 }}>
        <ChartPanel title="Revenue Chart" subtitle={rangeLabel}>
          <ResponsiveContainer>
            <AreaChart data={revenueData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={theme.primary} stopOpacity={0.35} />
                  <stop offset="95%" stopColor={theme.primary} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={theme.border} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.textMuted }} minTickGap={18} />
              <YAxis tick={{ fontSize: 11, fill: theme.textMuted }} width={56} tickFormatter={value => `₹${Number(value || 0)}`} />
              <Tooltip content={<AnalyticsTooltip />} />
              <Area type="monotone" dataKey="revenue" name="Revenue" stroke={theme.primary} fill="url(#revenueFill)" strokeWidth={3} />
            </AreaChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="Orders Chart" subtitle={rangeLabel}>
          <ResponsiveContainer>
            <BarChart data={ordersData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={theme.border} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.textMuted }} minTickGap={18} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: theme.textMuted }} width={38} />
              <Tooltip content={<AnalyticsTooltip />} />
              <Bar dataKey="orders" name="Orders" fill={theme.accent} radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </ChartPanel>

        <ChartPanel title="User Growth Chart" subtitle={rangeLabel}>
          <ResponsiveContainer>
            <LineChart data={usersData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
              <CartesianGrid stroke={theme.border} vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: theme.textMuted }} minTickGap={18} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: theme.textMuted }} width={38} />
              <Tooltip content={<AnalyticsTooltip />} />
              <Line type="monotone" dataKey="users" name="Users" stroke={theme.success} strokeWidth={3} dot={{ r: 2 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        </ChartPanel>
      </div>
    </div>
  );
}

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('AquaPets UI error:', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="page">
          <div className="container" style={{ paddingTop: 80 }}>
            <div className="empty-state">
              <div className="icon">!</div>
              <h3>Something went wrong</h3>
              <p>Please refresh the page or try again in a moment.</p>
              <button className="btn btn-primary" onClick={() => window.location.reload()}>Reload</button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

function AdminPage({ onNav }) {
  const [tab, setTab] = useState('overview');
  const [overview, setOverview] = useState(null);
  const [users, setUsers] = useState([]);
  const [orders, setOrders] = useState([]);
  const [products, setProducts] = useState([]);
  const [uploadProgress, setUploadProgress] = useState({});
  const [analytics, setAnalytics] = useState({});
  const [analyticsRange, setAnalyticsRange] = useState('7d');
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [productEditor, setProductEditor] = useState(null);
  const [productError, setProductError] = useState('');
  const headers = { 'Content-Type': 'application/json' };

  const fetchAnalytics = async (range = analyticsRange) => {
    setAnalyticsLoading(true);
    try {
      const res = await apiFetch(`/api/admin/analytics/dashboard?range=${range}`, { headers });
      if (res.ok) setAnalytics(await res.json());
    } catch (e) {
      console.warn('Analytics fetch error', e);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const [ov, us, od, pr, an, ct] = await Promise.all([
          apiFetch('/api/admin/overview', { headers }),
          apiFetch('/api/admin/users', { headers }),
          apiFetch('/api/admin/orders', { headers }),
          apiFetch('/api/products'),
          apiFetch(`/api/admin/analytics/dashboard?range=${analyticsRange}`, { headers }),
          apiFetch('/api/admin/contacts', { headers }),
        ]);
        if (ov.ok) setOverview(await ov.json());
        if (us.ok) setUsers(await us.json());
        if (od.ok) setOrders(await od.json());
        if (pr.ok) setProducts(await pr.json());
        if (an.ok) setAnalytics(await an.json());
        if (ct.ok) setContacts(await ct.json());
      } catch (e) { console.warn('Admin fetch error', e); }
    })();
  }, [analyticsRange]);

  useEffect(() => {
    fetchAnalytics(analyticsRange);
  }, [analyticsRange]);

  const refresh = async () => {
    try {
      const [ov, us, od, pr] = await Promise.all([
        apiFetch('/api/admin/overview', { headers }),
        apiFetch('/api/admin/users', { headers }),
        apiFetch('/api/admin/orders', { headers }),
        apiFetch('/api/products'),
        apiFetch('/api/admin/contacts', { headers }),
      ]);
      if (ov.ok) setOverview(await ov.json());
      if (us.ok) setUsers(await us.json());
      if (od.ok) setOrders(await od.json());
      if (pr.ok) setProducts(await pr.json());
      fetchAnalytics(analyticsRange);
      const ct = await (await apiFetch('/api/admin/contacts', { headers })).json();
      setContacts(Array.isArray(ct) ? ct : []);
    } catch (e) { console.warn(e); }
  };

  const fetchContacts = async () => {
    try {
      const res = await apiFetch('/api/admin/contacts', { headers });
      if (res.ok) setContacts(await res.json());
    } catch (e) { console.warn('fetchContacts', e); }
  };

  const toggleUser = async (id, enable) => {
    await apiFetch(`/api/admin/users/${id}/${enable ? 'enable' : 'disable'}`, { method: 'PUT', headers });
    refresh();
  };

  const delUser = async (id) => { if (!confirm('Delete user?')) return; await apiFetch(`/api/admin/users/${id}`, { method: 'DELETE', headers }); refresh(); };

  const updateOrderStatus = async (orderId, status) => {
    const id = orderId.replace(/^AQ/, '') ;
    await apiFetch(`/api/admin/orders/${id}/status`, { method: 'PUT', headers, body: JSON.stringify({ status }) });
    refresh();
  };

  const openProductEditor = (product = null) => {
    setProductError('');
    setProductEditor(product ? { id: product.id, name: product.name || '', category: product.category || '', price: product.price ?? '', stock: product.stock ?? 0, rating: product.rating ?? 0, emoji: product.emoji || '', description: product.description || '', tag: product.tag || '' } : { name: '', category: '', price: '', stock: 0, rating: 0, emoji: '', description: '', tag: '' });
  };

  const saveProduct = async () => {
    if (!productEditor.name.trim() || !productEditor.category.trim() || productEditor.price === '' || Number.isNaN(Number(productEditor.price)) || Number(productEditor.price) < 0) {
      return setProductError('Name, category and a valid non-negative price are required.');
    }
    const payload = { ...productEditor, name: productEditor.name.trim(), category: productEditor.category.trim(), price: Number(productEditor.price), stock: Number(productEditor.stock || 0), rating: Number(productEditor.rating || 0), tag: productEditor.tag.trim() || null };
    const url = productEditor.id ? `/api/admin/products/${productEditor.id}` : '/api/admin/products';
    try {
      const res = await apiFetch(url, { method: productEditor.id ? 'PUT' : 'POST', headers, body: JSON.stringify(payload) });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return setProductError(data.error || 'Unable to save product.');
      setProductEditor(null);
      refresh();
    } catch (e) { setProductError('Network error. Please try again.'); }
  };

  return (
    <div className="page">
      <div className="container" style={{ paddingTop: 32, paddingBottom: 48 }}>
        <div style={{ display: 'flex', gap: 12, marginBottom: 18 }}>
          {['overview','products','orders','users','analytics','contacts'].map(t => (
            <button key={t} className={`btn ${tab===t? 'btn-primary':''}`} onClick={() => setTab(t)}>{t.toUpperCase()}</button>
          ))}
          <button className="btn btn-outline" style={{ marginLeft: 'auto' }} onClick={() => onNav('home')}>← Back</button>
        </div>

        {tab === 'overview' && (
          <div>
            <h2 className="section-title">Admin Overview</h2>
            <div className="section-sub">Quick store metrics</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12, marginTop: 12 }}>
              {overview ? [
                ['Total Users', overview.totalUsers],
                ['Total Orders', overview.totalOrders],
                ['Total Revenue', `₹${Math.round(overview.totalRevenue).toLocaleString()}`],
                ['Total Products', overview.totalProducts],
                ['Pending Orders', overview.pendingOrders],
              ].map(([k,v]) => (
                <div key={k} className="card" style={{ padding: 18 }}>
                  <div style={{ fontSize: 13, color: theme.textMuted, fontWeight: 700, marginBottom: 8 }}>{k}</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{v}</div>
                </div>
              )) : <div>Loading overview…</div>}
            </div>
          </div>
        )}

        {tab === 'products' && (
          <div>
            <h2 className="section-title">Products</h2>
            <div className="section-sub">Manage catalog (uses existing admin APIs)</div>
            <div style={{ marginTop: 12 }}>
              {products.map(p => (
                <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${theme.border}`, padding: 12, borderRadius: 10, marginBottom: 8 }}>
                  <div style={{ width: 92, height: 64, overflow: 'hidden', borderRadius: 8, background: theme.bgCard, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <ProductImage product={p} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800 }}>{p.name}</div>
                    <div style={{ color: theme.textMuted, fontSize: 13 }}>{p.category} • ₹{p.price}</div>
                    {uploadProgress[p.id] ? <div style={{ marginTop: 6, fontSize: 13 }}>Uploading: {uploadProgress[p.id]}%</div> : null}
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <button className="btn btn-sm" onClick={() => openProductEditor(p)}>Edit</button>
                    <button className="btn btn-sm" onClick={() => {
                      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/png,image/jpeg,image/webp'; inp.onchange = async (e) => {
                        const file = e.target.files && e.target.files[0]; if (!file) return; try {
                          setUploadProgress(prev => ({ ...prev, [p.id]: 0 }));
                          const url = apiUrl(`/api/admin/products/${p.id}/image`);
                          try {
                              await new Promise((resolve, reject) => {
                                const xhr = new XMLHttpRequest();
                                xhr.open('POST', url);
                                xhr.withCredentials = true;
                                xhr.upload.onprogress = (ev) => { if (ev.lengthComputable) setUploadProgress(prev => ({ ...prev, [p.id]: Math.round(ev.loaded / ev.total * 100) })); };
                                xhr.onload = () => { if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.responseText); else reject(xhr.responseText || xhr.statusText); };
                                xhr.onerror = () => reject('Network error');
                                const fd = new FormData(); fd.append('images', file);
                                xhr.send(fd);
                              });
                              await refresh();
                              setUploadProgress(prev => ({ ...prev, [p.id]: 0 }));
                          } catch (err) { alert('Upload failed: ' + err); }
                        } catch (e) { alert('Upload error: ' + e.message || e); setUploadProgress(prev => ({ ...prev, [p.id]: 0 })); }
                      };
                      inp.click();
                    }}>Upload Image</button>
                    <button className="btn btn-sm" onClick={async ()=>{ if (!confirm('Delete image?')) return; try { const res = await apiFetch(`/api/admin/products/${p.id}/image`, { method: 'DELETE' }); if (res.ok) refresh(); else alert('Failed to delete image'); } catch(e){ alert('Error deleting image'); } }}>Delete Image</button>
                    <button className="btn btn-danger btn-sm" onClick={async ()=>{ if (!confirm('Delete product?')) return; await apiFetch(`/api/admin/products/${p.id}`, { method: 'DELETE', headers }); refresh(); }}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={() => openProductEditor()}>+ Add Product</button>
            </div>
          </div>
        )}

        {productEditor && <div className="modal-overlay" onClick={() => setProductEditor(null)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header"><span className="modal-title">{productEditor.id ? 'Edit Product' : 'Add Product'}</span><button className="btn btn-outline btn-sm" onClick={() => setProductEditor(null)}>✕ Close</button></div>
            <p className="section-sub" style={{ marginBottom: 18 }}>Enter product details below. Name, category and price are required.</p>
            {productError && <div className="alert alert-error">⚠️ {productError}</div>}
            <div className="input-group"><label>Product Name *</label><input className="input" autoFocus value={productEditor.name} onChange={e => setProductEditor(p => ({ ...p, name: e.target.value }))} /></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div className="input-group"><label>Category *</label><input className="input" placeholder="Fish, Tanks, Food" value={productEditor.category} onChange={e => setProductEditor(p => ({ ...p, category: e.target.value }))} /></div>
              <div className="input-group"><label>Price *</label><input className="input" type="number" min="0" step="0.01" value={productEditor.price} onChange={e => setProductEditor(p => ({ ...p, price: e.target.value }))} /></div>
              <div className="input-group"><label>Stock</label><input className="input" type="number" min="0" value={productEditor.stock} onChange={e => setProductEditor(p => ({ ...p, stock: e.target.value }))} /></div>
              <div className="input-group"><label>Rating</label><input className="input" type="number" min="0" max="5" step="0.1" value={productEditor.rating} onChange={e => setProductEditor(p => ({ ...p, rating: e.target.value }))} /></div>
            </div>
            <div className="input-group"><label>Emoji</label><input className="input" placeholder="🐠" value={productEditor.emoji} onChange={e => setProductEditor(p => ({ ...p, emoji: e.target.value }))} /></div>
            <div className="input-group"><label>Description</label><textarea className="input" rows={3} value={productEditor.description} onChange={e => setProductEditor(p => ({ ...p, description: e.target.value }))} /></div>
            <div className="input-group"><label>Tag</label><input className="input" placeholder="Premium, New" value={productEditor.tag} onChange={e => setProductEditor(p => ({ ...p, tag: e.target.value }))} /></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}><button className="btn btn-outline" onClick={() => setProductEditor(null)}>Cancel</button><button className="btn btn-primary" onClick={saveProduct}>{productEditor.id ? 'Save Changes' : 'Add Product'}</button></div>
          </div>
        </div>}

        {tab === 'orders' && (
          <div>
            <h2 className="section-title">Orders</h2>
            <div className="section-sub">View and update order status</div>
            <div style={{ marginTop: 12 }}>
              {orders.map(o => (
                <div key={o.id} style={{ border: `1px solid ${theme.border}`, borderRadius: 12, padding: 12, marginBottom: 10 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div><strong>{o.id}</strong> • {o.user_name} • ₹{o.total}</div>
                    <div>
                      <span className={`badge ${o.status === 'Cancelled' ? 'badge-premium' : 'badge-primary'}`}>
                        {o.status}
                      </span>
                    </div>
                  </div>
                  <div style={{ color: theme.textMuted, fontSize: 13, marginBottom: 8 }}>
                    {o.items.map(i=> `${i.emoji} ${i.name}×${i.qty}`).join(' • ')}
                  </div>
                  
                  {/* Display cancellation info if order is cancelled */}
                  {o.status === 'Cancelled' && o.cancellation_reason && (
                    <div style={{ background: theme.accentLight, border: `1px solid ${theme.border}`, borderRadius: 8, padding: 10, marginBottom: 10, fontSize: 13 }}>
                      <div style={{ fontWeight: 700, color: theme.primary, marginBottom: 4 }}>
                        ❌ Cancellation Reason:
                      </div>
                      <div style={{ color: theme.textMuted }}>{o.cancellation_reason}</div>
                      {o.cancelled_at && (
                        <div style={{ fontSize: 12, color: theme.textMuted, marginTop: 4 }}>
                          Cancelled on: {new Date(o.cancelled_at).toLocaleString('en-IN')}
                        </div>
                      )}
                    </div>
                  )}
                  
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['Pending','Processing','Shipped','Delivered','Cancelled'].map(s => 
                      <button 
                        key={s} 
                        className={`btn btn-sm ${o.status === s ? 'btn-primary' : ''}`}
                        onClick={()=> updateOrderStatus(o.id, s)}
                      >
                        {s}
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'users' && (
          <div>
            <h2 className="section-title">Users</h2>
            <div className="section-sub">Manage user accounts</div>
            <div style={{ marginTop: 12 }}>
              {users.map(u => (
                <div key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 12, border: `1px solid ${theme.border}`, padding: 12, borderRadius: 10, marginBottom: 8 }}>
                  <div style={{ width: 44, height: 44, borderRadius: 22, background: theme.primary, color: '#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800 }}>{u.avatar || u.name.slice(0,2).toUpperCase()}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 800 }}>{u.name} <span style={{ color: theme.textMuted, fontSize: 12 }}>({u.role})</span></div>
                    <div style={{ color: theme.textMuted, fontSize: 13 }}>{u.email}</div>
                  </div>
                  <div style={{ display:'flex', gap:8 }}>
                    {!u.disabled ? <button className="btn btn-sm" onClick={()=> toggleUser(u.id, false)}>Disable</button> : <button className="btn btn-sm" onClick={()=> toggleUser(u.id, true)}>Enable</button>}
                    <button className="btn btn-danger btn-sm" onClick={()=> delUser(u.id)}>Delete</button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === 'analytics' && (
          <AnalyticsDashboard
            data={analytics}
            range={analyticsRange}
            onRangeChange={setAnalyticsRange}
            loading={analyticsLoading}
          />
        )}

        {tab === 'analytics-legacy' && (
          <div>
            <h2 className="section-title">Analytics</h2>
            <div className="section-sub">Revenue & sales statistics</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginTop:12 }}>
              <div className="card" style={{ padding: 12 }}>
                <div style={{ color: theme.textMuted, fontWeight:700 }}>Total Revenue</div>
                <div style={{ fontSize:20, fontWeight:800 }}>₹{Math.round(analytics.totalRevenue||0).toLocaleString()}</div>
                <div style={{ color: theme.textMuted, marginTop:6 }}>Orders: {analytics.totalOrders||0} • Avg: ₹{Math.round(analytics.avgOrder||0)}</div>
              </div>
              <div className="card" style={{ padding:12 }}>
                <div style={{ color: theme.textMuted, fontWeight:700 }}>Top Products</div>
                <div style={{ marginTop:8 }}>
                  {/* simple list by fetching top-products on demand */}
                  <button className="btn btn-sm" onClick={async ()=>{ const res = await apiFetch('/api/admin/analytics/top-products?limit=6',{ headers }); if (res.ok) { const data = await res.json(); alert(data.map(d=> `${d.name} ×${d.qty}`).join('\n')); } }}>Show Top 6</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'contacts' && (
          <div>
            <h2 className="section-title">Contact Messages</h2>
            <div className="section-sub">Messages submitted via Contact Us</div>
            <div style={{ marginTop: 12 }}>
              {contacts.length === 0 ? <div className="empty-state"><div className="icon">✉️</div><h3>No messages</h3><p>No contact messages found.</p></div>
                : contacts.map(m => (
                  <div key={m.id} style={{ border: `1px solid ${theme.border}`, borderRadius: 12, padding: 12, marginBottom: 10 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <div><strong>{m.name}</strong> • {m.email} • {m.phone}</div>
                      <div><span className={`badge ${m.is_replied ? 'badge-success' : 'badge-primary'}`}>{m.is_replied ? 'Replied' : 'New'}</span></div>
                    </div>
                    <div style={{ color: theme.textMuted, marginTop: 8 }}>Submitted: {new Date(m.created_at).toLocaleString()}</div>
                    <div style={{ marginTop: 8, fontSize: 14 }}>
                      <button className="btn btn-sm" onClick={async () => { const res = await apiFetch(`/api/admin/contacts/${m.id}`, { headers }); if (res.ok) { const full = await res.json(); alert(full.message + (full.reply ? '\n\nReply: ' + full.reply : '')); } }}>View</button>
                      <button className="btn btn-sm" onClick={async () => { const reply = prompt('Reply message (optional)'); if (reply === null) return; await apiFetch(`/api/admin/contacts/${m.id}/reply`, { method: 'PUT', headers, body: JSON.stringify({ reply }) }); fetchContacts(); }}>Mark Replied</button>
                      <button className="btn btn-danger btn-sm" onClick={async () => { if (!confirm('Delete message?')) return; await apiFetch(`/api/admin/contacts/${m.id}`, { method: 'DELETE', headers }); fetchContacts(); }}>Delete</button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── APP ROOT ──────────────────────────────────────────────────────────────
export default function App() {
  // Get initial page from localStorage or URL hash, default to "home"
  const getInitialPage = () => {
    // Check URL hash first (e.g., #cart, #account)
    const hash = window.location.hash.slice(1); // Remove the '#'
    if (hash) return hash;
    
    // Check localStorage
    const savedPage = localStorage.getItem('currentPage');
    return savedPage || 'home';
  };
  
  const [page, setPage] = useState(getInitialPage());
  const [user, setUser] = useState(null);
  const [cart, setCart] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [searchQ, setSearchQ] = useState("");
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeCat, setActiveCat] = useState("all");
  const [priceMin, setPriceMin] = useState("");
  const [priceMax, setPriceMax] = useState("");
  const [availability, setAvailability] = useState("any");
  const [sortBy, setSortBy] = useState("");
  const [viewProduct, setViewProduct] = useState(null);
  const [toast, setToast] = useState(null);
  const [orderTotal, setOrderTotal] = useState(0);
  const [buyNowCheckout, setBuyNowCheckout] = useState(false);
  const [lastOrderId, setLastOrderId] = useState(null);
  const [products, setProducts] = useState(PRODUCTS);
  const [totalProductCount, setTotalProductCount] = useState(PRODUCTS.length);
  const [productsLoading, setProductsLoading] = useState(false);

  // Fetch products from backend when on home or on mount; fall back to static PRODUCTS
  const fetchProducts = async (mode = 'all') => {
    setProductsLoading(true);
    const path = mode === 'best-sellers' ? '/api/products/best-sellers' : '/api/products';
    try {
        const res = await apiFetch(path);
        const text = await res.text();
        let data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (!res.ok || !Array.isArray(data)) throw new Error(`Server ${res.status}`);
        setProducts(data);
        if (mode === 'all') setTotalProductCount(data.length);
    } catch (e) { console.warn('Failed to fetch products:', e.message || String(e)); }
    setProductsLoading(false);
  };

  useEffect(() => {
    if (activeCat === 'best-sellers') {
      fetchProducts('best-sellers');
      return;
    }
    fetchProducts('all');
    
    // Listen for hash changes (browser back/forward)
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash && hash !== page) {
        setPage(hash);
        localStorage.setItem('currentPage', hash);
      }
    };
    
    window.addEventListener('hashchange', handleHashChange);
    
    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, [page]);

  const showToast = (msg) => { setToast(msg); };
  const handleViewProduct = (product) => {
    setViewProduct(product);
    nav("product");
  };
  const handleCloseProduct = () => {
    setViewProduct(null);
    nav("home");
  };
  const nav = (p) => { 
    setPage(p); 
    setSearchQ(""); 
    window.scrollTo(0, 0); 
    // Save current page to localStorage
    localStorage.setItem('currentPage', p);
    // Update URL hash without triggering reload
    window.history.replaceState(null, '', `#${p}`);
  };
  // On app start, check for existing JWT token and fetch profile
  useEffect(() => {
    const init = async () => {
      // Restore the session from the httpOnly refresh/access cookies.
      try {
        const rres = await apiFetch('/api/auth/refresh', { method: 'POST' });
        if (rres.ok) {
          await rres.json();
        }
      } catch (e) { /* ignore */ }

      try {
        const res = await apiFetch("/api/user/profile");
        if (!res.ok) return;
        const prof = await res.json();
        setUser(prof);
        setCart(DB.getCart(prof.email));
        // fetch wishlist for authenticated user
        try {
          const wres = await apiFetch('/api/wishlist');
          if (wres.ok) {
            const w = await wres.json();
            setWishlist(w.map(p => String(p.id)));
          }
        } catch (e) { /* ignore */ }
      } catch (e) { /* ignore */ }
    };
    init();
  }, []);

  const handleLogin = (u) => { setUser(u); setCart(DB.getCart(u.email)); nav("home"); showToast(`Welcome back, ${u.name.split(" ")[0]}! 🐠`); };
  const handleLogout = async () => {
    try { await apiFetch('/api/auth/logout', { method: 'POST' }); } catch (e) { /* clear local session even if request fails */ }
    setUser(null); setCart([]); nav("home"); showToast("Signed out successfully.");
  };
  const handleUpdateUser = (u) => { setUser(u); DB.saveUser(u); };

  const addToCart = (product) => {
    if (!user) { nav("login"); return; }
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      const updated = existing ? prev.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i) : [...prev, { ...product, qty: 1 }];
      DB.saveCart(user.email, updated);
      return updated;
    });
    showToast(`${product.emoji} ${product.name} added to cart!`);
  };

  const refreshWishlist = async () => {
      try {
      const res = await apiFetch('/api/wishlist');
      if (!res.ok) return setWishlist([]);
      const rows = await res.json();
      setWishlist(rows.map(p => String(p.id)));
    } catch (e) { setWishlist([]); }
  };

  const toggleWishlist = async (product) => {
    if (!user) { setPage('login'); return; }
    const pid = product.id;
    const isW = wishlist.includes(String(pid));
    try {
        if (!isW) {
        const res = await apiFetch('/api/wishlist', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ productId: pid }) });
        if (res.ok) { setWishlist(prev => [...prev, String(pid)]); showToast('Added to wishlist'); }
      } else {
        const res = await apiFetch(`/api/wishlist/${pid}`, { method: 'DELETE' });
        if (res.ok) { setWishlist(prev => prev.filter(id => id !== String(pid))); showToast('Removed from wishlist'); }
      }
    } catch (e) { showToast('Network error'); }
  };

  const updateQty = (id, qty) => {
    if (qty < 1) return removeFromCart(id);
    setCart(prev => { const updated = prev.map(i => i.id === id ? { ...i, qty } : i); DB.saveCart(user.email, updated); return updated; });
  };

  const removeFromCart = (id) => {
    setCart(prev => { const updated = prev.filter(i => i.id !== id); DB.saveCart(user.email, updated); return updated; });
  };

  const handleCheckout = (total) => { setBuyNowCheckout(false); setOrderTotal(total); nav("payment"); };
  const buyNow = (product) => {
    if (!user) {
      nav("login");
      return;
    }
    const singleItem = { ...product, qty: 1 };
    setCart([singleItem]);
    if (user) DB.saveCart(user.email, [singleItem]);
    setBuyNowCheckout(true);
    setOrderTotal(Number(product.price) || 0);
    nav("payment");
    showToast(`Enter delivery address for ${product.emoji || '🐠'} ${product.name}.`);
  };
  const handlePaySuccess = (orderId) => { 
    setLastOrderId(orderId); 
    setCart([]); 
    if (user) DB.saveCart(user.email, []); 
    // Also clear localStorage cart
    localStorage.removeItem(`aq_cart_${user.email}`);
    nav("success"); 
  };

  return (
    <ErrorBoundary>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {page !== "login" && (
        <Navbar
          user={user}
          cart={cart}
          onNav={nav}
          onSearch={setSearchQ}
          searchQ={searchQ}
          menuOpen={menuOpen}
          setMenuOpen={setMenuOpen}
          activeCat={activeCat}
          setActiveCat={setActiveCat}
          priceMin={priceMin}
          setPriceMin={setPriceMin}
          priceMax={priceMax}
          setPriceMax={setPriceMax}
          availability={availability}
          setAvailability={setAvailability}
          sortBy={sortBy}
          setSortBy={setSortBy}
        />
      )}
      {page === "home" && <HomePage products={products} totalProductCount={totalProductCount} loading={productsLoading} onAddCart={addToCart} onBuyNow={buyNow} onView={handleViewProduct} searchQ={searchQ} onToggleWish={toggleWishlist} wishlist={wishlist} user={user} onAuth={() => setPage('login')} onSignupAuth={() => { localStorage.setItem('auth_tab','signup'); setPage('login'); }} activeCat={activeCat} setActiveCat={setActiveCat} priceMin={priceMin} setPriceMin={setPriceMin} priceMax={priceMax} setPriceMax={setPriceMax} availability={availability} setAvailability={setAvailability} sortBy={sortBy} setSortBy={setSortBy} />}
      {page === "admin" && <AdminPage onNav={nav} />}
      {page === "contact" && <ContactPage onNav={nav} user={user} />}
      {page === "login" && <AuthPage onLogin={handleLogin} onSignup={handleLogin} onNav={nav} />}
      {page === "cart" && <CartPage cart={cart} onUpdateQty={updateQty} onRemove={removeFromCart} onCheckout={handleCheckout} user={user} onNav={nav} onBuyNow={buyNow} />}
      {page === "wishlist" && <WishlistPage user={user} wishlist={wishlist} onNav={nav} onAddCart={addToCart} onBuyNow={buyNow} onRemove={toggleWishlist} />}
      {page === "payment" && <PaymentPage total={orderTotal} user={user} cart={cart} onSuccess={handlePaySuccess} onNav={nav} startAtAddress={buyNowCheckout} />}
      {page === "account" && <AccountPage user={user} onLogout={handleLogout} onNav={nav} onUpdateUser={handleUpdateUser} />}
      {page === "success" && <SuccessPage orderId={lastOrderId} onNav={nav} />}
      {page === "product" && viewProduct && <ProductDetailPage product={viewProduct} onBack={handleCloseProduct} onAddCart={addToCart} onBuyNow={buyNow} onToggleWish={toggleWishlist} wished={wishlist.includes(String(viewProduct.id))} />}
      {toast && <Toast msg={toast} onClose={() => setToast(null)} />}
    </ErrorBoundary>
  );
}
