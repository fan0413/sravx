#!/usr/bin/env node
const assert = require('assert')
const {
  mapGoodsOrders,
  mapPointsOrders,
  filterOrdersByTab
} = require('../../miniprogram/pages/orderList/orderList.helper')

function run() {
  const goodsRaw = [
    { id: 1, status: 'completed', order_no: 'G001', product_name: '商品A', pay_amount: '99.00', created_at: '2026-04-25 10:00:00' },
    { id: 2, status: 'pending_payment', order_no: 'G002', product_name: '商品B', pay_amount: '59.00', created_at: '2026-04-25 11:00:00' }
  ]
  const pointsRaw = [
    { id: 11, status: 'completed', order_no: 'P001', product_name_snapshot: '积分商品A', total_points: 800, payable_cash: '0.00', created_at: '2026-04-25 10:30:00' },
    { id: 12, status: 'pending_send', order_no: 'P002', product_name_snapshot: '积分商品B', total_points: 500, payable_cash: '8.80', created_at: '2026-04-25 11:30:00' }
  ]

  const goods = mapGoodsOrders(goodsRaw)
  const points = mapPointsOrders(pointsRaw)

  const completed = filterOrdersByTab('completed', goods, points)
  assert.strictEqual(completed.goodsOrders.length, 1, '已完成商品订单数量应为 1')
  assert.strictEqual(completed.pointsOrders.length, 1, '已完成积分订单数量应为 1')
  assert.strictEqual(completed.goodsOrders[0].order_no, 'G001')
  assert.strictEqual(completed.pointsOrders[0].order_no, 'P001')

  const pending = filterOrdersByTab('pending', goods, points)
  assert.strictEqual(pending.goodsOrders.length, 1, '未完成商品订单数量应为 1')
  assert.strictEqual(pending.pointsOrders.length, 1, '未完成积分订单数量应为 1')
  assert.strictEqual(pending.goodsOrders[0].order_no, 'G002')
  assert.strictEqual(pending.pointsOrders[0].order_no, 'P002')

  console.log('[PASS] order_list_filter.unit')
}

run()
