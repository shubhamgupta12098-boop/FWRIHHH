const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { URL } = require('url');
let MongoClient=null, GridFSBucket=null, ObjectId=null;
try { ({ MongoClient, GridFSBucket, ObjectId } = require('mongodb')); } catch { /* Local Mode runs with Node.js built-ins only. */ }

const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const out = {};
  for (const rawLine of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const idx = line.indexOf('=');
    if (idx < 1) continue;
    const key = line.slice(0, idx).trim();
    let value = line.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    out[key] = value;
  }
  return out;
}

const localEnv = loadEnvFile(path.join(ROOT, '.env'));
const env = (key, fallback = '') => process.env[key] || localEnv[key] || fallback;
const PORT = Number(env('PORT', '3000'));
const GEMINI_API_KEY = env('GEMINI_API_KEY') || env('GOOGLE_API_KEY');
const GEMINI_TEXT_MODEL = env('GEMINI_TEXT_MODEL', 'gemini-2.5-flash-lite');
const GEMINI_API_VERSION = env('GEMINI_API_VERSION', 'v1beta');
const CLOUDFLARE_ACCOUNT_ID = env('CLOUDFLARE_ACCOUNT_ID');
const CLOUDFLARE_API_TOKEN = env('CLOUDFLARE_API_TOKEN');
const CLOUDFLARE_IMAGE_MODEL = env('CLOUDFLARE_IMAGE_MODEL', '@cf/black-forest-labs/flux-1-schnell');
const CLOUDFLARE_IMAGE_STEPS = Math.min(8, Math.max(1, Number(env('CLOUDFLARE_IMAGE_STEPS', '4')) || 4));
const FIREBASE_API_KEY = env('FIREBASE_API_KEY');
const MONGODB_URI = env('MONGODB_URI');
const MONGODB_DB_NAME = env('MONGODB_DB_NAME', 'foodwise');
const SESSION_SECRET = env('SESSION_SECRET');
const NODE_ENV = env('NODE_ENV', 'development');
const LOCAL_MODE = String(env('LOCAL_MODE', (!MONGODB_URI || !FIREBASE_API_KEY) ? 'true' : 'false')).toLowerCase() === 'true';
const LOCAL_STATE_FILE = path.join(ROOT, 'data', 'local-state.json');
const LOCAL_AUTH_FILE = path.join(ROOT, 'data', 'local-auth.json');
const LOCAL_LOGIN_EMAIL = env('LOCAL_LOGIN_EMAIL', 'local@foodwise.app').toLowerCase();
const LOCAL_LOGIN_PASSWORD = env('LOCAL_LOGIN_PASSWORD', 'foodwise123');
const LOCAL_USER_NAME = env('LOCAL_USER_NAME', 'Local FoodWise User');
const LOCAL_SESSION_TOKEN = 'local-mode-v21';

function localPasswordHash(password, salt) {
  return crypto.pbkdf2Sync(String(password), String(salt), 120000, 32, 'sha256').toString('hex');
}
function writeLocalAuth({ name, email, password }) {
  const salt = crypto.randomBytes(16).toString('hex');
  const rec = {
    version: 1,
    name: safeText(name || LOCAL_USER_NAME, 80) || LOCAL_USER_NAME,
    email: safeText(email || LOCAL_LOGIN_EMAIL, 160).toLowerCase(),
    salt,
    passwordHash: localPasswordHash(password || LOCAL_LOGIN_PASSWORD, salt),
    updatedAt: new Date().toISOString()
  };
  fs.mkdirSync(path.dirname(LOCAL_AUTH_FILE), { recursive: true });
  fs.writeFileSync(LOCAL_AUTH_FILE, JSON.stringify(rec, null, 2));
  return rec;
}
function readLocalAuth() {
  try {
    const rec = JSON.parse(fs.readFileSync(LOCAL_AUTH_FILE, 'utf8'));
    if (rec?.email && rec?.salt && rec?.passwordHash) return rec;
  } catch {}
  return writeLocalAuth({ name: LOCAL_USER_NAME, email: LOCAL_LOGIN_EMAIL, password: LOCAL_LOGIN_PASSWORD });
}
function localUser(rec = readLocalAuth()) {
  return { _id: 'local-user', id: 'local-user', name: rec.name || LOCAL_USER_NAME, email: rec.email || LOCAL_LOGIN_EMAIL };
}
function verifyLocalPassword(email, password) {
  const rec = readLocalAuth();
  if (String(email || '').trim().toLowerCase() !== String(rec.email || '').toLowerCase()) return false;
  const actual = Buffer.from(localPasswordHash(password, rec.salt), 'hex');
  const expected = Buffer.from(String(rec.passwordHash || ''), 'hex');
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}
let activeTextModel = GEMINI_TEXT_MODEL;
let activeImageModel = CLOUDFLARE_IMAGE_MODEL;

function day(offset = 0) {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

function seed() {
  return {
    version: 21,
    household: { name: 'Sharma Household', members: 4, currentServings: 4, budget: 9000, spent: 5240, veg: 'Mixed', allergies: 'Peanuts', theme: 'dark', notifications: true, weeklyGoal: 25, address: 'Home · Thane, Maharashtra', deliveryNote: '', memberProfiles: [
      { id: 1, name: 'Shubham', role: 'Admin', appetite: 'Regular', active: true },
      { id: 2, name: 'Mom', role: 'Adult', appetite: 'Regular', active: true },
      { id: 3, name: 'Dad', role: 'Adult', appetite: 'Regular', active: true },
      { id: 4, name: 'Family Member', role: 'Adult', appetite: 'Light', active: true }
    ] },
    mealServings: {},
    stats: { points: 1280, streak: 6, savedMoney: 860, savedKg: 7.4, co2: 18.6, water: 3200, level: 7 },
    inventory: [
      { id: 101, name: 'Spinach', emoji: '🥬', qty: '1 bunch', place: 'Fridge', category: 'Produce', purchase: day(-3), expiry: day(0), cost: 45 },
      { id: 102, name: 'Paneer', emoji: '🧀', qty: '300 g', place: 'Fridge', category: 'Dairy', purchase: day(-2), expiry: day(1), cost: 120 },
      { id: 103, name: 'Milk', emoji: '🥛', qty: '1 L', place: 'Fridge', category: 'Dairy', purchase: day(-1), expiry: day(2), cost: 68 },
      { id: 104, name: 'Tomatoes', emoji: '🍅', qty: '5 pcs', place: 'Fridge', category: 'Produce', purchase: day(-4), expiry: day(2), cost: 70 },
      { id: 105, name: 'Bread', emoji: '🍞', qty: '8 slices', place: 'Pantry', category: 'Bakery', purchase: day(-2), expiry: day(3), cost: 55 },
      { id: 106, name: 'Rice', emoji: '🍚', qty: '2 kg', place: 'Pantry', category: 'Grains', purchase: day(-14), expiry: day(90), cost: 180 },
      { id: 107, name: 'Frozen Peas', emoji: '🫛', qty: '500 g', place: 'Freezer', category: 'Frozen', purchase: day(-6), expiry: day(40), cost: 110 }
    ],
    consumed: [
      { id: 901, name: 'Curd', emoji: '🥣', qty: '200 g', place: 'Fridge', category: 'Dairy', purchase: day(-3), expiry: day(-1), cost: 35, consumedAt: new Date(Date.now()-86400000).toISOString(), consumedDate: day(-1) }
    ],
    leftovers: [
      { id: 201, name: 'Vegetable Pulao', emoji: '🍲', qty: '1 bowl', cooked: day(-1), useBy: day(0), status: 'active' },
      { id: 202, name: 'Dal Tadka', emoji: '🥣', qty: '2 bowls', cooked: day(0), useBy: day(2), status: 'active' }
    ],
    shopping: [
      { id: 301, name: 'Curd', qty: '500 g', category: 'Dairy', price: 55, done: false },
      { id: 302, name: 'Bananas', qty: '6 pcs', category: 'Produce', price: 60, done: false },
      { id: 303, name: 'Oats', qty: '1 pack', category: 'Grains', price: 180, done: true }
    ],
    waste: [
      { id: 401, date: day(-6), name: 'Cucumber', qty: '1 pc', reason: 'Forgot about food', cost: 20, avoidable: true },
      { id: 402, date: day(-3), name: 'Rice', qty: '0.2 kg', reason: 'Cooked too much', cost: 18, avoidable: true },
      { id: 403, date: day(-1), name: 'Banana peel', qty: '3 pcs', reason: 'Unavoidable', cost: 0, avoidable: false }
    ],
    meals: {},
    mealIngredients: {},
    savedRecipes: [1],
    recipes: [
      { id: 1, name: 'Paneer Tomato Toast', emoji: '🥪', time: 15, difficulty: 'Easy', type: 'Veg', uses: ['Paneer', 'Tomatoes', 'Bread'], missing: [], calories: 360 },
      { id: 2, name: 'Palak Paneer Rescue', emoji: '🥬', time: 25, difficulty: 'Easy', type: 'Veg', uses: ['Spinach', 'Paneer'], missing: ['Onion'], calories: 420 },
      { id: 3, name: 'Leftover Rice Bowl', emoji: '🍚', time: 12, difficulty: 'Easy', type: 'Veg', uses: ['Rice', 'Frozen Peas'], missing: ['Soy sauce'], calories: 390 },
      { id: 4, name: 'Creamy Tomato Pasta', emoji: '🍝', time: 22, difficulty: 'Medium', type: 'Veg', uses: ['Tomatoes', 'Milk'], missing: ['Pasta'], calories: 510 },
      { id: 5, name: 'Bread Pizza Bites', emoji: '🍕', time: 18, difficulty: 'Easy', type: 'Veg', uses: ['Bread', 'Tomatoes', 'Paneer'], missing: ['Capsicum'], calories: 440 }
    ],
    challenges: [
      { id: 1, title: 'Zero Waste Week', icon: '🌱', progress: 4, target: 7, reward: 250 },
      { id: 2, title: 'Eat Leftovers First', icon: '🍲', progress: 3, target: 5, reward: 150 },
      { id: 3, title: 'Smart Shopper', icon: '🛒', progress: 6, target: 10, reward: 200 }
    ],
    cart: [],
    orders: [],
    dailyEssentials: []
  };
}

let mongoClient = null;
let mongoDb = null;
let usersCol = null;
let statesCol = null;
let sessionsCol = null;
let imageFilesCol = null;
let imagesBucket = null;

function cookies(req) {
  return Object.fromEntries(String(req.headers.cookie || '').split(';').map(x => x.trim()).filter(Boolean).map(part => { const i = part.indexOf('='); return i < 0 ? [part, ''] : [part.slice(0, i), decodeURIComponent(part.slice(i + 1))]; }));
}
function sessionHash(token='') {
  const key = SESSION_SECRET || 'foodwise-dev-session-secret-change-me';
  return crypto.createHmac('sha256', key).update(String(token)).digest('hex');
}
function publicUser(user) {
  if (!user) return null;
  return { id: user._id || user.id, name: user.name || 'FoodWise User', email: user.email || '' };
}
function publicState(data) {
  if (!data || typeof data !== 'object') return data;
  const clone = { ...data };
  delete clone.auth;
  return clone;
}
function initialStateForUser(user = {}, options = {}) {
  const st = seed();
  delete st.auth;
  st.version = 21;
  const name = safeText(options.name || user.name || 'You', 80) || 'You';
  const members = Math.max(1, Math.min(20, Number(options.members || 1)));
  st.household = {
    ...st.household,
    name: safeText(options.householdName, 100) || `${name}'s Household`,
    members,
    currentServings: members,
    spent: 0,
    allergies: 'None',
    address: 'Home',
    memberProfiles: Array.from({ length: members }, (_, i) => ({ id: Date.now() + i, name: i === 0 ? name : `Member ${i + 1}`, role: i === 0 ? 'Admin' : 'Family', appetite: 'Regular', active: true }))
  };
  st.stats = { points: 0, streak: 0, savedMoney: 0, savedKg: 0, co2: 0, water: 0, level: 1 };
  st.inventory = [];
  st.consumed = [];
  st.leftovers = [];
  st.shopping = [];
  st.waste = [];
  st.meals = {};
  st.mealServings = {};
  st.savedRecipes = [];
  st.challenges = (st.challenges || []).map(x => ({ ...x, progress: 0 }));
  st.cart = [];
  st.orders = [];
  st.dailyEssentials = [];
  return st;
}
function migrateState(input, user = {}) {
  const db = input && typeof input === 'object' ? { ...input } : initialStateForUser(user);
  const previousVersion = Number(db.version || 0);
  delete db.auth;
  delete db.shares;
  db.version = 21;
  db.household = db.household || {};
  if (!Array.isArray(db.household.memberProfiles) || !db.household.memberProfiles.length) {
    const n = Math.max(1, Number(db.household.members || 1));
    db.household.memberProfiles = Array.from({ length: n }, (_, i) => ({ id: Date.now() + i, name: i === 0 ? (user.name || 'You') : `Member ${i + 1}`, role: i === 0 ? 'Admin' : 'Family', appetite: 'Regular', active: true }));
  }
  db.household.members = db.household.memberProfiles.length;
  if (!Number(db.household.currentServings)) db.household.currentServings = db.household.members;
  if (previousVersion < 20) db.household.theme = 'dark';
  else if (!db.household.theme) db.household.theme = 'dark';
  if (!db.household.language) db.household.language = 'en';
  if (typeof db.household.profileImage !== 'string' || db.household.profileImage.length > 900000) db.household.profileImage = '';
  if (!db.mealServings || typeof db.mealServings !== 'object') db.mealServings = {};
  if (!db.meals || typeof db.meals !== 'object' || Array.isArray(db.meals)) db.meals = {};
  if (!db.mealIngredients || typeof db.mealIngredients !== 'object' || Array.isArray(db.mealIngredients)) db.mealIngredients = {};
  for (const k of ['inventory','consumed','leftovers','shopping','waste','recipes','challenges','cart','orders','savedRecipes','dailyEssentials']) if (!Array.isArray(db[k])) db[k] = [];
  // v15 planner is inventory-locked: discard legacy/free-text meal slots that do not reference live inventory IDs.
  const liveIds = new Set(db.inventory.filter(x => !x?.expiry || String(x.expiry) >= day(0)).map(x => String(x.id)));
  for (const [d, meals] of Object.entries(db.meals)) {
    if (!meals || typeof meals !== 'object') { delete db.meals[d]; delete db.mealIngredients[d]; continue; }
    for (const slot of ['Breakfast','Lunch','Dinner']) {
      const ids = db.mealIngredients?.[d]?.[slot]?.ids;
      if (!Array.isArray(ids) || !ids.length || !ids.every(id => liveIds.has(String(id)))) {
        delete db.meals[d][slot];
        if (db.mealIngredients?.[d]) delete db.mealIngredients[d][slot];
      }
    }
    if (!Object.keys(db.meals[d]).length) delete db.meals[d];
    if (db.mealIngredients?.[d] && !Object.keys(db.mealIngredients[d]).length) delete db.mealIngredients[d];
  }
  db.dailyEssentials = db.dailyEssentials.map((x, i) => ({
    id: x?.id || Date.now() + i,
    name: safeText(x?.name || 'Milk', 80) || 'Milk',
    qty: safeText(x?.qty || '1 L', 40) || '1 L',
    shelfLife: Math.min(3, Math.max(2, Number(x?.shelfLife || 2))),
    place: safeText(x?.place || 'Fridge', 40) || 'Fridge',
    category: safeText(x?.category || 'Dairy', 40) || 'Dairy',
    cost: Math.max(0, Number(x?.cost || 0)),
    active: x?.active !== false,
    startDate: /^\d{4}-\d{2}-\d{2}$/.test(String(x?.startDate || '')) ? x.startDate : day(0),
    lastGenerated: /^\d{4}-\d{2}-\d{2}$/.test(String(x?.lastGenerated || '')) ? x.lastGenerated : '',
    skipDates: Array.isArray(x?.skipDates) ? x.skipDates.filter(d => /^\d{4}-\d{2}-\d{2}$/.test(String(d))).slice(-60) : [],
    createdAt: x?.createdAt || new Date().toISOString()
  }));
  if (!db.meals || typeof db.meals !== 'object') db.meals = {};
  if (!db.stats || typeof db.stats !== 'object') db.stats = { points:0,streak:0,savedMoney:0,savedKg:0,co2:0,water:0,level:1 };
  return db;
}

async function connectMongo() {
  if (LOCAL_MODE) {
    fs.mkdirSync(path.dirname(LOCAL_STATE_FILE), { recursive: true });
    return;
  }
  if (!MongoClient) throw new Error('MongoDB package is not installed. Run npm install for cloud mode, or enable LOCAL_MODE=true.');
  if (!MONGODB_URI) throw new Error('MONGODB_URI is required. Add your MongoDB Atlas connection string in .env or enable LOCAL_MODE=true.');
  if (!SESSION_SECRET || SESSION_SECRET.length < 24) console.warn('⚠ SESSION_SECRET should be at least 24 characters in production.');
  mongoClient = new MongoClient(MONGODB_URI, { serverSelectionTimeoutMS: 12000, maxPoolSize: 10 });
  await mongoClient.connect();
  mongoDb = mongoClient.db(MONGODB_DB_NAME);
  usersCol = mongoDb.collection('users');
  statesCol = mongoDb.collection('states');
  sessionsCol = mongoDb.collection('sessions');
  imageFilesCol = mongoDb.collection('foodwise_images.files');
  imagesBucket = new GridFSBucket(mongoDb, { bucketName: 'foodwise_images' });
  await Promise.all([
    usersCol.createIndex({ email: 1 }, { unique: true }),
    sessionsCol.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    sessionsCol.createIndex({ userId: 1 }),
    statesCol.createIndex({ updatedAt: -1 }),
    imageFilesCol.createIndex({ filename: 1 })
  ]);
  await mongoDb.command({ ping: 1 });
}
function readLocalState() {
  try { return migrateState(JSON.parse(fs.readFileSync(LOCAL_STATE_FILE, 'utf8')), localUser()); }
  catch { const data = migrateState(seed(), localUser()); fs.writeFileSync(LOCAL_STATE_FILE, JSON.stringify(data, null, 2)); return data; }
}
async function getUserState(user) {
  if (LOCAL_MODE) return readLocalState();
  const doc = await statesCol.findOne({ _id: String(user._id || user.id) });
  if (doc?.data) return migrateState(doc.data, user);
  const data = initialStateForUser(user);
  await statesCol.updateOne({ _id: String(user._id || user.id) }, { $set: { data, createdAt: new Date(), updatedAt: new Date() } }, { upsert: true });
  return data;
}
async function saveUserState(user, state) {
  const data = migrateState(state, user || (LOCAL_MODE ? localUser() : {}));
  if (LOCAL_MODE) { fs.mkdirSync(path.dirname(LOCAL_STATE_FILE), { recursive: true }); fs.writeFileSync(LOCAL_STATE_FILE, JSON.stringify(data, null, 2)); return data; }
  await statesCol.updateOne({ _id: String(user._id || user.id) }, { $set: { data, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
  return data;
}
async function sessionUser(req) {
  if (LOCAL_MODE) {
    const token = cookies(req).fw_session;
    return token === LOCAL_SESSION_TOKEN ? localUser() : null;
  }
  const token = cookies(req).fw_session;
  if (!token) return null;
  const now = new Date();
  const session = await sessionsCol.findOne({ _id: sessionHash(token), expiresAt: { $gt: now } });
  if (!session) return null;
  return usersCol.findOne({ _id: String(session.userId) });
}
function sessionCookie(token, maxAge = 315360000) {
  const secure = NODE_ENV === 'production' ? '; Secure' : '';
  return `fw_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure}`;
}
async function createSession(userId) {
  if (LOCAL_MODE) return sessionCookie(LOCAL_SESSION_TOKEN);
  const token = crypto.randomBytes(40).toString('hex');
  const now = new Date();
  const expiresAt = new Date(Date.now() + 10 * 365 * 86400000);
  await sessionsCol.insertOne({ _id: sessionHash(token), userId: String(userId), createdAt: now, expiresAt });
  return sessionCookie(token);
}
async function destroySession(req) {
  if (LOCAL_MODE) return;
  const token = cookies(req).fw_session;
  if (token) await sessionsCol.deleteOne({ _id: sessionHash(token) });
}

function firebaseConfigured() { return Boolean(FIREBASE_API_KEY); }
function firebaseFriendlyError(code = '') {
  const c = String(code).split(' : ')[0];
  const map = {
    EMAIL_EXISTS: 'An account with this email already exists. Please login.',
    OPERATION_NOT_ALLOWED: 'Firebase Email/Password sign-in is not enabled. Enable it in Firebase Authentication.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts. Please wait a little and try again.',
    EMAIL_NOT_FOUND: 'Invalid email or password.',
    INVALID_PASSWORD: 'Invalid email or password.',
    INVALID_LOGIN_CREDENTIALS: 'Invalid email or password.',
    USER_DISABLED: 'This account has been disabled.',
    INVALID_EMAIL: 'Please enter a valid email address.',
    WEAK_PASSWORD: 'Password must be at least 6 characters.',
    API_KEY_INVALID: 'Firebase API key is invalid or restricted for this request.'
  };
  return map[c] || code || 'Firebase Authentication request failed';
}
async function firebaseAuthCall(action, payload) {
  if (!FIREBASE_API_KEY) {
    const e = new Error('FIREBASE_API_KEY is not configured'); e.status = 503; throw e;
  }
  const endpoint = `https://identitytoolkit.googleapis.com/v1/accounts:${action}?key=${encodeURIComponent(FIREBASE_API_KEY)}`;
  const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload), signal: AbortSignal.timeout(30000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = data?.error?.message || `Firebase HTTP ${response.status}`;
    const e = new Error(firebaseFriendlyError(code));
    e.firebaseCode = String(code).split(' : ')[0];
    e.status = [400,401,403].includes(response.status) ? 400 : response.status;
    throw e;
  }
  return data;
}
async function firebaseSignUp(email, password) { return firebaseAuthCall('signUp', { email, password, returnSecureToken: true }); }
async function firebaseSignIn(email, password) { return firebaseAuthCall('signInWithPassword', { email, password, returnSecureToken: true }); }
async function firebaseDelete(idToken) { if (idToken) { try { await firebaseAuthCall('delete', { idToken }); } catch {} } }
async function firebaseSendPasswordReset(email) { return firebaseAuthCall('sendOobCode', { requestType: 'PASSWORD_RESET', email }); }
async function firebaseChangePassword(idToken, password) { return firebaseAuthCall('update', { idToken, password, returnSecureToken: true }); }
function send(res, status, data, type = 'application/json; charset=utf-8', extraHeaders = {}) {
  const body = type.startsWith('application/json') ? JSON.stringify(data) : data;
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...extraHeaders });
  res.end(body);
}
function parseBody(req) {
  return new Promise((resolve, reject) => {
    let b = '';
    req.on('data', c => { b += c; if (b.length > 2e6) req.destroy(); });
    req.on('end', () => { try { resolve(b ? JSON.parse(b) : {}); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function safeText(value, max = 120) { return String(value || '').trim().slice(0, max); }
function slug(value) { return safeText(value, 80).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 45) || 'food'; }
function hash(value) { return crypto.createHash('sha1').update(value).digest('hex').slice(0, 10); }

async function geminiGenerate(model, body, apiVersion = GEMINI_API_VERSION) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY is not configured');
  // Google Gemini REST examples use the v1beta generateContent endpoint.
  const endpoint = `https://generativelanguage.googleapis.com/${apiVersion}/models/${encodeURIComponent(model)}:generateContent`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(90000)
  });
  const raw = await response.text();
  let data = {};
  try { data = JSON.parse(raw); } catch { data = { raw }; }
  if (!response.ok) {
    const message = data?.error?.message || data?.raw || `Google Gemini API returned ${response.status}`;
    const err = new Error(message);
    err.status = response.status;
    err.googleStatus = data?.error?.status || '';
    throw err;
  }
  return data;
}

async function geminiGenerateWithFallback(kind, body) {
  if (kind !== 'text') throw new Error('Gemini is configured for chat/text only in this build');
  const fallbacks = ['gemini-2.5-flash-lite', 'gemini-3.1-flash-lite', 'gemini-2.5-flash'];
  const models = [...new Set([GEMINI_TEXT_MODEL, ...fallbacks].filter(Boolean))];
  let lastErr = null;
  for (const model of models) {
    try {
      const data = await geminiGenerate(model, body, GEMINI_API_VERSION);
      activeTextModel = model;
      return { data, model };
    } catch (err) {
      lastErr = err;
      if ([401, 403, 429].includes(Number(err.status))) break;
    }
  }
  throw lastErr || new Error('No usable Gemini text model found');
}


function cloudflareConfigured() {
  return Boolean(CLOUDFLARE_ACCOUNT_ID && CLOUDFLARE_API_TOKEN);
}

// Hinglish / Hindi grocery names are normalized before they are sent to FLUX.
// FLUX is much more reliable when the core subject is expressed as a precise English grocery item.
const FOOD_IMAGE_ALIASES = [
  { en: 'banana', aliases: ['kela','kele','kelaa','banana','bananas'] },
  { en: 'egg', aliases: ['anda','ande','andaa','egg','eggs'] },
  { en: 'potato', aliases: ['aloo','alu','aalu','potato','potatoes'] },
  { en: 'tomato', aliases: ['tamatar','tamater','tomato','tomatoes'] },
  { en: 'onion', aliases: ['pyaz','pyaaz','piaz','onion','onions'] },
  { en: 'milk', aliases: ['doodh','dudh','milk'] },
  { en: 'curd', aliases: ['dahi','curd','yogurt','yoghurt'] },
  { en: 'paneer', aliases: ['paneer','cottage cheese'] },
  { en: 'spinach', aliases: ['palak','spinach'] },
  { en: 'green peas', aliases: ['matar','matr','peas','green peas'] },
  { en: 'cauliflower', aliases: ['gobi','gobhi','phool gobi','phool gobhi','cauliflower'] },
  { en: 'cabbage', aliases: ['patta gobi','patta gobhi','cabbage'] },
  { en: 'okra', aliases: ['bhindi','bhendi','okra','lady finger','ladyfinger'] },
  { en: 'eggplant', aliases: ['baingan','brinjal','eggplant','aubergine'] },
  { en: 'bottle gourd', aliases: ['lauki','dudhi','ghiya','bottle gourd'] },
  { en: 'bitter gourd', aliases: ['karela','bitter gourd'] },
  { en: 'ridge gourd', aliases: ['turai','tori','torai','ridge gourd'] },
  { en: 'cucumber', aliases: ['kheera','khira','cucumber'] },
  { en: 'carrot', aliases: ['gajar','carrot','carrots'] },
  { en: 'radish', aliases: ['mooli','muli','radish'] },
  { en: 'beetroot', aliases: ['chukandar','beetroot','beet'] },
  { en: 'capsicum', aliases: ['shimla mirch','capsicum','bell pepper'] },
  { en: 'green chilli', aliases: ['hari mirch','mirchi','green chilli','green chili'] },
  { en: 'ginger', aliases: ['adrak','ginger'] },
  { en: 'garlic', aliases: ['lahsun','lasun','garlic'] },
  { en: 'lemon', aliases: ['nimbu','neembu','lemon','lime'] },
  { en: 'mango', aliases: ['aam','mango','mangoes'] },
  { en: 'apple', aliases: ['seb','sev apple','apple','apples'] },
  { en: 'orange', aliases: ['santra','orange','oranges'] },
  { en: 'grapes', aliases: ['angoor','angur','grapes'] },
  { en: 'pomegranate', aliases: ['anar','pomegranate'] },
  { en: 'guava', aliases: ['amrud','amrood','guava'] },
  { en: 'papaya', aliases: ['papita','papaya'] },
  { en: 'watermelon', aliases: ['tarbooz','tarbuj','watermelon'] },
  { en: 'muskmelon', aliases: ['kharbuja','muskmelon','cantaloupe'] },
  { en: 'rice', aliases: ['chawal','chaaval','rice'] },
  { en: 'wheat flour', aliases: ['atta','aata','wheat flour','flour'] },
  { en: 'lentils', aliases: ['dal','daal','lentil','lentils'] },
  { en: 'chickpeas', aliases: ['chana','chole','chickpea','chickpeas'] },
  { en: 'kidney beans', aliases: ['rajma','kidney beans'] },
  { en: 'bread', aliases: ['bread','double roti'] },
  { en: 'chapati', aliases: ['roti','chapati','phulka'] },
  { en: 'potato chips', aliases: ['chips','potato chips','aloo chips'] },
  { en: 'butter', aliases: ['makhan','makkhan','butter'] },
  { en: 'ghee', aliases: ['ghee','desi ghee'] },
  { en: 'cheese', aliases: ['cheese'] },
  { en: 'chicken', aliases: ['chicken','murga','murgi'] },
  { en: 'fish', aliases: ['machli','machhli','fish'] }
];

function cleanFoodWords(value = '') {
  return safeText(value, 80)
    .toLowerCase()
    .replace(/\b\d+(?:\.\d+)?\s*(?:pcs?|pieces?|kg|g|gm|grams?|l|litre|liter|ml|pack|packet|dozen)?\b/g, ' ')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function localFoodImageName(name = '') {
  const cleaned = cleanFoodWords(name);
  if (!cleaned) return '';
  // Prefer exact aliases, then whole-phrase containment. Longer aliases first avoids gobi/cabbage ambiguity.
  const candidates = FOOD_IMAGE_ALIASES.flatMap(row => row.aliases.map(alias => ({ en: row.en, alias })))
    .sort((a,b) => b.alias.length - a.alias.length);
  const exact = candidates.find(x => cleaned === x.alias);
  if (exact) return exact.en;
  const padded = ` ${cleaned} `;
  const inside = candidates.find(x => padded.includes(` ${x.alias} `));
  return inside?.en || cleaned;
}

async function normalizeFoodImageName(name = '') {
  const original = safeText(name, 80);
  let canonical = localFoodImageName(original);
  let source = canonical && canonical !== cleanFoodWords(original) ? 'hinglish-map' : 'input';

  // For unknown romanized Hindi/Hinglish words, Gemini text can cheaply normalize the grocery noun.
  // If Gemini is unavailable, the local dictionary still covers common household foods.
  if (GEMINI_API_KEY && canonical === cleanFoodWords(original) && canonical && !/^(milk|bread|rice|chips|cheese|butter|ghee|chicken|fish|paneer|oats|pasta|noodles)$/i.test(canonical)) {
    try {
      const prompt = `Convert this grocery/food name from Indian Hinglish, Roman Hindi, Hindi transliteration, or English into ONE canonical English grocery item name. Return only 1 to 4 English words, no punctuation, no explanation. Do not invent a dish. Input: ${JSON.stringify(original)}`;
      const { data } = await geminiGenerateWithFallback('text', {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0, maxOutputTokens: 20 }
      });
      const candidate = safeText(data?.candidates?.[0]?.content?.parts?.map(x => x.text || '').join(' ').trim(), 50)
        .toLowerCase().replace(/[^a-z\s-]/g, ' ').replace(/\s+/g, ' ').trim();
      if (candidate && candidate.length <= 45 && !candidate.includes('unknown')) {
        canonical = localFoodImageName(candidate) || candidate;
        source = 'gemini-normalized';
      }
    } catch (err) {
      console.warn('Food-name normalization fallback:', err.message);
    }
  }
  return { original, canonical: canonical || original, source };
}

function imageSubjectHint(canonical = '') {
  const c = canonical.toLowerCase();
  const hints = {
    banana: 'ripe yellow bananas, curved fruit with yellow peel and small brown stem tips',
    egg: 'whole chicken eggs in intact natural shells, not cooked eggs',
    potato: 'whole raw potatoes with natural brown skin',
    tomato: 'whole fresh red tomatoes',
    onion: 'whole raw onions with papery skin',
    milk: 'plain unbranded bottle or glass of fresh white milk',
    curd: 'plain white curd or yogurt in a simple unbranded bowl',
    paneer: 'fresh white paneer block and a few paneer cubes',
    spinach: 'fresh green spinach leaves',
    'green peas': 'fresh green peas, some in opened pea pods',
    cauliflower: 'one fresh white cauliflower head with green leaves',
    cabbage: 'one fresh green cabbage head',
    okra: 'fresh green okra pods, also called lady fingers',
    eggplant: 'fresh purple eggplant or brinjal',
    'bottle gourd': 'fresh pale green bottle gourd, long smooth vegetable',
    'bitter gourd': 'fresh green bitter gourds with bumpy ridged skin',
    cucumber: 'whole fresh green cucumbers',
    carrot: 'fresh orange carrots with natural texture',
    mango: 'ripe fresh mango fruit',
    apple: 'fresh red apples',
    orange: 'fresh whole oranges',
    grapes: 'a bunch of fresh grapes',
    pomegranate: 'fresh whole pomegranate fruit, one cut open only if helpful',
    rice: 'uncooked white rice grains in a plain unbranded bowl',
    'wheat flour': 'plain wheat flour in a simple unbranded bowl',
    lentils: 'dry lentils or dal in a simple unbranded bowl',
    chickpeas: 'dry or soaked chickpeas in a plain bowl',
    'kidney beans': 'dry red kidney beans in a plain bowl',
    bread: 'plain sliced bread loaf, no packaging text',
    chapati: 'plain cooked Indian chapatis or rotis stacked naturally',
    'potato chips': 'plain crispy potato chips in an unbranded bowl, not french fries and not a packet',
    chicken: 'raw fresh chicken pieces suitable for groceries, hygienic food photography',
    fish: 'fresh whole fish or clean fish fillets suitable for groceries, hygienic food photography'
  };
  return hints[c] || `the grocery item ${canonical}`;
}

function decodeCloudflareImagePayload(data) {
  const image = data?.result?.image || data?.image || data?.result?.data?.image || data?.data?.image;
  if (!image || typeof image !== 'string') return null;
  const cleaned = image.includes(',') ? image.split(',').pop() : image;
  return Buffer.from(cleaned, 'base64');
}

async function cloudflareGenerateImage(prompt) {
  if (!cloudflareConfigured()) throw new Error('Cloudflare image AI is not configured. Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in .env');
  const endpoint = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(CLOUDFLARE_ACCOUNT_ID)}/ai/run/${CLOUDFLARE_IMAGE_MODEL}`;
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${CLOUDFLARE_API_TOKEN}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ prompt, steps: CLOUDFLARE_IMAGE_STEPS }),
    signal: AbortSignal.timeout(90000)
  });
  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.startsWith('image/')) {
    if (!response.ok) throw new Error(`Cloudflare image API returned ${response.status}`);
    return { bytes: Buffer.from(await response.arrayBuffer()), mime: contentType.split(';')[0] || 'image/jpeg' };
  }
  const raw = await response.text();
  let data = {};
  try { data = JSON.parse(raw); } catch { data = { raw }; }
  if (!response.ok || data?.success === false) {
    const cfMessage = data?.errors?.map(e => e.message).filter(Boolean).join('; ') || data?.error?.message || data?.raw || `Cloudflare Workers AI returned ${response.status}`;
    const err = new Error(cfMessage);
    err.status = response.status;
    throw err;
  }
  const bytes = decodeCloudflareImagePayload(data);
  if (!bytes?.length) throw new Error('Cloudflare returned no image data');
  return { bytes, mime: 'image/jpeg' };
}

async function generateFoodImage(name, quantity = '') {
  const food = safeText(name, 80);
  const qty = safeText(quantity, 40);
  if (!food) throw new Error('Food name is required');

  const normalized = await normalizeFoodImageName(food);
  const canonical = normalized.canonical;
  // v11.2 deliberately changes the cache key so previously-wrong Hinglish images are not reused.
  const key = `${food.toLowerCase()}|${canonical.toLowerCase()}|${qty.toLowerCase()}|cloudflare-v11.2-hinglish`;
  const base = `${slug(canonical)}-${hash(key)}`;
  const existing = imageFilesCol ? await imageFilesCol.findOne({ filename: base }) : null;
  if (existing) return { image: `/api/images/${existing._id}`, cached: true, provider: 'Cloudflare Workers AI', model: CLOUDFLARE_IMAGE_MODEL, interpretedAs: canonical, originalName: food, normalization: normalized.source };

  const countMatch = qty.match(/(\d+(?:\.\d+)?)\s*(?:pcs?|pieces?)\b/i);
  const count = countMatch ? Number(countMatch[1]) : null;
  const quantityInstruction = count && count > 0 && count <= 30
    ? `Show exactly ${count} clearly countable individual ${canonical}${count === 1 ? '' : ' items'} when physically natural. Do not add extra food pieces. Do not write the number as text.`
    : qty
      ? `Inventory quantity is ${qty}. Represent that amount naturally, but do not render quantity text.`
      : '';

  const prompt = [
    `Create a photorealistic grocery inventory photograph. The ONLY main food subject is: ${canonical}.`,
    `Visual identity: ${imageSubjectHint(canonical)}.`,
    `The user typed ${JSON.stringify(food)}; interpret it specifically as ${canonical}. Do not reinterpret it as another object, dish, brand, animal, or unrelated concept.`,
    quantityInstruction,
    'Fresh realistic natural texture, premium grocery photography, clean neutral kitchen or dark charcoal studio background, soft natural directional light, centered subject, square 1:1 composition, high detail.',
    'No text, no price tag, no labels, no UI, no logo, no watermark text, no hands, no people. No illustration, no cartoon, no 3D render.'
  ].filter(Boolean).join(' ');

  const { bytes, mime } = await cloudflareGenerateImage(prompt);
  if (LOCAL_MODE) { activeImageModel = CLOUDFLARE_IMAGE_MODEL; return { image: `data:${mime};base64,${bytes.toString('base64')}`, cached: false, provider: 'Cloudflare Workers AI', model: CLOUDFLARE_IMAGE_MODEL, interpretedAs: canonical, originalName: food, normalization: normalized.source }; }
  if (!imagesBucket) throw new Error('MongoDB image storage is not ready');
  const upload = imagesBucket.openUploadStream(base, { metadata: { mime, canonical, originalName: food, key, createdAt: new Date() } });
  await new Promise((resolve, reject) => { upload.on('finish', resolve); upload.on('error', reject); upload.end(bytes); });
  activeImageModel = CLOUDFLARE_IMAGE_MODEL;
  return { image: `/api/images/${upload.id}`, cached: false, provider: 'Cloudflare Workers AI', model: CLOUDFLARE_IMAGE_MODEL, interpretedAs: canonical, originalName: food, normalization: normalized.source };
}

function localNutrition(name, qty) {
  const key = String(name || '').toLowerCase();
  const countMatch = String(qty || '').match(/([0-9]+(?:\.[0-9]+)?)/);
  const count = countMatch ? Number(countMatch[1]) : 1;
  const perItem = [
    { keys: ['banana', 'bananas', 'kela', 'kele'], calories: 105, protein: 1.3, carbs: 27, fat: 0.4, fiber: 3.1, serving: '1 medium banana' },
    { keys: ['apple', 'seb'], calories: 95, protein: 0.5, carbs: 25, fat: 0.3, fiber: 4.4, serving: '1 medium apple' },
    { keys: ['egg', 'anda'], calories: 72, protein: 6.3, carbs: 0.4, fat: 4.8, fiber: 0, serving: '1 large egg' }
  ].find(x => x.keys.some(k => key.includes(k)));
  if (perItem && /pc|pcs|piece|pieces|\b[0-9]+\b/i.test(String(qty || ''))) {
    return {
      calories: Math.round(perItem.calories * count),
      protein: +(perItem.protein * count).toFixed(1),
      carbs: +(perItem.carbs * count).toFixed(1),
      fat: +(perItem.fat * count).toFixed(1),
      fiber: +(perItem.fiber * count).toFixed(1),
      serving: qty || `${count} pcs`,
      note: 'Approximate local estimate. Connect Gemini for broader foods and smarter quantity interpretation.',
      source: 'local-estimate'
    };
  }
  const generic = [
    { keys: ['milk', 'doodh'], calories: 610, protein: 32, carbs: 48, fat: 33, fiber: 0, serving: '1 L' },
    { keys: ['paneer'], calories: 795, protein: 54, carbs: 6, fat: 63, fiber: 0, serving: '300 g' },
    { keys: ['spinach', 'palak'], calories: 23, protein: 2.9, carbs: 3.6, fat: 0.4, fiber: 2.2, serving: '100 g' },
    { keys: ['tomato', 'tamatar'], calories: 18, protein: 0.9, carbs: 3.9, fat: 0.2, fiber: 1.2, serving: '100 g' },
    { keys: ['rice', 'chawal'], calories: 130, protein: 2.7, carbs: 28, fat: 0.3, fiber: 0.4, serving: '100 g cooked' },
    { keys: ['bread'], calories: 80, protein: 3, carbs: 15, fat: 1, fiber: 1, serving: '1 slice' }
  ].find(x => x.keys.some(k => key.includes(k)));
  if (generic) return { ...generic, note: `Approximate reference values for ${generic.serving}; your entered quantity is ${qty || 'not specified'}. Connect Gemini for quantity-aware estimation.`, source: 'local-estimate' };
  return null;
}

function parseJsonText(text) {
  const clean = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
  try { return JSON.parse(clean); } catch {}
  const start = clean.indexOf('{');
  const end = clean.lastIndexOf('}');
  if (start >= 0 && end > start) return JSON.parse(clean.slice(start, end + 1));
  throw new Error('Could not parse Gemini nutrition response');
}

async function getNutrition(name, qty) {
  if (!GEMINI_API_KEY) {
    const fallback = localNutrition(name, qty);
    if (fallback) return fallback;
    return { calories: 100, protein: 3, carbs: 15, fat: 3, fiber: 2, serving: safeText(qty, 40) || '1 household serving', note: 'Generic local estimate because Gemini is not configured. Use package nutrition label for exact values.', source: 'local-generic-estimate' };
  }
  const prompt = `Estimate nutrition for the household food item below. Return JSON only, no markdown.\nFood: ${safeText(name, 80)}\nQuantity: ${safeText(qty, 40)}\nReturn keys: calories (number kcal), protein (number grams), carbs (number grams), fat (number grams), fiber (number grams), serving (string), note (short string). Interpret Hindi/English food names and common Indian portions. Values are estimates, not medical advice.`;
  const { data } = await geminiGenerateWithFallback('text', {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 }
  });
  const textPart = data?.candidates?.[0]?.content?.parts?.find(p => p.text)?.text;
  if (!textPart) throw new Error('Gemini returned no nutrition result');
  const result = parseJsonText(textPart);
  return {
    calories: Number(result.calories || 0),
    protein: Number(result.protein || 0),
    carbs: Number(result.carbs || 0),
    fat: Number(result.fat || 0),
    fiber: Number(result.fiber || 0),
    serving: safeText(result.serving || qty || 'Entered quantity', 80),
    note: safeText(result.note || 'Approximate AI estimate; not medical advice.', 220),
    source: 'gemini'
  };
}

function recipeIntent(question = '') {
  const q = String(question).toLowerCase();
  return /(recipe|dish|banaun|banao|banana hai|banau|cook|cooking|youtube|video|khana|kya bana|kaise ban)/i.test(q);
}

function youtubeSearchUrl(query) {
  const clean = safeText(query || 'easy Indian recipe Hindi', 180);
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(clean)}`;
}

function localRecipeName(question, state) {
  const q = String(question || '').toLowerCase();
  const direct = (state.recipes || []).find(r => q.includes(String(r.name || '').toLowerCase()));
  if (direct) return direct.name;
  const expiring = [...(state.inventory || [])].sort((a, b) => a.expiry.localeCompare(b.expiry)).slice(0, 4).map(x => x.name.toLowerCase());
  const match = (state.recipes || []).find(r => (r.uses || []).some(u => expiring.some(e => e.includes(String(u).toLowerCase()) || String(u).toLowerCase().includes(e))));
  return match?.name || state.recipes?.[0]?.name || 'easy Indian leftover recipe';
}

function requestedLanguage(language, state) {
  const l = String(language || state?.household?.language || 'en').toLowerCase();
  return ['hi','hinglish','en'].includes(l) ? l : 'en';
}
function localLangText(lang, en, hinglish, hi) { return lang === 'hi' ? hi : lang === 'hinglish' ? hinglish : en; }

function aiReply(question, state, language = '') {
  const q = (question || '').toLowerCase();
  const lang = requestedLanguage(language, state);
  const expiringItems = [...state.inventory].sort((a, b) => a.expiry.localeCompare(b.expiry)).slice(0, 3);
  const expiring = expiringItems.map(x => x.name);
  const inv = state.inventory.map(x => x.name.toLowerCase());
  if (q.includes('expire') || q.includes('expiry') || q.includes('khatam')) return { answer: localLangText(lang, `Use ${expiring.join(', ')} first. Eat First is ordered by expiry date.`, `Sabse pehle ${expiring.join(', ')} use karo. Eat First expiry date ke basis par hai.`, `सबसे पहले ${expiring.join(', ')} उपयोग करें। Eat First सूची एक्सपायरी तारीख के आधार पर है।`), youtubeQuery: '' };
  if (q.includes('budget') || q.includes('paise') || q.includes('money')) return { answer: localLangText(lang, `Monthly budget is ₹${state.household.budget} and recorded spend is ₹${state.household.spent}. Check duplicate items before shopping.`, `Monthly budget ₹${state.household.budget} hai aur recorded spend ₹${state.household.spent}. Shopping se pehle duplicate items check karo.`, `मासिक बजट ₹${state.household.budget} है और दर्ज खर्च ₹${state.household.spent} है। खरीदारी से पहले डुप्लिकेट आइटम जाँचें।`), youtubeQuery: '' };
  if (recipeIntent(question)) {
    const recipeName = localRecipeName(question, state);
    const r = (state.recipes || []).find(x => x.name === recipeName) || state.recipes?.[0];
    const uses = r?.uses?.join(', ') || expiring.join(', ');
    const people = Math.max(1, Number(state.household.currentServings || state.household.members || 1));
    const answer = localLangText(lang, `${recipeName} is a good option for ${people} ${people===1?'person':'people'}. Use: ${uses}. Prepare the ingredients, cook vegetables/spices first, add the main ingredients, cook on medium heat, and serve in ${people} portions. Use the closest-expiry items first.`, `${recipeName} try karo — ${people} ${people===1?'person':'people'} ke liye. Use: ${uses}. Ingredients prep karo, masala/vegetables cook karo, main ingredients add karke medium heat par pakao aur ${people} portions me serve karo. Near-expiry items pehle use karo.`, `${recipeName} ${people} लोगों के लिए अच्छा विकल्प है। उपयोग करें: ${uses}। सामग्री तैयार करें, मसाला/सब्ज़ियाँ पकाएँ, मुख्य सामग्री डालकर मध्यम आँच पर पकाएँ और ${people} हिस्सों में परोसें। जल्द एक्सपायर होने वाले आइटम पहले उपयोग करें।`);
    return { answer, youtubeQuery: `${recipeName} recipe ${lang==='en'?'English':'Hindi'}` };
  }
  if ((q.includes('paneer') || q.includes('tomato') || q.includes('bread')) && inv.includes('paneer') && inv.some(x=>x.includes('tomato')) && inv.includes('bread')) return { answer: localLangText(lang,'Make Paneer Tomato Toast: toast the bread, sauté tomato, add crumbled paneer and spices, cook for 5–6 minutes and serve on toast.','Paneer Tomato Toast banao: bread toast karo, tomato sauté karo, crumbled paneer + masala add karo, 5–6 min cook karke toast par serve karo.','पनीर टोमेटो टोस्ट बनाएँ: ब्रेड टोस्ट करें, टमाटर भूनें, क्रम्बल पनीर और मसाला डालें, 5–6 मिनट पकाएँ और टोस्ट पर परोसें।'), youtubeQuery: `Paneer Tomato Toast recipe ${lang==='en'?'English':'Hindi'}` };
  if (q.includes('leftover') || q.includes('bacha')) return { answer: localLangText(lang,'Keep leftovers in the Eat First list and follow the use-by date.','Leftovers ko Eat First list me rakho aur use-by date follow karo.','बचे खाने को Eat First सूची में रखें और use-by तारीख का पालन करें।'), youtubeQuery: '' };
  if (q.includes('shopping') || q.includes('buy') || q.includes('kharid')) return { answer: localLangText(lang,`You currently have ${state.inventory.length} inventory items. Check the fridge and pantry before making a shopping list.`,`Current inventory me ${state.inventory.length} items hain. List banane se pehle fridge/pantry check karo.`,`अभी इन्वेंटरी में ${state.inventory.length} आइटम हैं। खरीदारी सूची बनाने से पहले फ्रिज और पेंट्री जाँचें।`), youtubeQuery: '' };
  return { answer: localLangText(lang,'Gemini is not connected, so offline mode can answer FoodWise inventory, expiry, recipe, shopping, storage and waste questions only. Connect GEMINI_API_KEY to ask anything.','Gemini connected nahi hai, isliye offline mode abhi FoodWise inventory, expiry, recipe, shopping, storage aur waste questions ka answer de sakta hai. Kuch bhi poochne ke liye GEMINI_API_KEY connect karo.','Gemini जुड़ा नहीं है, इसलिए ऑफलाइन मोड अभी FoodWise इन्वेंटरी, एक्सपायरी, रेसिपी, खरीदारी, स्टोरेज और वेस्ट सवालों का जवाब दे सकता है। कुछ भी पूछने के लिए GEMINI_API_KEY जोड़ें।'), youtubeQuery: '' };
}

function extractYoutubeMarker(text, fallback = '') {
  const src = String(text || '').trim();
  const match = src.match(/(?:^|\n)YOUTUBE_QUERY\s*:\s*(.+)$/im);
  const query = safeText(match?.[1] || fallback, 180);
  const clean = src.replace(/(?:^|\n)YOUTUBE_QUERY\s*:\s*.+$/im, '').trim();
  return { answer: clean, youtubeQuery: query };
}

async function aiReplyGemini(question, state, language = '') {
  const lang = requestedLanguage(language, state);
  if (!GEMINI_API_KEY) return aiReply(question, state, lang);
  const compact = {
    household: { members: state.household.members, cookingFor: state.household.currentServings || state.household.members, memberNames: (state.household.memberProfiles || []).map(x => x.name), budget: state.household.budget, spent: state.household.spent, preference: state.household.veg, allergies: state.household.allergies },
    inventory: state.inventory.map(x => ({ name: x.name, qty: x.qty, place: x.place, expiry: x.expiry })),
    consumed: (state.consumed || []).slice(0, 30).map(x => ({ name: x.name, qty: x.qty, consumedDate: x.consumedDate || String(x.consumedAt || '').slice(0,10) })),
    leftovers: state.leftovers.filter(x => x.status === 'active').map(x => ({ name: x.name, qty: x.qty, useBy: x.useBy })),
    shopping: state.shopping.filter(x => !x.done).map(x => ({ name: x.name, qty: x.qty }))
  };
  const needsRecipe = recipeIntent(question);
  const langLabel = lang === 'hi' ? 'natural Hindi in Devanagari' : lang === 'hinglish' ? 'natural Hinglish written in Latin script' : 'clear English';
  const youtubeLang = lang === 'en' ? 'English' : 'Hindi';
  const prompt = `You are FoodWise AI, a helpful general-purpose assistant inside the FoodWise app. You may answer ANY normal user question: general knowledge, study, writing, coding, calculations, explanations, planning, technology, food, recipes, and everyday questions. The app language is ${lang}; answer in ${langLabel} unless the user explicitly requests another language.

FoodWise context rule: only use the household data below when the question is actually about the user's food, inventory, consumed history, shopping, expiry, storage, leftovers, nutrition, waste, budget, meal planning, or recipes. Never pretend an item is in the user's kitchen unless it appears in the provided inventory/leftovers. For food questions, prioritize items closest to expiry.

Recipe rule: if the user asks what to cook, names a dish, asks for a recipe, or asks for a YouTube cooking video, give a useful recipe scaled for household.cookingFor people. Clearly separate ingredients already in inventory from optional/missing ingredients. Give 4-7 short numbered steps and avoid unsafe food-safety claims. ${needsRecipe ? `At the very end add exactly one separate line: YOUTUBE_QUERY: <dish name> recipe ${youtubeLang}. Do not invent a direct video URL.` : 'Do not add a YOUTUBE_QUERY line unless a cooking/recipe/video request is being answered.'}

For non-food questions, answer normally and do not force food advice into the response. If the question is unclear, ask one concise clarification.
Household data (use only when relevant): ${JSON.stringify(compact)}
User: ${safeText(question, 3000)}`;
  const { data } = await geminiGenerateWithFallback('text', {
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: { temperature: 0.35, maxOutputTokens: 700 }
  });
  const raw = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
  if (!raw) return aiReply(question, state, lang);
  const fallbackQuery = needsRecipe ? `${localRecipeName(question, state)} recipe ${lang==='en'?'English':'Hindi'}` : '';
  return extractYoutubeMarker(raw, fallbackQuery);
}


function reportDateDays(expiry) {
  const now = new Date(); now.setHours(0, 0, 0, 0);
  const target = new Date(`${expiry}T00:00:00`); target.setHours(0, 0, 0, 0);
  return Math.round((target - now) / 86400000);
}
function reportNormName(s = '') { return String(s).toLowerCase().replace(/[^a-z0-9\u0900-\u097f]+/g, ' ').trim().replace(/(es|s)$/, ''); }
function buildSmartReport(st) {
  const budget = Number(st.household?.budget || 0), spent = Number(st.household?.spent || 0), remaining = Math.max(0, budget - spent);
  const pending = (st.shopping || []).filter(x => !x.done);
  const buys = pending.map(x => {
    const k = reportNormName(x.name);
    const dup = (st.inventory || []).find(i => { const ik = reportNormName(i.name); return ik === k || ik.includes(k) || k.includes(ik); });
    let decision = dup ? 'DELAY' : 'BUY';
    let reason = dup ? `Already have ${dup.qty} ${dup.name}; expires ${dup.expiry}.` : 'On shopping list and not found in current inventory.';
    if (!dup && Number(x.price || 0) > remaining) { decision = 'BUDGET CHECK'; reason = `Estimated price ₹${Number(x.price || 0)} is above remaining budget ₹${remaining}.`; }
    return { name: x.name, qty: x.qty, category: x.category, price: Number(x.price || 0), decision, reason };
  });
  const expiry = (st.inventory || []).map(x => ({ ...x, daysLeft: reportDateDays(x.expiry) })).filter(x => x.daysLeft <= 7).sort((a, b) => a.daysLeft - b.daysLeft);
  const avoidable = (st.waste || []).filter(x => x.avoidable), avoidableCost = avoidable.reduce((s, x) => s + Number(x.cost || 0), 0), wasteCost = (st.waste || []).reduce((s, x) => s + Number(x.cost || 0), 0);
  const itemTotals = {}, reasonTotals = {};
  (st.waste || []).forEach(x => itemTotals[x.name || 'Unknown'] = (itemTotals[x.name || 'Unknown'] || 0) + Number(x.cost || 0));
  avoidable.forEach(x => reasonTotals[x.reason || 'Unknown'] = (reasonTotals[x.reason || 'Unknown'] || 0) + Number(x.cost || 0));
  const worst = Object.entries(itemTotals).sort((a, b) => b[1] - a[1])[0] || ['No waste', 0];
  const topReason = Object.entries(reasonTotals).sort((a, b) => b[1] - a[1])[0] || ['No avoidable waste', 0];
  const dates = (st.waste || []).map(x => x.date).filter(Boolean).sort();
  let observedDays = 7;
  if (dates.length) { const nowStart = new Date(); nowStart.setHours(0, 0, 0, 0); const first = new Date(`${dates[0]}T00:00:00`); first.setHours(0, 0, 0, 0); observedDays = Math.max(7, Math.min(30, Math.floor((nowStart - first) / 86400000) + 1)); }
  const monthlyBaseline = Math.round((avoidableCost / observedDays) * 30);
  const goalPct = Math.max(.05, Math.min(1, Number(st.household?.weeklyGoal || 25) / 100));
  const monthlySave = monthlyBaseline * goalPct, best50 = monthlyBaseline * .5;
  const forecast = [1, 3, 6, 12].map(months => ({ months, goalSavings: Math.round(monthlySave * months), best50Savings: Math.round(best50 * months), projectedWasteAfterGoal: Math.max(0, Math.round((monthlyBaseline - monthlySave) * months)) }));
  const urgentValue = expiry.filter(x => x.daysLeft <= 3).reduce((s, x) => s + Number(x.cost || 0), 0), weekValue = expiry.reduce((s, x) => s + Number(x.cost || 0), 0);
  const recommendations = [
    buys.find(x => x.decision === 'BUY') ? `Buy: ${buys.filter(x => x.decision === 'BUY').map(x => x.name).slice(0, 3).join(', ')}.` : 'Buy: no urgent purchase recommended from the current shopping list.',
    buys.find(x => x.decision !== 'BUY') ? `Delay/avoid: ${buys.filter(x => x.decision !== 'BUY').map(x => x.name).slice(0, 3).join(', ')}.` : 'No duplicate purchase warning found.',
    expiry[0] ? `Use first: ${expiry.slice(0, 3).map(x => `${x.name} (${x.daysLeft <= 0 ? 'today/expired' : `${x.daysLeft}d`})`).join(', ')}.` : 'No items expire within 7 days.',
    `Waste pattern: ${worst[0]} is the highest recorded waste-cost item; top avoidable reason is ${topReason[0]}.`,
    `Savings estimate: about ₹${forecast.find(x => x.months === 3)?.goalSavings || 0} in 3 months and ₹${forecast.find(x => x.months === 12)?.goalSavings || 0} in 12 months at the current ${Math.round(goalPct * 100)}% reduction goal.`
  ];
  return { generatedAt: new Date().toISOString(), household: st.household, budget: { budget, spent, remaining }, buys, expiry, waste: { logs: st.waste || [], avoidableCost, totalCost: wasteCost, worstItem: { name: worst[0], cost: worst[1] }, topReason: { name: topReason[0], cost: topReason[1] }, observedDays, confidence: avoidable.length >= 8 ? 'High' : avoidable.length >= 4 ? 'Medium' : 'Low' }, savings: { monthlyAvoidableBaseline: monthlyBaseline, goalPct, monthlyGoalSavings: Math.round(monthlySave), monthlyBest50Savings: Math.round(best50), forecast, urgentFoodValue: urgentValue, weekFoodValue: weekValue }, recommendations };
}
async function buildAiReportSummary(report) {
  const lang = requestedLanguage(report.household?.language || 'en', { household: report.household || {} });
  const langLabel = lang === 'hi' ? 'natural Hindi in Devanagari' : lang === 'hinglish' ? 'natural Hinglish written in Latin script' : 'clear English';
  const fallback = report.recommendations.join('\n');
  if (!GEMINI_API_KEY) return fallback;
  const compact = { budget: report.budget, buys: report.buys, expiry: report.expiry.slice(0, 8).map(x => ({ name: x.name, qty: x.qty, daysLeft: x.daysLeft, cost: x.cost })), waste: report.waste, savings: report.savings };
  const prompt = `You are FoodWise. Create a short household food-waste report in ${langLabel}. Use only the supplied data. Give exactly 5 concise lines: 1) WHAT TO BUY, 2) WHAT TO DELAY/AVOID BUYING, 3) EXPIRY / USE FIRST, 4) GARBAGE / WASTE INSIGHT, 5) FUTURE SAVINGS for 3, 6 and 12 months. Clearly say estimates are based on current logs. Data: ${JSON.stringify(compact)}`;
  try {
    const { data } = await geminiGenerateWithFallback('text', { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: .2, maxOutputTokens: 420 } });
    const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
    return text || fallback;
  } catch (err) { console.error('Gemini report failed:', err.message); return fallback; }
}
function xmlEsc(s) { return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;'); }
function colName(n) { let s = ''; while (n > 0) { n--; s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26); } return s; }
function xlsxCell(v, ref, style = 0) {
  if (v === null || v === undefined || v === '') return `<c r="${ref}" s="${style}"/>`;
  if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}" s="${style}"><v>${v}</v></c>`;
  if (typeof v === 'boolean') return `<c r="${ref}" s="${style}" t="b"><v>${v ? 1 : 0}</v></c>`;
  return `<c r="${ref}" s="${style}" t="inlineStr"><is><t xml:space="preserve">${xmlEsc(v)}</t></is></c>`;
}
function xlsxSheet(rows, widths = []) {
  const rowXml = rows.map((row, ri) => `<row r="${ri + 1}"${ri === 0 ? ' ht="28" customHeight="1"' : ''}>${row.map((cell, ci) => { const obj = cell && typeof cell === 'object' && !Array.isArray(cell) && Object.prototype.hasOwnProperty.call(cell, 'v') ? cell : { v: cell, s: ri === 0 ? 2 : 0 }; return xlsxCell(obj.v, `${colName(ci + 1)}${ri + 1}`, obj.s || 0); }).join('')}</row>`).join('');
  const cols = widths.length ? `<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>${cols}<sheetData>${rowXml}</sheetData></worksheet>`;
}
function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) { c ^= buf[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return (c ^ 0xffffffff) >>> 0;
}
function zipStore(files) {
  const locals = [], centrals = []; let offset = 0;
  for (const [name, content] of files) {
    const nameBuf = Buffer.from(name), data = Buffer.isBuffer(content) ? content : Buffer.from(content), crc = crc32(data), flags = 0x0800;
    const local = Buffer.alloc(30); local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(flags, 6); local.writeUInt16LE(0, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12); local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBuf.length, 26); local.writeUInt16LE(0, 28);
    locals.push(local, nameBuf, data);
    const cen = Buffer.alloc(46); cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(flags, 8); cen.writeUInt16LE(0, 10); cen.writeUInt16LE(0, 12); cen.writeUInt16LE(0, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(data.length, 20); cen.writeUInt32LE(data.length, 24); cen.writeUInt16LE(nameBuf.length, 28); cen.writeUInt16LE(0, 30); cen.writeUInt16LE(0, 32); cen.writeUInt16LE(0, 34); cen.writeUInt16LE(0, 36); cen.writeUInt32LE(0, 38); cen.writeUInt32LE(offset, 42);
    centrals.push(cen, nameBuf); offset += local.length + nameBuf.length + data.length;
  }
  const central = Buffer.concat(centrals), localAll = Buffer.concat(locals), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10); end.writeUInt32LE(central.length, 12); end.writeUInt32LE(localAll.length, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([localAll, central, end]);
}
function makeReportXlsx(st, report, aiSummary) {
  const H = v => ({ v, s: 1 }), T = v => ({ v, s: 2 }), S = v => ({ v, s: 3 }), W = v => ({ v, s: 4 }), D = v => ({ v, s: 5 });
  const dash = [[T('FoodWise Smart Food Waste Report'), '', '', ''], ['Generated', new Date(report.generatedAt).toLocaleString('en-IN'), 'Household', st.household?.name || 'Household'], ['', '', '', ''], [H('KPI'), H('Value'), H('Meaning'), H('Action')], ['Remaining grocery budget', report.budget.remaining, 'Budget - recorded spend', 'Use for BUY recommendations'], ['Items to buy now', report.buys.filter(x => x.decision === 'BUY').length, 'Pending list without duplicate inventory', report.buys.filter(x => x.decision === 'BUY').map(x => x.name).join(', ') || 'None'], ['Items expiring ≤3 days', report.expiry.filter(x => x.daysLeft <= 3).length, `Food value ₹${report.savings.urgentFoodValue}`, report.expiry.slice(0, 3).map(x => x.name).join(', ') || 'None'], ['Avoidable waste cost', report.waste.avoidableCost, `${report.waste.observedDays}-day log window`, `Top reason: ${report.waste.topReason.name}`], ['Estimated monthly avoidable waste', report.savings.monthlyAvoidableBaseline, 'Projected from current logs', `Goal: ${Math.round(report.savings.goalPct * 100)}% reduction`], ['12-month goal-based savings', report.savings.forecast.find(x => x.months === 12)?.goalSavings || 0, 'Estimate, not guarantee', `50% scenario: ₹${report.savings.forecast.find(x => x.months === 12)?.best50Savings || 0}`], ['', '', '', ''], [S('AI / Smart Recommendations'), '', '', ''], ...String(aiSummary || '').split(/\r?\n/).filter(Boolean).map((x, i) => [i + 1, x, '', ''])];
  const buy = [[T('What Can I Buy?'), '', '', '', '', ''], [H('Item'), H('Quantity'), H('Category'), H('Est. Price ₹'), H('Decision'), H('Reason')], ...report.buys.map(x => [x.name, x.qty, x.category || '', x.price, x.decision === 'BUY' ? S(x.decision) : x.decision === 'DELAY' ? W(x.decision) : D(x.decision), x.reason])];
  const exp = [[T('Expiry Priority / Eat First'), '', '', '', '', '', '', ''], [H('Item'), H('Quantity'), H('Location'), H('Expiry'), H('Days Left'), H('Cost ₹'), H('Priority'), H('Recommended Action')], ...report.expiry.map(x => [x.name, x.qty, x.place, x.expiry, x.daysLeft, Number(x.cost || 0), x.daysLeft <= 0 ? D('USE NOW / CHECK') : x.daysLeft <= 2 ? W('HIGH') : S('THIS WEEK'), x.daysLeft <= 1 ? 'Plan/use first today' : x.daysLeft <= 3 ? 'Plan within 2–3 days' : 'Schedule this week'])];
  const waste = [[T('Garbage / Waste Analysis'), '', '', '', '', ''], [H('Date'), H('Item'), H('Quantity'), H('Reason'), H('Cost ₹'), H('Avoidable')], ...(st.waste || []).map(x => [x.date, x.name, x.qty, x.reason, Number(x.cost || 0), x.avoidable ? 'Yes' : 'No']), ['', '', '', '', '', ''], [S('Summary'), '', '', '', '', ''], ['Worst item', report.waste.worstItem.name, '', '', report.waste.worstItem.cost, ''], ['Top avoidable reason', report.waste.topReason.name, '', '', report.waste.topReason.cost, ''], ['Total waste cost', '', '', '', report.waste.totalCost, ''], ['Avoidable waste cost', '', '', '', report.waste.avoidableCost, '']];
  const fore = [[T('Future Savings Forecast'), '', '', '', ''], [H('Horizon'), H('Current Baseline Waste ₹'), H(`Goal Savings @ ${Math.round(report.savings.goalPct * 100)}% ₹`), H('50% Reduction Scenario ₹'), H('Projected Waste After Goal ₹')], ...report.savings.forecast.map(x => [`${x.months} month${x.months > 1 ? 's' : ''}`, report.savings.monthlyAvoidableBaseline * x.months, x.goalSavings, x.best50Savings, x.projectedWasteAfterGoal]), ['', '', '', '', ''], ['Note', 'Estimates are based on current logged waste and may change as more data is recorded.', '', '', '']];
  const inv = [[T('Current Inventory'), '', '', '', '', '', '', ''], [H('Item'), H('Quantity'), H('Location'), H('Category'), H('Purchase'), H('Expiry'), H('Days Left'), H('Cost ₹')], ...(st.inventory || []).sort((a, b) => String(a.expiry).localeCompare(String(b.expiry))).map(x => [x.name, x.qty, x.place, x.category, x.purchase, x.expiry, reportDateDays(x.expiry), Number(x.cost || 0)])];
  const consumed = [[T('Consumed History'), '', '', '', '', '', ''], [H('Item'), H('Quantity'), H('Location'), H('Category'), H('Consumed Date'), H('Original Expiry'), H('Cost ₹')], ...(st.consumed || []).sort((a,b)=>String(b.consumedAt||b.consumedDate||'').localeCompare(String(a.consumedAt||a.consumedDate||''))).map(x => [x.name, x.qty, x.place || '', x.category || '', x.consumedDate || String(x.consumedAt||'').slice(0,10), x.expiry || '', Number(x.cost || 0)])];
  const ai = [[T('AI / Smart Action Brief'), '', '', ''], [H('Priority'), H('Recommendation'), H('Data basis'), H('Status')], ...String(aiSummary || '').split(/\r?\n/).filter(Boolean).map((x, i) => [i + 1, x, i < 2 ? 'Inventory + shopping + expiry' : i === 3 ? 'Waste logs' : 'Waste logs + goal', 'Live at export time'])];
  const analyticsDays = Array.from({ length: 14 }, (_, i) => { const d = day(i - 13); const logs = (st.waste || []).filter(x => x.date === d); return [d, logs.reduce((a, x) => a + Number(x.cost || 0), 0), logs.filter(x => x.avoidable).reduce((a, x) => a + Number(x.cost || 0), 0), logs.length]; });
  const expiryBuckets = [['Expired / today', report.expiry.filter(x => x.daysLeft <= 0).length], ['1–2 days', report.expiry.filter(x => x.daysLeft >= 1 && x.daysLeft <= 2).length], ['3–4 days', report.expiry.filter(x => x.daysLeft >= 3 && x.daysLeft <= 4).length], ['5–7 days', report.expiry.filter(x => x.daysLeft >= 5 && x.daysLeft <= 7).length]];
  const analytics = [[T('Analytics Data · Chart Ready'), '', '', ''], [H('Date'), H('Waste Cost ₹'), H('Avoidable Cost ₹'), H('Waste Logs')], ...analyticsDays, ['', '', '', ''], [S('Expiry Risk Buckets'), '', '', ''], [H('Bucket'), H('Items'), '', ''], ...expiryBuckets.map(x => [x[0], x[1], '', '']), ['', '', '', ''], [S('Forecast Series'), '', '', ''], [H('Months'), H('Goal Savings ₹'), H('50% Scenario ₹'), H('Projected Waste ₹')], ...report.savings.forecast.map(x => [x.months, x.goalSavings, x.best50Savings, x.projectedWasteAfterGoal])];
  const planner = [[T('Inventory-only Meal Planner'), '', '', '', ''], [H('Date'), H('Meal'), H('Plan'), H('Inventory Ingredients'), H('Servings')], ...Object.keys(st.meals || {}).sort().flatMap(d => ['Breakfast','Lunch','Dinner'].map(slot => [d, slot, st.meals?.[d]?.[slot] || '', (st.mealIngredients?.[d]?.[slot]?.uses || []).join(', '), Number(st.mealServings?.[d]?.[slot] || st.household?.currentServings || st.household?.members || 1)]))];
  const sheets = [
    ['Dashboard', dash, [30, 38, 34, 44]], ['AI Insights', ai, [12, 74, 32, 20]], ['Analytics Data', analytics, [18, 18, 20, 16]], ['Buy Recommendations', buy, [24, 16, 16, 14, 16, 58]], ['Expiry Priority', exp, [24, 16, 16, 15, 12, 12, 18, 34]], ['Waste Analysis', waste, [14, 24, 18, 30, 12, 12]], ['Savings Forecast', fore, [18, 24, 24, 24, 28]], ['Inventory Planner', planner, [16, 14, 38, 48, 12]], ['Inventory', inv, [24, 16, 16, 16, 14, 14, 12, 12]], ['Consumed History', consumed, [24, 16, 16, 16, 18, 16, 12]]
  ];
  const styleXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="16"/><name val="Calibri"/></font><font><b/><color rgb="FF103A2C"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="7"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F9F6E"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0B1F1A"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE7F7F0"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFFF1D6"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFFDE6E3"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="2"><border/><border><left style="thin"><color rgb="FFDDE7E1"/></left><right style="thin"><color rgb="FFDDE7E1"/></right><top style="thin"><color rgb="FFDDE7E1"/></top><bottom style="thin"><color rgb="FFDDE7E1"/></bottom></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="6"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf><xf numFmtId="0" fontId="2" fillId="3" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="4" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"/><xf numFmtId="0" fontId="3" fillId="5" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"/><xf numFmtId="0" fontId="3" fillId="6" borderId="1" xfId="0" applyFill="1" applyFont="1" applyBorder="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`;
  const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${sheets.map((s, i) => `<sheet name="${xmlEsc(s[0])}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`;
  const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`;
  const files = [['[Content_Types].xml', contentTypes], ['_rels/.rels', rootRels], ['xl/workbook.xml', workbook], ['xl/_rels/workbook.xml.rels', wbRels], ['xl/styles.xml', styleXml], ...sheets.map((s, i) => [`xl/worksheets/sheet${i + 1}.xml`, xlsxSheet(s[1], s[2])])];
  return zipStore(files);
}

const productMap = {
  '8901030895487': { name: 'Milk', qty: '1 L', category: 'Dairy', place: 'Fridge', cost: 68, emoji: '🥛' },
  '8901719123456': { name: 'Bread', qty: '1 loaf', category: 'Bakery', place: 'Pantry', cost: 55, emoji: '🍞' }
};

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/api/health') {
      let mongo = LOCAL_MODE ? 'local-json' : 'disconnected';
      if (!LOCAL_MODE) { try { await mongoDb.command({ ping: 1 }); mongo = 'connected'; } catch {} }
      const ok = LOCAL_MODE || mongo === 'connected';
      return send(res, ok ? 200 : 503, { ok, app: 'FoodWise Pro v21 · Profile + Firebase + MongoDB', mode: LOCAL_MODE ? 'local' : 'cloud', storage: LOCAL_MODE ? 'JSON file' : 'MongoDB', mongo, firebaseConfigured: firebaseConfigured(), time: new Date().toISOString() });
    }
    if (url.pathname === '/api/config') return send(res, 200, { localMode: LOCAL_MODE, geminiConfigured: Boolean(GEMINI_API_KEY), cloudflareConfigured: cloudflareConfigured(), firebaseConfigured: firebaseConfigured(), database: LOCAL_MODE ? 'Local JSON' : 'MongoDB', imageProvider: cloudflareConfigured() ? 'Cloudflare Workers AI' : 'Local food assets', imageModel: activeImageModel, textModel: GEMINI_API_KEY ? activeTextModel : 'FoodWise local AI', apiVersion: GEMINI_API_VERSION });
    if (url.pathname.startsWith('/api/images/') && req.method === 'GET') {
      if (LOCAL_MODE || !imageFilesCol || !imagesBucket) return send(res, 404, { error: 'Generated image storage is unavailable in local mode' });
      const rawId = url.pathname.split('/').pop();
      if (!ObjectId.isValid(rawId)) return send(res, 404, { error: 'Image not found' });
      const oid = new ObjectId(rawId);
      const file = await imageFilesCol.findOne({ _id: oid });
      if (!file) return send(res, 404, { error: 'Image not found' });
      res.writeHead(200, { 'Content-Type': file.metadata?.mime || 'image/jpeg', 'Cache-Control': 'public, max-age=604800, immutable' });
      const stream = imagesBucket.openDownloadStream(oid);
      stream.on('error', () => { if (!res.headersSent) send(res, 404, { error: 'Image not found' }); else res.destroy(); });
      return stream.pipe(res);
    }
    if (url.pathname === '/api/auth/me' && req.method === 'GET') {
      const user = await sessionUser(req);
      return send(res, 200, { authenticated: Boolean(user), user: publicUser(user) });
    }
    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      const b = await parseBody(req);
      if (LOCAL_MODE) {
        const email = safeText(b.email, 160).toLowerCase();
        const password = String(b.password || '');
        if (!email || !password) return send(res, 400, { error: 'Email and password are required' });
        if (!verifyLocalPassword(email, password)) return send(res, 401, { error: 'Invalid local email or password' });
        return send(res, 200, { ok: true, user: publicUser(localUser()), localMode: true }, 'application/json; charset=utf-8', { 'Set-Cookie': sessionCookie(LOCAL_SESSION_TOKEN) });
      }
      const email = safeText(b.email, 160).toLowerCase();
      const password = String(b.password || '');
      if (!email || !password) return send(res, 400, { error: 'Email and password are required' });
      let fb;
      try { fb = await firebaseSignIn(email, password); }
      catch (err) { return send(res, err.status || 401, { error: err.message }); }
      let user = await usersCol.findOne({ _id: String(fb.localId) });
      if (!user) {
        const inferredName = email.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, m => m.toUpperCase()) || 'FoodWise User';
        user = { _id: String(fb.localId), firebaseUid: String(fb.localId), email: String(fb.email || email).toLowerCase(), name: inferredName, createdAt: new Date(), updatedAt: new Date() };
        await usersCol.updateOne({ _id: user._id }, { $setOnInsert: user }, { upsert: true });
        await getUserState(user);
      }
      const cookie = await createSession(user._id);
      return send(res, 200, { ok: true, user: publicUser(user) }, 'application/json; charset=utf-8', { 'Set-Cookie': cookie });
    }
    if (url.pathname === '/api/auth/signup' && req.method === 'POST') {
      const b = await parseBody(req);
      if (LOCAL_MODE) {
        const name = safeText(b.name, 80), email = safeText(b.email, 160).toLowerCase(), password = String(b.password || '');
        const householdName = safeText(b.householdName, 100);
        const members = Math.max(1, Math.min(20, Number(b.members || 1)));
        if (!name || !email.includes('@') || password.length < 6) return send(res, 400, { error: 'Name, valid email and 6+ character password are required' });
        const rec = writeLocalAuth({ name, email, password });
        const user = localUser(rec);
        const initial = initialStateForUser(user, { name, householdName, members });
        initial.version = 21;
        initial.household.theme = 'dark';
        await saveUserState(user, initial);
        return send(res, 200, { ok: true, user: publicUser(user), localMode: true }, 'application/json; charset=utf-8', { 'Set-Cookie': sessionCookie(LOCAL_SESSION_TOKEN) });
      }
      const name = safeText(b.name, 80), email = safeText(b.email, 160).toLowerCase(), password = String(b.password || '');
      const householdName = safeText(b.householdName, 100);
      const members = Math.max(1, Math.min(20, Number(b.members || 1)));
      if (!name || !email.includes('@') || password.length < 6) return send(res, 400, { error: 'Name, valid email and 6+ character password are required' });
      let fb;
      try { fb = await firebaseSignUp(email, password); }
      catch (err) { return send(res, err.status || 400, { error: err.message }); }
      const user = { _id: String(fb.localId), firebaseUid: String(fb.localId), name, email: String(fb.email || email).toLowerCase(), createdAt: new Date(), updatedAt: new Date() };
      try {
        await usersCol.updateOne({ _id: user._id }, { $set: user }, { upsert: true });
        const initial = initialStateForUser(user, { name, householdName, members });
        await statesCol.updateOne({ _id: user._id }, { $set: { data: initial, updatedAt: new Date() }, $setOnInsert: { createdAt: new Date() } }, { upsert: true });
      } catch (err) {
        await firebaseDelete(fb.idToken);
        throw err;
      }
      const cookie = await createSession(user._id);
      return send(res, 200, { ok: true, user: publicUser(user) }, 'application/json; charset=utf-8', { 'Set-Cookie': cookie });
    }
    if (url.pathname === '/api/auth/forgot-password' && req.method === 'POST') {
      const b = await parseBody(req);
      const email = safeText(b.email, 160).toLowerCase();
      if (!email.includes('@')) return send(res, 400, { error: 'Please enter a valid email address' });
      if (!firebaseConfigured()) {
        if (LOCAL_MODE) return send(res, 200, { ok: true, message: 'This localhost build is using Local Mode. Firebase password reset becomes active when FIREBASE_API_KEY is configured and the app is deployed in Cloud Mode.' });
        return send(res, 503, { error: 'Firebase Authentication is not configured' });
      }
      try {
        await firebaseSendPasswordReset(email);
      } catch (err) {
        // Do not reveal whether an account exists.
        if (!['EMAIL_NOT_FOUND','USER_DISABLED'].includes(err.firebaseCode)) return send(res, err.status || 400, { error: err.message });
      }
      return send(res, 200, { ok: true, message: 'If a Firebase account exists for this email, a secure password reset link has been sent.' });
    }
    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      if (LOCAL_MODE) return send(res, 200, { ok: true, localMode: true }, 'application/json; charset=utf-8', { 'Set-Cookie': sessionCookie('', 0) });
      await destroySession(req);
      return send(res, 200, { ok: true }, 'application/json; charset=utf-8', { 'Set-Cookie': sessionCookie('', 0) });
    }

    const user = url.pathname.startsWith('/api/') ? await sessionUser(req) : null;
    if (url.pathname.startsWith('/api/') && !user) return send(res, 401, { error: 'Login required' });
    if (url.pathname === '/api/auth/change-password' && req.method === 'POST') {
      const b = await parseBody(req);
      const currentPassword = String(b.currentPassword || '');
      const newPassword = String(b.newPassword || '');
      if (!currentPassword || newPassword.length < 6) return send(res, 400, { error: 'Current password and a new password of at least 6 characters are required' });
      if (currentPassword === newPassword) return send(res, 400, { error: 'New password must be different from the current password' });
      if (LOCAL_MODE) {
        const rec = readLocalAuth();
        if (!verifyLocalPassword(rec.email, currentPassword)) return send(res, 401, { error: 'Current password is incorrect' });
        writeLocalAuth({ name: rec.name, email: rec.email, password: newPassword });
        return send(res, 200, { ok: true, localMode: true, message: 'Local FoodWise password updated' });
      }
      if (!firebaseConfigured()) return send(res, 503, { error: 'Firebase Authentication is not configured' });
      let fb;
      try { fb = await firebaseSignIn(user.email, currentPassword); }
      catch (err) { return send(res, 401, { error: 'Current password is incorrect' }); }
      try { await firebaseChangePassword(fb.idToken, newPassword); }
      catch (err) { return send(res, err.status || 400, { error: err.message }); }
      return send(res, 200, { ok: true, message: 'Firebase password updated successfully' });
    }
    if (url.pathname === '/api/state' && req.method === 'GET') return send(res, 200, await getUserState(user));
    if (url.pathname === '/api/state' && req.method === 'PUT') { const body = await parseBody(req); await saveUserState(user, body); return send(res, 200, { ok: true }); }
    if (url.pathname === '/api/reset' && req.method === 'POST') { const fresh = LOCAL_MODE ? migrateState(seed(), localUser()) : initialStateForUser(user, { name: user.name, members: 1, householdName: `${user.name || 'My'}'s Household` }); await saveUserState(user, fresh); return send(res, 200, fresh); }
    if (url.pathname === '/api/ai' && req.method === 'POST') {
      const b = await parseBody(req); const st = await getUserState(user);
      if (!GEMINI_API_KEY) {
        const local = aiReply(b.question, st, b.language);
        return send(res, 200, { answer: local.answer, youtubeSearchUrl: local.youtubeQuery ? youtubeSearchUrl(local.youtubeQuery) : '', youtubeQuery: local.youtubeQuery, provider: 'local', warning: 'GEMINI_API_KEY is not configured' });
      }
      try {
        const reply = await aiReplyGemini(b.question, st, b.language);
        return send(res, 200, { answer: reply.answer, youtubeSearchUrl: reply.youtubeQuery ? youtubeSearchUrl(reply.youtubeQuery) : '', youtubeQuery: reply.youtubeQuery, provider: 'gemini', model: activeTextModel });
      } catch (err) {
        console.error('Gemini chat failed:', err.message);
        const local = aiReply(b.question, st, b.language);
        return send(res, 200, { answer: local.answer, youtubeSearchUrl: local.youtubeQuery ? youtubeSearchUrl(local.youtubeQuery) : '', youtubeQuery: local.youtubeQuery, provider: 'local-fallback', warning: err.message, model: activeTextModel });
      }
    }
    if (url.pathname === '/api/gemini-test' && req.method === 'GET') {
      if (!GEMINI_API_KEY) return send(res, 200, { ok: false, configured: false, message: 'GEMINI_API_KEY is missing in Render/.env' });
      try {
        const { data, model } = await geminiGenerateWithFallback('text', { contents: [{ role: 'user', parts: [{ text: 'Reply only with: FoodWise AI OK' }] }], generationConfig: { temperature: 0, maxOutputTokens: 20 } });
        const text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim();
        return send(res, 200, { ok: true, configured: true, model, message: text || 'Gemini connection successful' });
      } catch (err) { return send(res, 200, { ok: false, configured: true, model: activeTextModel, message: err.message, status: err.status || 500 }); }
    }
    if (url.pathname === '/api/food-image' && req.method === 'POST') {
      const b = await parseBody(req);
      if (!cloudflareConfigured()) return send(res, 503, { error: 'Cloudflare image AI not configured', setup: 'Add CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_API_TOKEN in Render Environment/.env' });
      const result = await generateFoodImage(b.name, b.quantity);
      return send(res, 200, { ok: true, ...result });
    }
    if (url.pathname === '/api/cloudflare-test' && req.method === 'GET') {
      if (!cloudflareConfigured()) return send(res, 200, { ok: false, configured: false, message: 'Cloudflare Account ID / API Token missing', model: CLOUDFLARE_IMAGE_MODEL });
      try { const result = await generateFoodImage('one fresh banana', '1 pc'); return send(res, 200, { ok: true, configured: true, provider: result.provider, model: result.model, image: result.image, cached: result.cached }); }
      catch (err) { return send(res, 200, { ok: false, configured: true, model: CLOUDFLARE_IMAGE_MODEL, message: err.message, status: err.status || 500 }); }
    }
    if (url.pathname === '/api/nutrition' && req.method === 'POST') { const b = await parseBody(req); const nutrition = await getNutrition(b.name, b.quantity); return send(res, 200, { ok: true, nutrition }); }
    if (url.pathname === '/api/smart-report' && req.method === 'GET') { const st = await getUserState(user), report = buildSmartReport(st), aiSummary = await buildAiReportSummary(report); return send(res, 200, { ok: true, report, aiSummary, provider: GEMINI_API_KEY ? 'gemini-or-fallback' : 'local' }); }
    if (url.pathname === '/api/report.xlsx' && req.method === 'GET') {
      const st = await getUserState(user), report = buildSmartReport(st), aiSummary = await buildAiReportSummary(report), book = makeReportXlsx(st, report, aiSummary);
      res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': 'attachment; filename="FoodWise-Smart-Report.xlsx"', 'Content-Length': book.length, 'Cache-Control': 'no-store' });
      return res.end(book);
    }
    if (url.pathname === '/api/product' && req.method === 'GET') { const code = url.searchParams.get('barcode') || ''; return send(res, 200, { found: !!productMap[code], product: productMap[code] || null, barcode: code }); }

    let filePath = url.pathname === '/' ? path.join(PUBLIC, 'index.html') : path.join(PUBLIC, decodeURIComponent(url.pathname));
    if (!filePath.startsWith(PUBLIC)) return send(res, 403, { error: 'Forbidden' });
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const ext = path.extname(filePath).toLowerCase();
      const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon' };
      const noCache = ['.html', '.css', '.js', '.json'].includes(ext) || url.pathname.startsWith('/generated/');
      res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': noCache ? 'no-store' : 'public, max-age=3600' });
      return fs.createReadStream(filePath).pipe(res);
    }
    send(res, 404, { error: 'Not found' });
  } catch (err) {
    console.error(err);
    const status = err.status === 429 ? 429 : err.status === 401 || err.status === 403 ? 502 : 500;
    send(res, status, { error: 'Server error', message: err.message });
  }
});

server.on('error', err => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\n  Port ${PORT} is already busy.`);
    console.error('  Windows: taskkill /F /IM node.exe');
    console.error('  Or PowerShell: $env:PORT=3001; npm start\n');
    process.exit(1);
  }
  throw err;
});
async function startServer() {
  try {
    await connectMongo();
    server.listen(PORT, () => {
      console.log('\n  FoodWise Pro v21 · Profile + Firebase + MongoDB ✅');
      console.log(`  URL:     http://localhost:${PORT}`);
      console.log(`  Health:  http://localhost:${PORT}/api/health`);
      console.log(`  Mode:    ${LOCAL_MODE ? 'LOCAL · JSON storage · login gate enabled' : `CLOUD · MongoDB ${MONGODB_DB_NAME}`}`);
      console.log(`  Firebase Auth: ${LOCAL_MODE ? 'local login active · Firebase skipped' : (firebaseConfigured() ? 'configured ✅' : 'not configured')}`);
      console.log(`  Gemini Chat: ${GEMINI_API_KEY ? 'configured ✅' : 'local fallback active'}`);
      console.log(`  Cloudflare Images: ${cloudflareConfigured() ? 'configured ✅' : 'optional / local assets active'}`);
    });
  } catch (err) {
    console.error('\nFoodWise startup failed:', err.message);
    process.exit(1);
  }
}
process.on('SIGTERM', async () => { try { await mongoClient?.close(); } finally { process.exit(0); } });
process.on('SIGINT', async () => { try { await mongoClient?.close(); } finally { process.exit(0); } });
startServer();
