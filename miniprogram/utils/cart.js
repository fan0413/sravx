const STORAGE_KEY = 'sravx_cart_v1'

function normalizeItem(item) {
  const quantity = Math.max(1, Number(item.quantity) || 1)
  const price = Number(item.price) || 0
  return {
    id: Number(item.id),
    name: String(item.name || '未命名商品'),
    price,
    cover_image: item.cover_image || '/images/logo.png',
    selectedModel: String(item.selectedModel || ''),
    selectedColor: String(item.selectedColor || ''),
    protectSelected: item.protectSelected === true,
    spec: String(item.spec || ''),
    allow_coupon: item.allow_coupon,
    quantity
  }
}

function getCart() {
  try {
    const list = wx.getStorageSync(STORAGE_KEY)
    return Array.isArray(list) ? list.map(normalizeItem).filter(item => item.id) : []
  } catch (error) {
    return []
  }
}

function saveCart(items) {
  wx.setStorageSync(STORAGE_KEY, (items || []).map(normalizeItem))
}

function itemKey(item) {
  return `${item.id}:${item.selectedModel || 'default'}:${item.selectedColor || 'default'}:${item.protectSelected ? 'protect' : 'standard'}`
}

function addItem(item) {
  const next = normalizeItem(item)
  const items = getCart()
  const index = items.findIndex(existing => itemKey(existing) === itemKey(next))
  if (index >= 0) items[index].quantity += next.quantity
  else items.push(next)
  saveCart(items)
  return items
}

function updateQuantity(index, quantity) {
  const items = getCart()
  if (index < 0 || index >= items.length) return items
  const nextQuantity = Math.max(1, Number(quantity) || 1)
  items[index].quantity = nextQuantity
  saveCart(items)
  return items
}

function removeItem(index) {
  const items = getCart()
  if (index >= 0 && index < items.length) items.splice(index, 1)
  saveCart(items)
  return items
}

module.exports = { getCart, addItem, updateQuantity, removeItem }
