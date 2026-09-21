const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const COOKIE_NAME = 'canteen_session';
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
  throw new Error('SESSION_SECRET must be set in production.');
}
const SESSION_SECRET = process.env.SESSION_SECRET || 'local-development-secret-change-before-production';
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'store.json');
const ACTIVE_STATUSES = new Set(['queued', 'preparing', 'ready']);
const ORDER_STATUSES = new Set(['queued', 'preparing', 'ready', 'collected']);

const defaultMenu = [
  { id: 'thali', name: 'Veg Thali', detail: 'Rice, dal, seasonal veg and chapati', price: 60, category: 'meals', symbol: 'Thali', color: 'meals', available: true },
  { id: 'dosa', name: 'Masala Dosa', detail: 'Crispy dosa, potato masala and chutney', price: 40, category: 'meals', symbol: 'Dosa', color: 'meals', available: true },
  { id: 'sandwich', name: 'Grilled Sandwich', detail: 'Cheese, veggies and house spread', price: 35, category: 'snacks', symbol: 'Sandwich', color: 'snacks', available: true },
  { id: 'samosa', name: 'Crispy Samosa', detail: 'Fresh fried with mint chutney', price: 15, category: 'snacks', symbol: 'Samosa', color: 'snacks', available: true },
  { id: 'coffee', name: 'Cold Coffee', detail: 'Chilled, creamy and made to order', price: 30, category: 'drinks', symbol: 'Coffee', color: 'drinks', available: true },
  { id: 'lime', name: 'Fresh Lime Soda', detail: 'Sweet, salty or mixed - your call', price: 25, category: 'drinks', symbol: 'Lime', color: 'drinks', available: true },
  { id: 'gulab', name: 'Gulab Jamun', detail: 'Two warm pieces in rose syrup', price: 25, category: 'sweets', symbol: 'Sweet', color: 'sweets', available: true },
  { id: 'pasta', name: 'Creamy Pasta', detail: 'Available after 2 pm', price: 55, category: 'meals', symbol: 'Pasta', color: 'sweets', available: false }
];

function normalizeSchoolId(value) {
  return String(value || '').trim().toUpperCase();
}

function validSchoolId(value) {
  return /^[A-Z0-9_-]{3,30}$/.test(value);
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  if (!storedHash || !storedHash.includes(':')) return false;
  const [salt, expectedHash] = storedHash.split(':');
  const actualHash = crypto.scryptSync(password, salt, 64).toString('hex');
  const expected = Buffer.from(expectedHash, 'hex');
  const actual = Buffer.from(actualHash, 'hex');
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

function seedUser(id, name, role, password) {
  return { id: crypto.randomUUID(), schoolId: id, name, role, passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
}

function createDefaultStore() {
  return {
    users: [
      seedUser(normalizeSchoolId(process.env.STUDENT_SCHOOL_ID || 'STU2026001'), 'Demo Student', 'student', process.env.STUDENT_PASSWORD || 'student123'),
      seedUser(normalizeSchoolId(process.env.STAFF_SCHOOL_ID || 'STAFF1001'), 'Sana Khan', 'staff', process.env.STAFF_PASSWORD || 'staff123'),
      seedUser(normalizeSchoolId(process.env.ADMIN_SCHOOL_ID || 'ADMIN001'), 'Canteen Admin', 'admin', process.env.ADMIN_PASSWORD || 'admin123')
    ],
    menu: defaultMenu,
    orders: [],
    nextToken: 214
  };
}

function ensureStore() {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(STORE_PATH)) {
    fs.writeFileSync(STORE_PATH, JSON.stringify(createDefaultStore(), null, 2));
  }
}

function readStore() {
  ensureStore();
  return JSON.parse(fs.readFileSync(STORE_PATH, 'utf8'));
}

function writeStore(store) {
  const temporaryPath = `${STORE_PATH}.tmp`;
  fs.writeFileSync(temporaryPath, JSON.stringify(store, null, 2));
  fs.renameSync(temporaryPath, STORE_PATH);
}

function publicUser(user) {
  return { id: user.id, schoolId: user.schoolId, name: user.name, role: user.role, createdAt: user.createdAt };
}

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function signSession(user) {
  const payload = base64url(JSON.stringify({ sub: user.id, role: user.role, exp: Date.now() + 8 * 60 * 60 * 1000 }));
  const signature = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  return `${payload}.${signature}`;
}

function readSession(token) {
  if (!token || !token.includes('.')) return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payload, signature] = parts;
  const expected = crypto.createHmac('sha256', SESSION_SECRET).update(payload).digest('base64url');
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (signatureBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)) return null;
  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return decoded.exp > Date.now() ? decoded : null;
  } catch {
    return null;
  }
}

function parseCookies(header = '') {
  return Object.fromEntries(header.split(';').map(cookie => {
    const [key, ...value] = cookie.trim().split('=');
    return [key, decodeURIComponent(value.join('='))];
  }).filter(([key]) => key));
}

function sessionCookie(token) {
  const parts = [`${COOKIE_NAME}=${encodeURIComponent(token)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=28800'];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

function clearSessionCookie() {
  const parts = [`${COOKIE_NAME}=`, 'Path=/', 'HttpOnly', 'SameSite=Lax', 'Max-Age=0'];
  if (process.env.NODE_ENV === 'production') parts.push('Secure');
  return parts.join('; ');
}

function attachUser(request, response, next) {
  const session = readSession(parseCookies(request.headers.cookie)[COOKIE_NAME]);
  if (session) {
    const store = readStore();
    request.user = store.users.find(user => user.id === session.sub) || null;
  }
  next();
}

function requireAuth(request, response, next) {
  if (!request.user) return response.status(401).json({ message: 'Please log in to continue.' });
  next();
}

function allowRoles(...roles) {
  return (request, response, next) => {
    if (!request.user) return response.status(401).json({ message: 'Please log in to continue.' });
    if (!roles.includes(request.user.role)) return response.status(403).json({ message: 'Your account does not have permission for that action.' });
    next();
  };
}

function activeOrders(store) {
  return store.orders.filter(order => ACTIVE_STATUSES.has(order.status)).sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
}

function queueDetails(order, store) {
  const queue = activeOrders(store);
  const position = queue.findIndex(item => item.id === order.id) + 1;
  return {
    ...order,
    position: position || null,
    estimatedWait: order.status === 'ready' ? 'Now' : position ? `About ${Math.max(3, position * 3)} min` : 'Complete'
  };
}

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(express.json({ limit: '50kb' }));
app.use(attachUser);

app.get('/api/health', (request, response) => response.status(200).json({ status: 'ok' }));

app.get('/api/menu', (request, response) => {
  const store = readStore();
  response.json({ menu: store.menu });
});

app.post('/api/auth/login', (request, response) => {
  const schoolId = normalizeSchoolId(request.body?.schoolId);
  const password = String(request.body?.password || '');
  const store = readStore();
  const user = store.users.find(candidate => candidate.schoolId === schoolId);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return response.status(401).json({ message: 'Incorrect ID or password.' });
  }
  response.setHeader('Set-Cookie', sessionCookie(signSession(user)));
  response.json({ user: publicUser(user) });
});

app.post('/api/auth/register', (request, response) => {
  const name = String(request.body?.name || '').trim();
  const schoolId = normalizeSchoolId(request.body?.schoolId);
  const password = String(request.body?.password || '');
  if (name.length < 2 || name.length > 60) return response.status(400).json({ message: 'Enter a name between 2 and 60 characters.' });
  if (!validSchoolId(schoolId)) return response.status(400).json({ message: 'Use a valid school ID (3-30 letters, numbers, - or _).' });
  if (password.length < 8 || password.length > 128) return response.status(400).json({ message: 'Password must be 8-128 characters.' });
  const store = readStore();
  if (store.users.some(user => user.schoolId === schoolId)) return response.status(409).json({ message: 'That school ID is already registered.' });
  const user = { id: crypto.randomUUID(), schoolId, name, role: 'student', passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
  store.users.push(user);
  writeStore(store);
  response.setHeader('Set-Cookie', sessionCookie(signSession(user)));
  response.status(201).json({ user: publicUser(user) });
});

app.get('/api/auth/me', (request, response) => response.json({ user: request.user ? publicUser(request.user) : null }));

app.post('/api/auth/logout', (request, response) => {
  response.setHeader('Set-Cookie', clearSessionCookie());
  response.status(204).end();
});

app.post('/api/orders', allowRoles('student'), (request, response) => {
  const requestedItems = Array.isArray(request.body?.items) ? request.body.items : [];
  if (!requestedItems.length || requestedItems.length > 10) return response.status(400).json({ message: 'Choose between 1 and 10 menu items.' });
  const store = readStore();
  const menuById = new Map(store.menu.map(item => [item.id, item]));
  const items = [];
  for (const requestedItem of requestedItems) {
    const item = menuById.get(String(requestedItem.id));
    const quantity = Number(requestedItem.quantity);
    if (!item || !item.available || !Number.isInteger(quantity) || quantity < 1 || quantity > 5) {
      return response.status(400).json({ message: 'One or more chosen menu items are not available.' });
    }
    items.push({ id: item.id, name: item.name, price: item.price, quantity });
  }
  const total = items.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const token = `A${store.nextToken++}`;
  const order = { id: crypto.randomUUID(), token, studentId: request.user.id, studentName: request.user.name, items, total, status: 'queued', paymentStatus: 'demo-paid', createdAt: new Date().toISOString() };
  store.orders.push(order);
  writeStore(store);
  response.status(201).json({ order: queueDetails(order, store) });
});

app.get('/api/orders/me', allowRoles('student'), (request, response) => {
  const store = readStore();
  response.json({ orders: store.orders.filter(order => order.studentId === request.user.id).map(order => queueDetails(order, store)) });
});

app.get('/api/queue/me', allowRoles('student'), (request, response) => {
  const store = readStore();
  const order = store.orders.filter(candidate => candidate.studentId === request.user.id && ACTIVE_STATUSES.has(candidate.status)).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  response.json({ order: order ? queueDetails(order, store) : null });
});

app.get('/api/staff/orders', allowRoles('staff', 'admin'), (request, response) => {
  const store = readStore();
  response.json({ orders: activeOrders(store).map(order => queueDetails(order, store)) });
});

app.patch('/api/staff/orders/:id', allowRoles('staff', 'admin'), (request, response) => {
  const status = String(request.body?.status || '');
  if (!ORDER_STATUSES.has(status)) return response.status(400).json({ message: 'Invalid order status.' });
  const store = readStore();
  const order = store.orders.find(candidate => candidate.id === request.params.id);
  if (!order) return response.status(404).json({ message: 'Order not found.' });
  const transitions = { queued: ['preparing'], preparing: ['ready'], ready: ['collected'], collected: [] };
  if (!transitions[order.status].includes(status)) return response.status(400).json({ message: `Cannot change a ${order.status} order to ${status}.` });
  order.status = status;
  order.updatedAt = new Date().toISOString();
  writeStore(store);
  response.json({ order: queueDetails(order, store) });
});

app.patch('/api/staff/menu/:id', allowRoles('staff', 'admin'), (request, response) => {
  const store = readStore();
  const menuItem = store.menu.find(item => item.id === request.params.id);
  if (!menuItem) return response.status(404).json({ message: 'Menu item not found.' });
  if (typeof request.body?.available !== 'boolean') return response.status(400).json({ message: 'Provide an available true/false value.' });
  menuItem.available = request.body.available;
  writeStore(store);
  response.json({ item: menuItem });
});

app.get('/api/admin/users', allowRoles('admin'), (request, response) => {
  const store = readStore();
  response.json({ users: store.users.map(publicUser) });
});

app.get('/api/admin/reports', allowRoles('admin'), (request, response) => {
  const store = readStore();
  response.json({
    totalOrders: store.orders.length,
    readyOrders: store.orders.filter(order => order.status === 'ready').length,
    studentCount: store.users.filter(user => user.role === 'student').length
  });
});

app.post('/api/admin/staff', allowRoles('admin'), (request, response) => {
  const name = String(request.body?.name || '').trim();
  const schoolId = normalizeSchoolId(request.body?.schoolId);
  const password = String(request.body?.password || '');
  if (name.length < 2 || name.length > 60 || !validSchoolId(schoolId) || password.length < 8 || password.length > 128) {
    return response.status(400).json({ message: 'Enter a valid name, staff ID, and password of at least 8 characters.' });
  }
  const store = readStore();
  if (store.users.some(user => user.schoolId === schoolId)) return response.status(409).json({ message: 'That ID is already registered.' });
  const staffUser = { id: crypto.randomUUID(), schoolId, name, role: 'staff', passwordHash: hashPassword(password), createdAt: new Date().toISOString() };
  store.users.push(staffUser);
  writeStore(store);
  response.status(201).json({ user: publicUser(staffUser) });
});

app.use('/data', (request, response) => response.status(404).json({ message: 'Not found.' }));
app.use(express.static(__dirname, { index: 'index.html', dotfiles: 'deny' }));
app.use((request, response) => response.status(404).json({ message: 'Not found.' }));

ensureStore();
app.listen(PORT, () => console.log(`Canteen Queue server listening on port ${PORT}`));
