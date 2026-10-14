// Public GETs only. Keep local homepage demos; do not use credentials or place orders.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.SRAVX_BROWSER_MODULE || 'playwright');
const base = process.env.SRAVX_WEB_TEST_URL || 'http://127.0.0.1:5173/';
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.SRAVX_BROWSER_EXECUTABLE });
  try {
    const context = await browser.newContext(), page = await context.newPage();
    const errors = [], reads = [], writes = [];
    page.on('pageerror', e => errors.push(e.message));
    await context.route('**/api/v1/**', async route => {
      const request = route.request();
      if (request.method() !== 'GET') { writes.push(request.method()); return route.abort(); }
      return route.continue();
    });
    page.on('response', r => {
      const path = new URL(r.url()).pathname;
      if (path.includes('/api/v1/catalog/')) reads.push({ path, status: r.status() });
    });
    await page.goto(base);
    await page.getByRole('button', { name: '进入官网', exact:false }).click();
    await page.locator('.stage-product-pro').waitFor();
    assert.match(await page.locator('.stage-product-pro img').getAttribute('src'), /hero-curved-scissor/);
    assert.match(await page.locator('.stage-product-air img').getAttribute('src'), /thinning-scissor/);
    assert.equal((await page.request.get(new URL('/static/navigation/sravx-mark.png', base).href)).status(), 200);
    assert.equal(await page.locator('.stage-product-pro img').evaluate(img => img.complete && img.naturalWidth > 0), true);
    const demoCopy = await page.locator('.stage-copy').allTextContents();
    await page.goto(base + '#/pages/shop/index?series=basic');
    const card = page.locator('.h5-product-card').first();
    await card.waitFor();
    assert.match(await card.innerText(), /¥\d+\.\d{2} 起/);
    await card.click();
    await page.waitForURL(/#\/pages\/product-detail\/index\?id=\d+/);
    await page.locator('.buy-option').first().waitFor();
    assert.match(await page.locator('.buy-option').first().innerText(), /\d+\.\d{2}/);
    await page.waitForFunction(() => [...document.querySelectorAll('.buy-image-stage img')].some(img => img.complete && img.naturalWidth > 0));
    const detailUrl = page.url();
    await page.reload();
    await page.locator('.buy-option').first().waitFor();
    assert.equal(page.url(), detailUrl);
    assert(reads.some(r => /\/products\/\d+$/.test(r.path) && r.status === 200));
    assert(reads.some(r => r.path.endsWith('/categories') && r.status === 200));
    assert(reads.every(r => r.status === 200));
    // Inject one failure to prove local demonstrations don't disguise a backend outage.
    await context.route('**/api/v1/catalog/categories', r => r.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ success:false, error:{message:'合成目录服务暂不可用'} }) }));
    await page.goto(base + '#/pages/shop/index?series=basic');
    await page.getByText('合成目录服务暂不可用', { exact:true }).first().waitFor();
    assert.equal(await page.locator('.h5-product-card').count(), 0);
    await context.unroute('**/api/v1/catalog/categories');
    await page.getByText('重新加载', {exact:true}).click();
    await page.locator('.h5-product-card').first().waitFor();
    await page.goto(base + '#/pages/index/index');
    await page.locator('.stage-product-pro').waitFor();
    assert.deepEqual(await page.locator('.stage-copy').allTextContents(), demoCopy);
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    console.log('PASS real server catalog/category/detail/price/reload, same-origin GETs, explicit outage/retry, homepage demos retained; no business writes');
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
