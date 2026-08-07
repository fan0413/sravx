#!/usr/bin/env node
/**
 * 积分下单并发压测脚本（默认 100 并发）
 *
 * 用法：
 *   CLOUDBASE_ENV_ID=xxx TEST_OPENID=xxx POINTS_PRODUCT_ID=1 ADDRESS_ID=1 node scripts/tests/points_loadtest.js
 *
 * 可选环境变量：
 *   CONCURRENCY=100
 *   TOTAL_REQUESTS=100
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
const CONCURRENCY = Number(process.env.CONCURRENCY || 100)
const TOTAL_REQUESTS = Number(process.env.TOTAL_REQUESTS || 100)

function assertRequired() {
  const missing = []
  if (!ENV_ID) missing.push('CLOUDBASE_ENV_ID')
  if (!TEST_OPENID) missing.push('TEST_OPENID')
  if (!POINTS_PRODUCT_ID) missing.push('POINTS_PRODUCT_ID')
  if (!ADDRESS_ID) missing.push('ADDRESS_ID')
  if (missing.length > 0) {
    throw new Error(`缺少环境变量: ${missing.join(', ')}`)
  }
}

function createApp() {
  const config = { env: ENV_ID }
  if (APP_ID && APP_SECRET) {
    config.appSecret = { appAccessKeyId: APP_ID, appAccessKey: APP_SECRET }
  }
  return cloudbase.init(config)
}

async function callOrderFunction(app, data) {
  const result = await app.callFunction({
    name: 'order',
    data
  })
  return result && result.result ? result.result : result
}

async function runOne(app, idx) {
  const idempotencyKey = `load-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 8)}`
  const payload = {
    action: 'createPointsOrder',
    pointsProductId: POINTS_PRODUCT_ID,
    quantity: 1,
    addressId: ADDRESS_ID,
    selectedSpecName: '',
    remark: 'loadtest',
    idempotencyKey,
    _openid: TEST_OPENID
  }

  const start = Date.now()
  try {
    const res = await callOrderFunction(app, payload)
    const duration = Date.now() - start
    if (!res || res.success !== true) {
      return { ok: false, duration, error: (res && res.error) || 'UNKNOWN_ERROR' }
    }
    return {
      ok: true,
      duration,
      orderId: res.data && res.data.orderId,
      orderNo: res.data && res.data.orderNo
    }
  } catch (err) {
    return { ok: false, duration: Date.now() - start, error: err.message || 'EXCEPTION' }
  }
}

async function main() {
  assertRequired()
  const app = createApp()
  const begin = Date.now()

  let cursor = 0
  const all = new Array(TOTAL_REQUESTS).fill(null)
  const results = []

  async function worker(workerId) {
    while (cursor < TOTAL_REQUESTS) {
      const idx = cursor++
      all[idx] = await runOne(app, idx)
      if ((idx + 1) % 10 === 0) {
        console.log(`[worker-${workerId}] progress: ${idx + 1}/${TOTAL_REQUESTS}`)
      }
    }
  }

  const workers = []
  const workerCount = Math.max(1, Math.min(CONCURRENCY, TOTAL_REQUESTS))
  for (let i = 0; i < workerCount; i++) workers.push(worker(i + 1))
  await Promise.all(workers)
  results.push(...all)

  const cost = Date.now() - begin
  const successItems = results.filter((x) => x && x.ok)
  const failedItems = results.filter((x) => !x || !x.ok)
  const avg = successItems.length > 0
    ? Math.round(successItems.reduce((s, x) => s + (x.duration || 0), 0) / successItems.length)
    : 0
  const p95 = (() => {
    if (successItems.length === 0) return 0
    const sorted = successItems.map((x) => x.duration || 0).sort((a, b) => a - b)
    const pos = Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)
    return sorted[pos]
  })()

  const errorMap = {}
  failedItems.forEach((x) => {
    const key = (x && x.error) || 'UNKNOWN_ERROR'
    errorMap[key] = (errorMap[key] || 0) + 1
  })

  console.log('================ LOAD TEST SUMMARY ================')
  console.log(`Total Requests : ${TOTAL_REQUESTS}`)
  console.log(`Concurrency    : ${workerCount}`)
  console.log(`Success        : ${successItems.length}`)
  console.log(`Failed         : ${failedItems.length}`)
  console.log(`Total Cost(ms) : ${cost}`)
  console.log(`Avg(ms)        : ${avg}`)
  console.log(`P95(ms)        : ${p95}`)
  console.log('Errors         :', JSON.stringify(errorMap, null, 2))
  console.log('===================================================')

  if (failedItems.length > 0) process.exitCode = 2
}

main().catch((err) => {
  console.error('[points_loadtest] failed:', err.message || err)
  process.exit(1)
})
