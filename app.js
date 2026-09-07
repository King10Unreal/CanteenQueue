const menuItems = [
  { id: 'thali', name: 'Veg Thali', detail: 'Rice, dal, seasonal veg & chapati', price: 60, category: 'meals', emoji: '🍛', color: 'meals' },
  { id: 'dosa', name: 'Masala Dosa', detail: 'Crispy dosa, potato masala & chutney', price: 40, category: 'meals', emoji: '🥞', color: 'meals' },
  { id: 'sandwich', name: 'Grilled Sandwich', detail: 'Cheese, veggies & house spread', price: 35, category: 'snacks', emoji: '🥪', color: 'snacks' },
  { id: 'samosa', name: 'Crispy Samosa', detail: 'Fresh fried with mint chutney', price: 15, category: 'snacks', emoji: '🥟', color: 'snacks' },
  { id: 'coffee', name: 'Cold Coffee', detail: 'Chilled, creamy & made to order', price: 30, category: 'drinks', emoji: '🥤', color: 'drinks' },
  { id: 'lime', name: 'Fresh Lime Soda', detail: 'Sweet, salty or mixed - your call', price: 25, category: 'drinks', emoji: '🍋', color: 'drinks' },
  { id: 'gulab', name: 'Gulab Jamun', detail: 'Two warm pieces in rose syrup', price: 25, category: 'sweets', emoji: '🍮', color: 'sweets' },
  { id: 'pasta', name: 'Creamy Pasta', detail: 'Sold out for now - back at 2 pm', price: 55, category: 'meals', emoji: '🍝', color: 'sweets', sold: true }
];

const cart = {};
let selectedCategory = 'all';
let searchText = '';
let order = null;
let staffOrders = [
  { id: 'A214', name: 'Veg Thali · Cold Coffee', status: 'preparing', label: 'PREPARING' },
  { id: 'A215', name: 'Masala Dosa · Lime Soda', status: 'ready', label: 'READY' },
  { id: 'A216', name: 'Grilled Sandwich', status: 'queued', label: 'QUEUED' },
  { id: 'A217', name: 'Veg Thali', status: 'queued', label: 'QUEUED' }
];

const menuGrid = document.querySelector('#menu-grid');
const cartItems = document.querySelector('#cart-items');
const cartEmpty = document.querySelector('#cart-empty');
const cartContent = document.querySelector('#cart-content');
const totalElement = document.querySelector('#cart-total');
const countElement = document.querySelector('#cart-items-count');
const queueCount = document.querySelector('.queue-count');
const toast = document.querySelector('#toast');

function formatPrice(value) { return `₹${value}`; }
function getItemsInCart() { return Object.entries(cart).filter(([, quantity]) => quantity > 0); }
function cartTotal() { return getItemsInCart().reduce((sum, [id, quantity]) => sum + menuItems.find(item => item.id === id).price * quantity, 0); }
function cartCount() { return getItemsInCart().reduce((sum, [, quantity]) => sum + quantity, 0); }

function renderMenu() {
  const items = menuItems.filter(item =>
    (selectedCategory === 'all' || item.category === selectedCategory) &&
    `${item.name} ${item.detail}`.toLowerCase().includes(searchText.toLowerCase())
  );
  menuGrid.innerHTML = items.map(item => `
    <article class="menu-card">
      <div class="food-art ${item.color} ${item.sold ? 'sold' : ''}">${item.emoji}</div>
      <div class="menu-card-info">
        <h3>${item.name}</h3>
        <p>${item.detail}</p>
        <div class="menu-card-bottom">
          <span class="menu-card-price">${formatPrice(item.price)}</span>
          ${item.sold ? '<span class="sold-out">SOLD OUT</span>' : `<button class="add-button" data-add="${item.id}" aria-label="Add ${item.name}">+</button>`}
        </div>
      </div>
    </article>`).join('') || '<p class="no-menu">Nothing matches that search. Try another dish.</p>';
}

function renderCart() {
  const entries = getItemsInCart();
  const count = cartCount();
  countElement.textContent = count;
  queueCount.textContent = order ? 1 : 0;
  cartEmpty.hidden = entries.length > 0;
  cartContent.hidden = entries.length === 0;
  if (!entries.length) return;
  cartItems.innerHTML = entries.map(([id, quantity]) => {
    const item = menuItems.find(menuItem => menuItem.id === id);
    return `<div class="cart-item"><p>${item.name}</p><strong>${formatPrice(item.price * quantity)}</strong><small><span class="quantity"><button data-change="${id}" data-delta="-1" aria-label="Remove one ${item.name}">−</button>${quantity}<button data-change="${id}" data-delta="1" aria-label="Add one ${item.name}">+</button></span></small></div>`;
  }).join('');
  totalElement.textContent = formatPrice(cartTotal());
}

function addItem(id) {
  cart[id] = (cart[id] || 0) + 1;
  renderCart();
  const item = menuItems.find(menuItem => menuItem.id === id);
  showToast(`${item.name} added to your order`);
}

function updateItem(id, delta) {
  cart[id] = Math.max(0, (cart[id] || 0) + delta);
  renderCart();
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timeout);
  showToast.timeout = setTimeout(() => toast.classList.remove('show'), 2600);
}

function renderStaffOrders() {
  document.querySelector('#staff-orders-list').innerHTML = staffOrders.map(item => `
    <div class="staff-order"><strong>#${item.id}</strong><p>${item.name}<small>Counter 2 · ${item.status === 'preparing' ? 'Started 4 min ago' : item.status === 'ready' ? 'Waiting for pickup' : 'Just received'}</small></p><span class="order-status ${item.status}">${item.label}</span></div>`).join('');
}

function getQueueMarkup() {
  if (!order) {
    return `<div class="modal-queue-card"><h3>No active order</h3><p>Place an order and your live token will appear here.</p><a class="button" href="#menu" onclick="document.querySelector('#queue-modal').close()">Browse menu <span>→</span></a></div>`;
  }
  return `<div class="modal-queue-card"><h3>#${order.token}</h3><p>${order.items} · Main Canteen</p><div class="queue-detail-grid"><div><span>YOUR PLACE</span><strong>03<sup>rd</sup></strong></div><div><span>EST. PICKUP</span><strong>12:42</strong></div></div><div class="modal-progress"><p><strong>Preparing now</strong> · Your meal is being made.</p><div class="progress-track"><span></span></div></div></div>`;
}

function openQueue() {
  const modal = document.querySelector('#queue-modal');
  document.querySelector('#queue-modal-content').innerHTML = getQueueMarkup();
  modal.showModal();
}

document.addEventListener('click', event => {
  const add = event.target.closest('[data-add]');
  if (add) addItem(add.dataset.add);
  const change = event.target.closest('[data-change]');
  if (change) updateItem(change.dataset.change, Number(change.dataset.delta));
});

document.querySelectorAll('.category-tabs button').forEach(button => {
  button.addEventListener('click', () => {
    selectedCategory = button.dataset.category;
    document.querySelectorAll('.category-tabs button').forEach(tab => tab.classList.toggle('active', tab === button));
    renderMenu();
  });
});

document.querySelector('#menu-search').addEventListener('input', event => {
  searchText = event.target.value;
  renderMenu();
});

document.querySelector('#checkout-button').addEventListener('click', () => {
  if (!cartCount()) return;
  const nextToken = `A${214 + Math.floor(Math.random() * 30)}`;
  order = { token: nextToken, items: getItemsInCart().map(([id, quantity]) => `${quantity}× ${menuItems.find(item => item.id === id).name}`).join(' · ') };
  Object.keys(cart).forEach(key => delete cart[key]);
  renderCart();
  openQueue();
  showToast(`Order #${nextToken} is in the kitchen!`);
});

document.querySelectorAll('.queue-trigger').forEach(button => button.addEventListener('click', openQueue));
document.querySelectorAll('.login-trigger').forEach(button => button.addEventListener('click', () => document.querySelector('#login-modal').showModal()));
document.querySelector('.login-submit').addEventListener('click', () => { document.querySelector('#login-modal').close(); showToast('Welcome back! You’re ready to order.'); });
document.querySelectorAll('.modal-close').forEach(button => button.addEventListener('click', () => button.closest('dialog').close()));
document.querySelector('#how-button').addEventListener('click', () => document.querySelector('#how-it-works').scrollIntoView({ behavior: 'smooth' }));
document.querySelector('.announcement-close').addEventListener('click', event => event.target.parentElement.remove());
document.querySelector('#ready-next').addEventListener('click', () => {
  const next = staffOrders.find(item => item.status === 'preparing') || staffOrders.find(item => item.status === 'queued');
  if (!next) return showToast('Every visible order is ready for collection.');
  next.status = 'ready'; next.label = 'READY';
  const queued = staffOrders.find(item => item.status === 'queued');
  if (queued) { queued.status = 'preparing'; queued.label = 'PREPARING'; }
  renderStaffOrders();
  showToast(`#${next.id} marked ready for pickup`);
});

renderMenu();
renderCart();
renderStaffOrders();
