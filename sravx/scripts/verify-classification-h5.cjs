const assert = require('node:assert/strict');
const { chromium } = require(process.env.SRAVX_BROWSER_MODULE || 'playwright');
async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.SRAVX_BROWSER_EXECUTABLE });
  try {
    const context = await browser.newContext(), page = await context.newPage(), errors = [];
    await context.addInitScript(() => { window.wx = {} });
    page.on('pageerror', error => errors.push(error.message));
    const product = { id: 1, category_id: 11, name: '本地中性名称工具', short_name: '中性名称工具', desc: '本地测试说明', price: '1.00', stock: 0, params: JSON.stringify({ 目录系列: 'basic', 目录分类: 'straight', 核心材质: '本地材质字段', 手柄材质: '本地手柄字段', 尺寸: '本地尺寸字段', '重量(g)': '1', 质保周期: '本地周期字段' }), specs: [{ name: '测试型号', price: 1, sku: 'LOCAL-ONLY' }], images: [], detail_images: [] };
    await context.route(/(?:https:\/\/api\.sravxpet\.com\/api\/v1\/catalog\/|\/sravx-catalog\/api\/v1\/catalog\/)/, route => {
      assert.equal(route.request().method(), 'GET');
      const url = new URL(route.request().url()); let data = [];
      if (url.pathname.endsWith('/categories')) data = [{ id: 1, name: 'Basic' }, { id: 11, name: '直剪', parent_id: 1 }];
      if (url.pathname.endsWith('/products') && url.searchParams.get('categoryId') === '11') data = [product];
      if (url.pathname.endsWith('/products/1')) data = product;
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    });
    await context.route('**/api/v1/orders**', route => route.abort());
    await page.goto((process.env.SRAVX_WEB_TEST_URL || 'http://localhost:5173/') + '#/pages/shop/index?series=basic');
    await page.locator('.h5-lineup-card').first().locator('.h5-lineup-action').click();
    await page.waitForURL('**/#/pages/product-detail/index?id=1**');
    await page.getByText('本地材质字段', { exact: true }).waitFor();
    assert.match(await page.locator('.buy-details').innerText(), /本地手柄字段/);
    assert.match(await page.locator('.buy-details').innerText(), /本地尺寸字段/);
    await page.reload(); await page.getByText('本地材质字段', { exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS H5 fixture: neutral product name resolved by saved Basic/straight metadata, purchase opens correct detail, technical params + reload; catalog GET only');
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
