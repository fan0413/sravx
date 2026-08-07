#!/usr/bin/env node
/**
 * 商品规格与图片链路回归测试
 * 用法:
 *   CLOUDBASE_ENV_ID=xxx node scripts/tests/product_spec_media_e2e.js
 */
const cloudbase = require('@cloudbase/node-sdk')

const ENV_ID = process.env.CLOUDBASE_ENV_ID || 'cloud1-8gk3bptqefbf01d6'
const PRODUCT_IDS = String(process.env.TEST_PRODUCT_IDS || '48,49')
  .split(',')
  .map((x) => Number(String(x).trim()))
  .filter((x) => x && !Number.isNaN(x))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function isUrlLike(x) {
  const s = String(x || '').trim()
  return /^https?:\/\//i.test(s) || /^cloud:\/\//i.test(s)
}

async function callFunction(app, name, data) {
  const res = await app.callFunction({ name, data })
  return res && res.result ? res.result : res
}

async function run() {
  const app = cloudbase.init({ env: ENV_ID })
  for (const id of PRODUCT_IDS) {
    const detail = await callFunction(app, 'product', { action: 'detail', id })
    assert(detail && detail.success === true, `product.detail(${id}) 调用失败`)
    const data = detail.data || {}

    assert(Array.isArray(data.images) && data.images.length > 0, `商品${id} 轮播图为空`)
    assert(isUrlLike(data.cover_image), `商品${id} 主图地址非法`)
    data.images.forEach((img, idx) => {
      assert(isUrlLike(img), `商品${id} 轮播图第${idx + 1}项地址非法`)
    })

    assert(Array.isArray(data.specs) && data.specs.length > 0, `商品${id} 规格数组为空`)
    data.specs.forEach((spec, sidx) => {
      const options = Array.isArray(spec.options) ? spec.options : []
      assert(options.length > 0, `商品${id} 第${sidx + 1}条规格缺少 options`)
      if (spec.option_images && typeof spec.option_images === 'object') {
        options.forEach((opt) => {
          const mapped = spec.option_images[opt] || spec.option_images[spec.name]
          assert(!mapped || isUrlLike(mapped), `商品${id} 规格"${opt}"图片地址非法`)
        })
      }
    })
  }
  console.log('[PASS] product_spec_media_e2e')
}

run().catch((err) => {
  console.error('[FAIL] product_spec_media_e2e:', err.message || err)
  process.exit(1)
})

