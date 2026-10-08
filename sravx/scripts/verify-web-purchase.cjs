// Isolated browser fixtures: all catalog requests are intercepted, no real orders.
const assert = require('node:assert/strict')
const { chromium } = require(process.env.SRAVX_BROWSER_MODULE || 'playwright')
const base = process.env.SRAVX_WEB_TEST_URL || 'http://localhost:5173/'
const output = process.env.SRAVX_WEB_TEST_OUTPUT
const legacy = { id: 99001, name: '测试用 SRAVX Basic 直剪', price: 500,
  cover_image: '/static/official/hero-curved-scissor.png', images: ['/static/official/hero-curved-scissor.png', '/static/official/thinning-scissor.png'],
  specs: [{ name: '7 英寸', price: 500, image: '/static/official/hero-curved-scissor.png' }, { name: '7.5 英寸', price: 620, image: '/static/official/thinning-scissor.png' }], colors: ['银色', '黑色'] }
const structured = { ...legacy, id: 99002,
  models: [{ id: 1, name: '7 英寸' }, { id: 2, name: '7.5 英寸' }], colors: [{ id: 1, name: '银色', swatch: '#bdbdbd' }, { id: 2, name: '黑色', swatch: '#222222' }],
  skus: [{ id: 101, model_id: 1, color_id: 2, available: 2, price_fen: 62000 }, { id: 102, model_id: 2, color_id: 1, available: 0, price_fen: 50000 }],
  protectOffers: [{ id: 4, displayOnly: true }] }
const fixtures = { 99001: legacy, 99002: structured, 99003: { id: 99003, name: '测试用未公布价格商品' }, 99004: { ...legacy, id: 99004, stock: 0 } }

async function run() {
  const browser = await chromium.launch({ headless: true, ...(process.env.SRAVX_BROWSER_EXECUTABLE ? { executablePath: process.env.SRAVX_BROWSER_EXECUTABLE } : { channel: 'msedge' }) })
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    // The legacy shared App checks wx.cloud on launch. HBuilder supplies wx;
    // the standalone H5 harness supplies the same empty compatibility object.
    await context.addInitScript(() => { window.wx = {} })
    const page = await context.newPage()
    page.setDefaultTimeout(10000)
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route(/(?:https:\/\/api\.sravxpet\.com\/|\/sravx-catalog\/api\/v1\/catalog\/)/, route => {
      const url = new URL(route.request().url())
      assert.equal(route.request().method(), 'GET', 'No production writes allowed in UI test')
      const id = url.pathname.match(/\/products\/(\d+)$/)?.[1]
      const data = id ? fixtures[id] || null : url.pathname.endsWith('/categories') ? [{ id: 1, name: '直剪' }] : url.pathname.endsWith('/products') ? [legacy] : []
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) })
    })
    const visit = async id => {
      const response = page.waitForResponse(url => url.url().endsWith('/products/' + id))
      await page.goto(base + '?browserTest=' + id + '#/pages/product-detail/index?id=' + id + '&series=basic&tool=straight')
      await response
      if (fixtures[id]) await page.locator(`[data-product-id="${id}"] .buy-summary`).waitFor()
      else await page.locator('.buy-state').filter({ hasText: '商品不存在' }).waitFor()
    }
    await visit(99001)
    const headings = await page.locator('.buy-step-title').evaluateAll(elements => elements.map(element => ({
      text: element.textContent,
      color: getComputedStyle(element).color,
      descriptionColor: getComputedStyle(element.querySelector('.buy-step-description')).color
    })))
    assert.equal(headings.length, 3)
    for (const heading of headings) {
      assert.match(heading.text, /^(型号|外观|数量)：/)
      assert.equal(heading.color, 'rgb(29, 29, 31)')
      assert.equal(heading.descriptionColor, 'rgb(110, 110, 115)')
    }
    await page.getByRole('button', { name: '7.5 英寸', exact: false }).click()
    await page.getByRole('button', { name: '黑色', exact: true }).click()
    await page.getByRole('button', { name: '增加数量' }).click()
    assert.match(await page.locator('.buy-summary').innerText(), /RMB 1240.00/)
    await page.reload(); await page.locator('.buy-summary').waitFor()
    assert.match(await page.locator('.buy-summary').innerText(), /黑色 · 2 件/)
    await page.getByRole('button', { name: '下一张商品图' }).click()
    assert.equal(await page.locator('.buy-dots button').nth(1).getAttribute('aria-pressed'), 'true')
    assert(await page.getByRole('button', { name: '下一张商品图' }).isDisabled())
    await page.getByRole('button', { name: '上一张商品图' }).click()
    assert(await page.evaluate(() => document.fonts.check('18px uniicons')))
    const button = page.getByRole('button', { name: '增加数量' })
    await button.focus(); await page.keyboard.press('Enter')
    assert.match(await page.locator('.buy-summary').innerText(), /3 件/)
    await page.getByRole('button', { name: '减少数量' }).click()
    if (output) await page.screenshot({ path: output + '/web-buy-desktop.png', fullPage: true })
    await page.setViewportSize({ width: 390, height: 844 })
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false)
    if (output) await page.screenshot({ path: output + '/web-buy-mobile.png', fullPage: true })
    await page.locator('.buy-summary').getByRole('button', { name: '加入购物袋' }).click()
    await page.waitForURL('**/pages/cart/index'); await page.locator('.bag-name').waitFor()
    assert.match(await page.locator('.bag-content').innerText(), /黑色/)
    assert.match(await page.locator('.total').innerText(), /1240.00/)
    console.log('PASS legacy model/color, keyboard quantity, refresh, gallery, mobile overflow, cart payload')

    await page.setViewportSize({ width: 1440, height: 1000 }); await visit(99002)
    assert.equal(await page.locator('.buy-color.selected').innerText(), '黑色')
    assert(await page.locator('.buy-colors button').filter({ hasText: '银色' }).isDisabled())
    assert(await page.locator('.buy-options button').filter({ hasText: '7.5 英寸' }).isDisabled())
    if (await page.locator('.buy-summary').getByRole('button', { name: '加入购物袋' }).isDisabled()) {
      assert.match(await page.locator('.buy-configuration').innerText(), /规格购买暂未开放/)
      console.log('PASS structured checkout release gate; enabled branch covered by adapter unit tests only')
    } else {
      await page.getByRole('button', { name: '增加数量' }).click()
      assert(await page.getByRole('button', { name: '增加数量' }).isDisabled())
      await page.getByRole('button', { name: '添加 SRAVX Protect', exact: false }).filter({ hasText: /^添加/ }).click()
      assert.match(await page.locator('.buy-summary').innerText(), /权益说明/)
      await page.locator('.buy-summary').getByRole('button', { name: '加入购物袋' }).click()
      await page.waitForURL('**/pages/cart/index'); await page.locator('.total').waitFor()
      const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('sravx_cart_v1')))
      const rows = Array.isArray(stored) ? stored : stored.data
      const item = rows.find(row => row.id === 99002)
      assert.equal(item.skuId, 101); assert.equal(item.quantity, 2); assert.equal(item.protectOfferId, 4)
      console.log('PASS structured SKU, stock bounds and informational Protect metadata')
    }

    for (const id of [99003, 99004]) { await visit(id); assert(await page.locator('.buy-summary').getByRole('button', { name: '加入购物袋' }).isDisabled()) }
    await visit(99999); assert.match(await page.locator('.buy-state').innerText(), /商品不存在/)
    await page.goto(base + '#/pages/product-detail/index'); await page.locator('.buy-state').waitFor(); assert.match(await page.locator('.buy-state').innerText(), /有效商品/)
    await visit(99001)
    await page.locator('.nav-trigger').filter({ hasText: '产品' }).hover(); await page.locator('.mega-menu').waitFor()
    await page.mouse.move(20,350)
    await page.getByRole('button', { name: '返回产品目录' }).click(); await page.waitForURL('**/pages/shop/index?series=basic&tool=straight')
    await page.locator('.h5-shop-head').waitFor()
    for (const [series, label] of [['pro', 'Pro'], ['master', 'Master'], ['basic', 'Basic']]) {
      await page.locator('.nav-trigger').filter({ hasText: '产品' }).hover()
      await page.locator('.mega-link').filter({ hasText: label + ' 系列' }).click()
      await page.waitForFunction(label => document.querySelector('.h5-shop-head')?.textContent.includes('SRAVX ' + label), label)
      assert.match(page.url(), new RegExp('series=' + series + '$'))
      assert.equal(await page.locator('.h5-series-active').count(), 0, 'Switching series clears stale tool filter')
    }
    await page.goBack()
    await page.waitForFunction(() => document.querySelector('.h5-shop-head')?.textContent.includes('SRAVX Master'))
    await page.goForward()
    await page.waitForFunction(() => document.querySelector('.h5-shop-head')?.textContent.includes('SRAVX Basic'))
    await page.locator('.nav-trigger').filter({ hasText: '产品' }).hover()
    await page.locator('.mega-link').filter({ hasText: '查看全部产品' }).click()
    await page.locator('.h5-filter-row').waitFor()
    assert.equal(new URL(page.url()).hash, '#/pages/shop/index')
    console.log('PASS same-page series navigation, stale filter reset, back/forward, all-products without refresh')
    await page.goto(base + '#/pages/purchase/index?series=basic&tool=straight'); await page.locator('.buy-summary').waitFor()
    assert.match(page.url(), /pages\/product-detail\/index\?id=99001/)
    assert.equal(await page.locator('.purchase-product').count(), 0)
    assert.match(page.url(), /series=basic&tool=straight/)
    assert.deepEqual(errors, [])
    console.log('PASS missing price, no stock, missing product/id, global menu, return context and purchase entry; zero page errors')
    await context.close()
  } finally { await browser.close() }
}
run().catch(error => { console.error(error); process.exitCode = 1 })
