const state = {
  user: null,
  menu: [],
  cart: {},
  category: 'all',
  search: '',
  staffOrders: [],
};

const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const menuGrid = $('#menu-grid');
const cartItems = $('#cart-items');
const cartEmpty = $('#cart-empty');
const cartContent = $('#cart-content');
const cartTotal = $('#cart-total');
const cartItemsCount = $('#cart-items-count');
const queueCount = $('.queue-count');
const toast = $('#toast');

function escapeHtml(value = '') {
  return String(value).replace(/[&<>'"]/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
  }[character]));
}

function money(value) {
  return `Rs. ${Number(value).toFixed(0)}`;
}

function showToast(message, type = '') {
  toast.textContent = message;
  toast.className = `show ${type}`;
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => { toast.className = ''; }, 3200);
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    ...options,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.message || 'Something went wrong. Please try again.');
    error.status = response.status;
    throw error;
  }
  return data;
}

function cartEntries() {
  return Object.entries(state.cart).filter(([, quantity]) => quantity > 0);
}

function currentCartCount() {
  return cartEntries().reduce((total, [, quantity]) => total + quantity, 0);
}

function currentCartTotal() {
  return cartEntries().reduce((total, [id, quantity]) => {
    const item = state.menu.find(menuItem => menuItem.id === id);
    return total + (item ? item.price * quantity : 0);
  }, 0);
}

function roleLabel(role) {
  return role ? `${role.charAt(0).toUpperCase()}${role.slice(1)}` : '';
}

function isStudent() {
  return state.user?.role === 'student';
}

function isStaff() {
  return ['staff', 'admin'].includes(state.user?.role);
}

function isAdmin() {
  return state.user?.role === 'admin';
}

function renderMenu() {
  const items = state.menu.filter(item =>
    (state.category === 'all' || item.category === state.category) &&
    `${item.name} ${item.detail}`.toLowerCase().includes(state.search.toLowerCase())
  );

  menuGrid.innerHTML = items.map(item => `
    <article class="menu-card ${item.available ? '' : 'item-unavailable'}">
      <div class="food-art ${escapeHtml(item.color || item.category)}"><span>${escapeHtml(item.symbol || 'Meal')}</span></div>
      <div class="menu-card-info">
        <h3>${escapeHtml(item.name)}</h3>
        <p>${escapeHtml(item.detail)}</p>
        <div class="menu-card-bottom">
          <span class="menu-card-price">${money(item.price)}</span>
          ${item.available
            ? `<button class="add-button" data-add="${escapeHtml(item.id)}" aria-label="Add ${escapeHtml(item.name)}">+</button>`
            : '<span class="sold-out">SOLD OUT</span>'}
        </div>
      </div>
    </article>`).join('') || '<p class="no-menu">Nothing matches that search. Try another dish.</p>';
}

function renderCart() {
  const entries = cartEntries();
  const count = currentCartCount();
  const allowed = isStudent();
  cartItemsCount.textContent = count;
  queueCount.textContent = state.user?.role === 'student' ? '1' : '0';

  if (!allowed) {
    cartEmpty.hidden = false;
    cartContent.hidden = true;
    cartEmpty.innerHTML = `<span>i</span><p>${state.user ? 'Only student accounts can place food orders.' : 'Log in as a student to place an order.'}</p><button class="cart-login-link login-trigger">${state.user ? 'Use a student account' : 'Student login'}</button>`;
    return;
  }

  cartEmpty.hidden = entries.length > 0;
  cartContent.hidden = entries.length === 0;
  cartEmpty.innerHTML = '<span>i</span><p>Your cart is feeling a little hungry.</p><a href="#menu">Browse today\'s menu</a>';
  if (!entries.length) return;

  cartItems.innerHTML = entries.map(([id, quantity]) => {
    const item = state.menu.find(menuItem => menuItem.id === id);
    if (!item) return '';
    return `<div class="cart-item"><p>${escapeHtml(item.name)}</p><strong>${money(item.price * quantity)}</strong><small><span class="quantity"><button data-change="${escapeHtml(id)}" data-delta="-1" aria-label="Remove one ${escapeHtml(item.name)}">-</button>${quantity}<button data-change="${escapeHtml(id)}" data-delta="1" aria-label="Add one ${escapeHtml(item.name)}">+</button></span></small></div>`;
  }).join('');
  cartTotal.textContent = money(currentCartTotal());
}

function renderStaffOrders() {
  const list = $('#staff-orders-list');
  if (!isStaff()) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = state.staffOrders.map(order => `
    <div class="staff-order">
      <strong>#${escapeHtml(order.token)}</strong>
      <p>${escapeHtml(order.items.map(item => item.name).join(' + '))}<small>Student: ${escapeHtml(order.studentName)} - ${new Date(order.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</small></p>
      <span class="order-status ${escapeHtml(order.status)}">${escapeHtml(order.status.toUpperCase())}</span>
      <button class="status-action" data-order-status="${escapeHtml(order.id)}" data-status="${order.status === 'queued' ? 'preparing' : order.status === 'preparing' ? 'ready' : 'collected'}">${order.status === 'queued' ? 'Start' : order.status === 'preparing' ? 'Ready' : order.status === 'ready' ? 'Collect' : 'Done'}</button>
    </div>`).join('') || '<p class="empty-state">There are no active orders right now.</p>';
  const active = state.staffOrders.filter(order => ['queued', 'preparing'].includes(order.status)).length;
  $('#active-orders').textContent = active;
}

function renderStaffMenu() {
  const list = $('#staff-menu-list');
  if (!isStaff()) {
    list.innerHTML = '';
    return;
  }
  list.innerHTML = state.menu.map(item => `<div class="staff-menu-row"><span><strong>${escapeHtml(item.name)}</strong><small>${money(item.price)}</small></span><button class="menu-availability ${item.available ? 'available' : ''}" data-menu-availability="${escapeHtml(item.id)}" data-available="${String(!item.available)}">${item.available ? 'Available' : 'Sold out'}</button></div>`).join('');
}

function applyAuthState() {
  document.body.dataset.role = state.user?.role || 'guest';
  const signedIn = Boolean(state.user);
  $('#auth-button').hidden = signedIn;
  $('#logout-button').hidden = !signedIn;
  $('#current-user').hidden = !signedIn;
  $('#current-user').textContent = signedIn ? `${state.user.name} - ${roleLabel(state.user.role)}` : '';
  $('#staff').hidden = !isStaff();
  $('#staff-menu').hidden = !isStaff();
  $('#admin').hidden = !isAdmin();
  $('#staff-nav').hidden = !isStaff();
  $('#admin-nav').hidden = !isAdmin();
  renderCart();
  renderStaffOrders();
  renderStaffMenu();
  if (isStaff()) refreshStaff().catch(error => showToast(error.message, 'error'));
  if (isAdmin()) refreshAdmin().catch(error => showToast(error.message, 'error'));
}

async function refreshMenu() {
  const { menu } = await api('/api/menu');
  state.menu = menu;
  renderMenu();
  renderStaffMenu();
}

async function refreshStaff() {
  if (!isStaff()) return;
  const { orders } = await api('/api/staff/orders');
  state.staffOrders = orders;
  renderStaffOrders();
}

async function refreshAdmin() {
  if (!isAdmin()) return;
  const [report, users] = await Promise.all([api('/api/admin/reports'), api('/api/admin/users')]);
  $('#report-orders').textContent = report.totalOrders;
  $('#report-ready').textContent = report.readyOrders;
  $('#report-students').textContent = report.studentCount;
  $('#staff-account-list').innerHTML = users.users.filter(user => user.role === 'staff').map(user =>
    `<li><strong>${escapeHtml(user.name)}</strong><span>${escapeHtml(user.schoolId)}</span></li>`
  ).join('') || '<li>No staff accounts yet.</li>';
}

async function openQueue() {
  if (!isStudent()) {
    $('#auth-modal').showModal();
    showToast('Log in with a student account to view a queue token.', 'error');
    return;
  }
  const modal = $('#queue-modal');
  $('#queue-modal-content').innerHTML = '<p class="loading">Loading your live queue...</p>';
  modal.showModal();
  try {
    const { order } = await api('/api/queue/me');
    if (!order) {
      $('#queue-modal-content').innerHTML = '<div class="modal-queue-card"><h3>No active order</h3><p>Place a food order to receive your digital token and live queue position.</p><a class="button close-queue" href="#menu">Browse menu <span>-&gt;</span></a></div>';
      return;
    }
    const progress = { queued: '28%', preparing: '66%', ready: '100%', collected: '100%' }[order.status] || '20%';
    $('#queue-modal-content').innerHTML = `<div class="modal-queue-card"><h3>#${escapeHtml(order.token)}</h3><p>${escapeHtml(order.items.map(item => item.name).join(' + '))} - Main Canteen</p><div class="queue-detail-grid"><div><span>YOUR PLACE</span><strong>${order.position || '-'}</strong></div><div><span>EST. PICKUP</span><strong>${escapeHtml(order.estimatedWait || 'Ready')}</strong></div></div><div class="modal-progress"><p><strong>${escapeHtml(order.status === 'ready' ? 'Ready for pickup' : order.status === 'preparing' ? 'Preparing now' : 'Order received')}</strong> - ${escapeHtml(order.status === 'ready' ? 'Please collect from the counter.' : 'We will update your queue position automatically.')}</p><div class="progress-track"><span style="width:${progress}"></span></div></div></div>`;
  } catch (error) {
    $('#queue-modal-content').innerHTML = `<p class="error-message">${escapeHtml(error.message)}</p>`;
  }
}

async function placeOrder() {
  if (!isStudent()) {
    $('#auth-modal').showModal();
    return showToast('Only students can place canteen orders.', 'error');
  }
  const items = cartEntries().map(([id, quantity]) => ({ id, quantity }));
  if (!items.length) return showToast('Add at least one item before placing an order.', 'error');
  const button = $('#checkout-button');
  button.disabled = true;
  button.textContent = 'Placing order...';
  try {
    const { order } = await api('/api/orders', { method: 'POST', body: JSON.stringify({ items }) });
    state.cart = {};
    renderCart();
    showToast(`Order #${order.token} has been placed.`);
    await openQueue();
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    button.disabled = false;
    button.innerHTML = 'Place demo order <span>-&gt;</span>';
  }
}

async function updateOrderStatus(orderId, status) {
  try {
    await api(`/api/staff/orders/${encodeURIComponent(orderId)}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    showToast(`Order status changed to ${status}.`);
    await refreshStaff();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function updateMenuAvailability(id, available) {
  try {
    await api(`/api/staff/menu/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify({ available }) });
    await refreshMenu();
    showToast(`Menu availability updated.`);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function addToCart(id) {
  if (!isStudent()) {
    $('#auth-modal').showModal();
    showToast('Please log in as a student to add items.', 'error');
    return;
  }
  state.cart[id] = (state.cart[id] || 0) + 1;
  renderCart();
  showToast(`${state.menu.find(item => item.id === id)?.name || 'Item'} added to your order.`);
}

function changeCart(id, delta) {
  state.cart[id] = Math.max(0, (state.cart[id] || 0) + delta);
  renderCart();
}

function setModalMode(mode) {
  $('#login-form').hidden = mode !== 'login';
  $('#register-form').hidden = mode !== 'register';
  $('#show-login').classList.toggle('active', mode === 'login');
  $('#show-register').classList.toggle('active', mode === 'register');
}

async function init() {
  try {
    const { user } = await api('/api/auth/me');
    state.user = user;
  } catch (error) {
    state.user = null;
  }
  await refreshMenu();
  applyAuthState();
}

document.addEventListener('click', event => {
  const add = event.target.closest('[data-add]');
  if (add) addToCart(add.dataset.add);
  const change = event.target.closest('[data-change]');
  if (change) changeCart(change.dataset.change, Number(change.dataset.delta));
  const status = event.target.closest('[data-order-status]');
  if (status) updateOrderStatus(status.dataset.orderStatus, status.dataset.status);
  const availability = event.target.closest('[data-menu-availability]');
  if (availability) updateMenuAvailability(availability.dataset.menuAvailability, availability.dataset.available === 'true');
  if (event.target.closest('.login-trigger')) $('#auth-modal').showModal();
  if (event.target.closest('.close-queue')) $('#queue-modal').close();
});

$$('.category-tabs button').forEach(button => button.addEventListener('click', () => {
  state.category = button.dataset.category;
  $$('.category-tabs button').forEach(tab => tab.classList.toggle('active', tab === button));
  renderMenu();
}));

$('#menu-search').addEventListener('input', event => { state.search = event.target.value; renderMenu(); });
$('#checkout-button').addEventListener('click', placeOrder);
$$('.queue-trigger').forEach(button => button.addEventListener('click', openQueue));
$('#auth-button').addEventListener('click', () => $('#auth-modal').showModal());
$('#logout-button').addEventListener('click', async () => {
  await api('/api/auth/logout', { method: 'POST' });
  state.user = null;
  state.cart = {};
  applyAuthState();
  showToast('You have been logged out.');
});
$$('.modal-close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
$('#how-button').addEventListener('click', () => $('#how-it-works').scrollIntoView({ behavior: 'smooth' }));
$('.announcement-close').addEventListener('click', event => event.target.parentElement.remove());
$('#ready-next').addEventListener('click', () => {
  const next = state.staffOrders.find(order => order.status === 'preparing') || state.staffOrders.find(order => order.status === 'queued');
  if (!next) return showToast('There are no queued or preparing orders.');
  updateOrderStatus(next.id, next.status === 'queued' ? 'preparing' : 'ready');
});
$('#show-login').addEventListener('click', () => setModalMode('login'));
$('#show-register').addEventListener('click', () => setModalMode('register'));

$('#login-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const { user } = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ schoolId: form.get('schoolId'), password: form.get('password') }) });
    state.user = user;
    event.currentTarget.reset();
    $('#auth-modal').close();
    applyAuthState();
    showToast(`Welcome, ${user.name}. You are signed in as ${roleLabel(user.role)}.`);
  } catch (error) {
    $('#login-error').textContent = error.message;
  }
});

$('#register-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const { user } = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: form.get('name'), schoolId: form.get('schoolId'), password: form.get('password') }) });
    state.user = user;
    event.currentTarget.reset();
    $('#auth-modal').close();
    applyAuthState();
    showToast('Student account created. You can now place an order.');
  } catch (error) {
    $('#register-error').textContent = error.message;
  }
});

$('#staff-account-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    await api('/api/admin/staff', { method: 'POST', body: JSON.stringify({ name: form.get('name'), schoolId: form.get('schoolId'), password: form.get('password') }) });
    event.currentTarget.reset();
    showToast('Staff account created.');
    await refreshAdmin();
  } catch (error) {
    $('#staff-create-error').textContent = error.message;
  }
});

init().catch(error => {
  showToast('Unable to load the canteen. Refresh the page and try again.', 'error');
  console.error(error);
});
