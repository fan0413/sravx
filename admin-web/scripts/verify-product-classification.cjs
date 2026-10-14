// Isolated fixture-only browser test: all API calls intercepted, no production writes.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.SRAVX_BROWSER_MODULE || 'playwright');
const base = process.env.SRAVX_ADMIN_TEST_URL || 'http://127.0.0.1:5181/';
const categories = [{ id: 1, name: 'Basic' }, { id: 2, name: 'Pro' }, { id: 3, name: 'Master' }, { id: 4, name: '配件' }, { id: 11, parent_id: 1, name: '直剪' }, { id: 12, parent_id: 2, name: '直剪' }, { id: 13, parent_id: 1, name: '牙剪' }].map(row => ({ ...row, is_show: 1, sort_order: 0 }));
const key = 'catalog/products/local-fixture/cover.png';
let product = { id: 1, name: '本地测试工具', short_name: '测试工具', category_id: 11, price: '1', stock: 0, desc: '仅本地测试', cover_image: key, images: [key], detail_images: [key], sort_order: 8, scissors_card_image: key, is_on_sale: 0, params: { 目录系列: 'basic', 目录分类: 'straight', 核心材质: '测试', 手柄材质: '测试', 尺寸: '测试', '重量(g)': '1', 质保周期: '测试', 额外信息: '保留' }, specs: [{ name: '本地测试型号', price: 1, sku: 'LOCAL-ONLY', shipping_type: 'normal', ship_deadline_days: 2, shipping_promise: '测试', shipping_note: '测试', shipping_delay_reason: '测试' }] };
async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.SRAVX_BROWSER_EXECUTABLE });
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => sessionStorage.setItem('sravx.target.admin.session', 'local-fixture-only'));
    const page = await context.newPage(), errors = [], saves = [], categorySaves = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/api/v1/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname;
      let data = { id: 1, list: [], total: 0 };
      if (path === '/api/v1/admin/categories') data = { list: categories, total: categories.length };
      if (path === '/api/v1/admin/products/1' && request.method() === 'GET') data = product;
      if (path === '/api/v1/admin/media/temporary-urls') data = { urls: { [key]: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg"/%3E' } };
      if (path === '/api/v1/admin/products/1' && request.method() === 'PUT') {
        const body = request.postDataJSON(); saves.push(body);
        product = { ...product, category_id: body.categoryId, params: body.params };
      } else if (path === '/api/v1/admin/categories' && request.method() === 'POST') {
        categorySaves.push(request.postDataJSON()); data = { id: 99 };
      } else if (!['GET', 'POST'].includes(request.method()) || (request.method() === 'POST' && path !== '/api/v1/admin/media/temporary-urls')) throw new Error('Unexpected fixture write: ' + path);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    });
    const field = label => page.locator('.form .el-form-item').filter({ has: page.locator('.el-form-item__label', { hasText: label }) }).first();
    async function choose(label, text) {
      await field(label).locator('.el-select').click();
      await page.locator('.el-select-dropdown:visible').getByText(text, { exact: true }).click();
    }
    await page.goto(base + '#/product/variants/1');
    await page.getByPlaceholder('请输入商品名称', { exact: true }).waitFor();
    assert.match(page.url(), /#\/product\/edit\/1$/);
    assert.equal(await page.getByText('添加颜色', { exact: true }).count(), 0);
    await field('产品系列').getByText('Basic', { exact: true }).waitFor();
    assert.match(await field('工具分类').innerText(), /直剪/);
    await choose('产品系列', 'Pro');
    assert.doesNotMatch(await field('目录关联').innerText(), /直剪/);
    await choose('工具分类', '直剪');
    assert.match(await field('目录关联').innerText(), /直剪/);
    await page.getByRole('button', { name: '更新', exact: true }).click();
    await page.getByRole('button', { name: '确认更新', exact: true }).click();
    await page.waitForFunction(() => location.hash === '#/product/list');
    assert.equal(saves.length, 1); assert.equal(saves[0].categoryId, 12);
    assert.equal(saves[0].params['目录系列'], 'pro'); assert.equal(saves[0].params['目录分类'], 'straight');
    assert.equal(saves[0].params['额外信息'], '保留'); assert.equal(saves[0].sortOrder, 8);
    assert.deepEqual(saves[0].scissorsCardImage, { existingObjectKey: key });
    await page.goto(base + '#/product/edit/1');
    await field('产品系列').getByText('Pro', { exact: true }).waitFor();
    await choose('产品系列', '配件');
    assert.equal(await field('工具分类').count(), 0);
    await page.goto(base + '#/product/create');
    await field('产品系列').getByText('先选择系列', { exact: true }).waitFor();
    assert.equal(await page.getByPlaceholder('请输入商品名称', { exact: true }).inputValue(), '');
    await page.goto(base + '#/category/list');
    await page.getByRole('button', { name: '新增分类', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.locator('.el-select').click();
    await page.locator('.el-select-dropdown:visible').getByText('Basic', { exact: true }).click();
    await dialog.getByPlaceholder('请输入分类名称').fill('弯剪');
    await dialog.getByRole('button', { name: '保存', exact: true }).click();
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(categorySaves.length, 1); assert.equal(categorySaves[0].parentId, 1); assert.equal(categorySaves[0].level, 2);
    assert.deepEqual(errors, []);
    console.log('PASS editor fixture: series→tool→category, save + reload, retained params/card/sort, accessories, no default series, category parent + level; no production writes');
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
