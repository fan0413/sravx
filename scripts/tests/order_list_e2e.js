#!/usr/bin/env node
const assert = require('assert')
const {
  mapGoodsOrders,
  mapPointsOrders,
  filterOrdersByTab,
  getOrderDetailRoute
} = require('../../miniprogram/pages/orderList/orderList.helper')

/**
 * 端到端用例（数据流模拟）：
 * 1) 模拟用户切换到「已完成」
 * 2) 断言商品/积分卡片区块数据与样式字段
 * 3) 模拟点击卡片跳转详情页
 * 4) 模拟切换到「未完成」并重复断言
 */
function run() {
  const goodsRaw = [
    { id: 101, status: 'completed', order_no: 'GO-101', product_name: '商品已完成', pay_amount: '129.00', created_at: '2026-04-25 09:00:00' },
    { id: 102, status: 'paid', order_no: 'GO-102', product_name: '商品待发货', pay_amount: '59.00', created_at: '2026-04-25 10:00:00' }
  ]
  const pointsRaw = [
    { id: 201, status: 'completed', order_no: 'PO-201', product_name_snapshot: '积分已完成', total_points: 1200, payable_cash: '0.00', created_at: '2026-04-25 09:30:00' },
    { id: 202, status: 'pending_payment', order_no: 'PO-202', product_name_snapshot: '积分待支付', total_points: 800, payable_cash: '9.90', created_at: '2026-04-25 10:30:00' }
  ]

  const goods = mapGoodsOrders(goodsRaw)
  const points = mapPointsOrders(pointsRaw)

  const completed = filterOrdersByTab('completed', goods, points)
  assert.strictEqual(completed.goodsOrders.length, 1)
  assert.strictEqual(completed.pointsOrders.length, 1)
  assert.strictEqual(completed.goodsOrders[0].statusClass, 'status-completed')
  assert.strictEqual(completed.pointsOrders[0].statusClass, 'status-completed')
  assert.ok(completed.goodsOrders[0].displayName.includes('商品'))
  assert.ok(completed.pointsOrders[0].displayName.includes('积分'))
  assert.ok(Number(completed.pointsOrders[0].points) > 0)

  const goodsRoute = getOrderDetailRoute('goods', completed.goodsOrders[0].id)
  const pointsRoute = getOrderDetailRoute('points', completed.pointsOrders[0].id)
  assert.strictEqual(goodsRoute, '/pages/orderDetail/orderDetail?id=101')
  assert.strictEqual(pointsRoute, '/pages/pointsOrderDetail/pointsOrderDetail?id=201')

  const pending = filterOrdersByTab('pending', goods, points)
  assert.strictEqual(pending.goodsOrders.length, 1)
  assert.strictEqual(pending.pointsOrders.length, 1)
  assert.ok(pending.goodsOrders[0].progressHint.includes('待发货') || pending.goodsOrders[0].progressHint.includes('处理中'))
  assert.ok(pending.pointsOrders[0].progressHint.includes('待支付'))

  console.log('[PASS] order_list_e2e (simulated)')
}

run()
