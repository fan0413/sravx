#!/usr/bin/env node
/**
 * 积分业务闭环集成脚本（浏览商品 -> 下单 -> 可选支付 -> 查详情 -> 可选取消/退款）
 *
 * 用法：
 *   CLOUDBASE_ENV_ID=xxx TEST_OPENID=xxx POINTS_PRODUCT_ID=1 ADDRESS_ID=1 node scripts/tests/points_integration_flow.js
 *
 * 可选：
 *   RUN_PAYMENT=1
 *   PAYMENT_API_BASE_URL=https://your-cloudrun-domain
 *   DO_CANCEL=1
 *   DO_REFUND=1
 *   APP_ID=xxx
 *   APP_SECRET=xxx
 */

const cloudbase = require('@cloudbase/node-sdk')

const ENV_ID = process.env.CLOUDBASE_ENV_ID
const APP_ID = process.env.APP_ID
const APP_SECRET = process.env.APP_SECRET
const TEST_OPENID = process.env.TEST_OPENID
const POINTS_PRODUCT_ID = Number(process.env.POINTS_PRODUCT_ID || 0)
const ADDRESS_ID = Number(process.env.ADDRESS_ID || 0)
const RUN_PAYMENT = String(process.env.RUN_PAYMENT || '0') === '1'
const DO_CANCEL = String(process.env.DO_CANCEL || '0') === '1'
const DO_REFUND = String(process.env.DO_REFUND || '0') === '1'
const PAYMENT_API_BASE_URL = String(process.env.PAYMENT_API_BASE_URL || '').replace(/\/+$/, '')

function assertRequired() {
  const missing = []
  if (!ENV_ID) missing.push('CLOUDBASE_ENV_ID')
  if (!TEST_OPENID) missing.push('TEST_OPENID')
  if (!POINTS_PRODUCT_ID) missing.push('POINTS_PRODUCT_ID')
  if (!ADDRESS_ID) missing.push('ADDRESS_ID')
  if (missing.length > 0) throw new Error(`缺少环境变量: ${missing.join(', ')}`)
  if (RUN_PAYMENT && !PAYMENT_API_BASE_URL) throw new Error('RUN_PAYMENT=1 时必须提供 PAYMENT_API_BASE_URL')
}

function createApp() {
  const config = { env: ENV_ID }
  if (APP_ID && APP_SECRET) {
    config.appSecret = { appAccessKeyId: APP_ID, appAccessKey: APP_SECRET }
  }
  return cloudbase.init(config)
}

async function callFunction(app, name, data) {
  const res = await app.callFunction({ name, data })
  return res && res.result ? res.result : res
}

async function callPaymentApi(path, body) {
  const resp = await fetch(`${PAYMENT_API_BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body || {})
  })
  const data = await resp.json().catch(() => ({}))
  if (!resp.ok || data.success === false || data.code === 'FAIL') {
    throw new Error(data.message || data.error || `HTTP_${resp.status}`)
  }
  return data.data || data
}

async function main() {
  assertRequired()
  const app = createApp()
  console.log('[flow] 1) 查询积分商品列表')
  const listRes = await callFunction(app, 'product', { action: 'pointsList', _openid: TEST_OPENID })
  if (!listRes || listRes.success !== true) throw new Error(`pointsList 失败: ${(listRes && listRes.error) || 'UNKNOWN'}`)

  console.log('[flow] 2) 查询积分商品详情')
  const detailRes = await callFunction(app, 'product', { action: 'pointsDetail', id: POINTS_PRODUCT_ID, _openid: TEST_OPENID })
  if (!detailRes || detailRes.success !== true) throw new Error(`pointsDetail 失败: ${(detailRes && detailRes.error) || 'UNKNOWN'}`)

  console.log('[flow] 3) 创建积分订单')
  const idempotencyKey = `it-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  const createRes = await callFunction(app, 'order', {
    action: 'createPointsOrder',
    pointsProductId: POINTS_PRODUCT_ID,
    quantity: 1,
    addressId: ADDRESS_ID,
    selectedSpecName: '',
    remark: 'integration-test',
    idempotencyKey,
    _openid: TEST_OPENID
  })
  if (!createRes || createRes.success !== true) {
    throw new Error(`createPointsOrder 失败: ${(createRes && createRes.error) || 'UNKNOWN'}`)
  }
  const orderId = createRes.data && createRes.data.orderId
  const orderNo = createRes.data && createRes.data.orderNo
  console.log(`[flow] 已创建积分订单: id=${orderId}, no=${orderNo}`)

  if (RUN_PAYMENT) {
    console.log('[flow] 4) 创建支付单（orderType=points）')
    await callPaymentApi('/api/payment/createOrder', {
      orderId,
      openid: TEST_OPENID,
      orderType: 'points',
      description: 'integration flow points order'
    })
  } else {
    console.log('[flow] 4) 跳过支付链路（RUN_PAYMENT!=1）')
  }

  console.log('[flow] 5) 查询积分订单详情')
  const orderDetail = await callFunction(app, 'order', {
    action: 'getPointsOrderDetail',
    orderId,
    _openid: TEST_OPENID
  })
  if (!orderDetail || orderDetail.success !== true) {
    throw new Error(`getPointsOrderDetail 失败: ${(orderDetail && orderDetail.error) || 'UNKNOWN'}`)
  }

  if (DO_CANCEL) {
    console.log('[flow] 6) 取消积分订单')
    const cancelRes = await callFunction(app, 'order', {
      action: 'cancelPointsOrder',
      orderId,
      cancelReason: 'integration cancel',
      _openid: TEST_OPENID
    })
    if (!cancelRes || cancelRes.success !== true) {
      throw new Error(`cancelPointsOrder 失败: ${(cancelRes && cancelRes.error) || 'UNKNOWN'}`)
    }
  }

  if (DO_REFUND) {
    console.log('[flow] 7) 触发积分订单退款')
    const refundRes = await callFunction(app, 'order', {
      action: 'refundPointsOrder',
      orderId,
      refundReason: 'integration refund',
      refundTransactionId: `itest-${Date.now()}`,
      _openid: TEST_OPENID
    })
    if (!refundRes || refundRes.success !== true) {
      throw new Error(`refundPointsOrder 失败: ${(refundRes && refundRes.error) || 'UNKNOWN'}`)
    }
  }

  console.log('[flow] done: 积分业务闭环执行完成')
}

main().catch((err) => {
  console.error('[points_integration_flow] failed:', err.message || err)
  process.exit(1)
})
