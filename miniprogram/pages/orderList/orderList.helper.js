function statusText(status, autoCancel) {
  if (status === 'cancelled' && (autoCancel === 1 || autoCancel === true)) return '超时关闭'
  const statusMap = {
    pending_payment: '待付款',
    paid: '待发货',
    pending_send: '待发货',
    shipped: '待收货',
    received: '已收货',
    completed: '已完成',
    cancelled: '已取消',
    refunding: '退款中',
    refunded: '已退款'
  }
  return statusMap[status] || '未知状态'
}

function statusClass(status) {
  const classMap = {
    pending_payment: 'status-pending',
    paid: 'status-pending',
    pending_send: 'status-pending',
    shipped: 'status-shipped',
    received: 'status-shipped',
    completed: 'status-completed',
    cancelled: 'status-cancelled',
    refunding: 'status-cancelled',
    refunded: 'status-cancelled'
  }
  return classMap[status] || ''
}

function isFinishedStatus(orderType, status, autoCancel) {
  if (orderType === 'goods') {
    return status === 'completed' || status === 'refunded' || (status === 'cancelled' && Number(autoCancel || 0) !== 1)
  }
  return status === 'completed' || status === 'cancelled' || status === 'refunded'
}

function isPendingStatus(orderType, status) {
  if (orderType === 'goods') {
    return ['pending_payment', 'paid', 'shipped', 'received', 'refunding'].includes(status)
  }
  return ['pending_payment', 'paid', 'pending_send', 'shipped', 'refunding'].includes(status)
}

function progressHint(orderType, status) {
  if (status === 'pending_payment') return '待支付，请尽快完成付款'
  if (status === 'paid' || status === 'pending_send') return '待发货，商家正在处理中'
  if (status === 'shipped') return '运输中，请留意物流信息'
  if (status === 'received') return '待完成，确认无误后可完成订单'
  if (status === 'refunding') return '退款处理中，请耐心等待'
  if (status === 'completed') return '订单已完成'
  if (status === 'cancelled') return '订单已取消'
  if (status === 'refunded') return '订单已退款'
  return orderType === 'points' ? '积分订单处理中' : '商品订单处理中'
}

function mapGoodsOrders(rawOrders) {
  return (rawOrders || []).map((order) => {
    const firstItem = Array.isArray(order.items) && order.items.length > 0 ? order.items[0] : {}
    const province = order.province || order.address_province || ''
    const city = order.city || order.address_city || ''
    const district = order.district || order.address_district || ''
    const detail = order.detail || order.address_detail || ''
    const composedAddress = `${province}${city}${district}${detail}`.trim()
    const amount = Number(order.pay_amount || order.total_amount || 0) || 0
    const quantity = Number(order.quantity || firstItem.quantity || 1) || 1
    return {
      ...order,
      orderType: 'goods',
      displayImage: order.cover_image || order.product_image || firstItem.product_image || '/images/logo.png',
      displayName: order.product_name || firstItem.product_name || '未命名商品',
      displayAddress: order.full_address || order.address || order.address_text || composedAddress || '暂无收货地址',
      statusText: statusText(order.status, order.auto_cancel),
      statusClass: statusClass(order.status),
      amount,
      quantity,
      progressHint: progressHint('goods', order.status),
      completedTime: order.completed_at || order.updated_at || order.created_at || ''
    }
  })
}

function mapPointsOrders(rawOrders) {
  return (rawOrders || []).map((order) => {
    const points = Number(order.total_points || 0) || 0
    const amount = Number(order.payable_cash || order.total_cash || 0) || 0
    const quantity = Number(order.quantity || 1) || 1
    return {
      ...order,
      orderType: 'points',
      displayImage: order.product_image_snapshot || '/images/logo.png',
      displayName: order.product_name_snapshot || '积分商品',
      statusText: statusText(order.status, order.auto_cancel),
      statusClass: statusClass(order.status),
      amount,
      quantity,
      points,
      progressHint: progressHint('points', order.status),
      completedTime: order.completed_at || order.updated_at || order.created_at || ''
    }
  })
}

function filterOrdersByTab(tab, goodsOrders, pointsOrders) {
  const goods = goodsOrders || []
  const points = pointsOrders || []
  if (tab === 'completed') {
    return {
      goodsOrders: goods.filter((x) => isFinishedStatus('goods', x.status, x.auto_cancel)),
      pointsOrders: points.filter((x) => isFinishedStatus('points', x.status, x.auto_cancel))
    }
  }
  if (tab === 'pending') {
    return {
      goodsOrders: goods.filter((x) => isPendingStatus('goods', x.status)),
      pointsOrders: points.filter((x) => isPendingStatus('points', x.status))
    }
  }
  return { goodsOrders: goods, pointsOrders: points }
}

function getOrderDetailRoute(orderType, orderId) {
  if (orderType === 'points') return `/pages/pointsOrderDetail/pointsOrderDetail?id=${orderId}`
  return `/pages/orderDetail/orderDetail?id=${orderId}`
}

module.exports = {
  statusText,
  statusClass,
  isFinishedStatus,
  isPendingStatus,
  mapGoodsOrders,
  mapPointsOrders,
  filterOrdersByTab,
  getOrderDetailRoute
};
