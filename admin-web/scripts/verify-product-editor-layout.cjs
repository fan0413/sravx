// Synthetic browser fixtures only. No real sessions, uploads or business writes.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.SRAVX_BROWSER_MODULE || 'playwright');
const base = process.env.SRAVX_ADMIN_TEST_URL || 'http://127.0.0.1:5181/';
const baseline = process.env.SRAVX_EDITOR_BASELINE === '1';
const screenshotDir = process.env.SRAVX_EDITOR_SCREENSHOT_DIR;
const key = 'catalog/products/local-fixture/cover.png';
const fixture = {
  id: 1, name: '本地测试工具', short_name: '测试工具', desc: '仅用于界面核验', category_id: 11,
  price: '1', stock: 0, is_on_sale: 0, is_recommend: 0, allow_coupon: 0, warranty_months: 12,
  cover_image: key, images: [key], detail_images: [key], sort_order: 8, scissors_card_image: key,
  params: { 目录系列: 'basic', 目录分类: 'straight', 核心材质: '测试', 手柄材质: '测试', 尺寸: '测试', '重量(g)': '1', 质保周期: '测试', 额外信息: '保留' },
  specs: [{ name: '本地标准型号', price: 1, sku: 'LOCAL-ONLY', shipping_type: 'normal', ship_deadline_days: 2, shipping_promise: '测试承诺', shipping_note: '保留说明', shipping_delay_reason: '' }]
};
async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.SRAVX_BROWSER_EXECUTABLE });
  try {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    await context.addInitScript(() => sessionStorage.setItem('sravx.target.admin.session', 'local-fixture-only'));
    const page = await context.newPage(), errors = [], saves = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/api/v1/**', async route => {
      const req = route.request(), path = new URL(req.url()).pathname;
      let data = { id: 1, list: [], total: 0 };
      if (path === '/api/v1/admin/categories') data = { list: [{ id: 1, name: 'Basic', is_show: 1 }, { id: 11, parent_id: 1, name: '直剪', is_show: 1 }, { id: 3, name: '配件', is_show: 1 }] };
      if (path === '/api/v1/admin/products/1' && req.method() === 'GET') data = fixture;
      if (path === '/api/v1/admin/media/temporary-urls') data = { urls: { [key]: 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="240" height="240"%3E%3Crect width="240" height="240" fill="%23f5f0e8"/%3E%3C/svg%3E' } };
      else if (path === '/api/v1/admin/products/1' && req.method() === 'PUT') saves.push(req.postDataJSON());
      else if (req.method() !== 'GET') throw new Error('Blocked fixture write: ' + path);
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    });
    await page.goto(base + '#/product/edit/1');
    await page.getByPlaceholder('请输入商品名称', { exact: true }).waitFor();
    await page.waitForFunction(() => document.querySelector('input[placeholder="请输入商品名称"]')?.value === '本地测试工具');
    if (screenshotDir) await page.screenshot({ path: screenshotDir + '/' + (baseline ? 'before' : 'after') + '-desktop.png' });
    if (baseline) {
      console.log('BASELINE captured: mixed sales/image section; wide model row; no section navigation.');
      return;
    }
    assert.equal(await page.locator('.editor-section').count(), 5);
    assert.equal(await page.locator('.editor-section-nav a').count(), 5);
    const chooseSeries = async label => {
      await page.locator('.el-form-item').filter({ has: page.locator('.el-form-item__label').getByText('产品系列', { exact: true }) }).locator('.el-select').click();
      await page.getByRole('option', { name: label, exact: true }).click();
    };
    await chooseSeries('配件');
    assert.equal(await page.locator('#editor-params').count(), 0);
    assert.equal(await page.locator('.editor-section-nav a').count(), 4);
    assert.equal(await page.locator('.params-wrap').count(), 0);
    assert.equal(await page.getByText('展示卡片', { exact: true }).count(), 0);
    for (const label of ['Pro', 'Master', 'Basic']) {
      await chooseSeries(label);
      assert.equal(await page.locator('#editor-params').count(), 1);
      assert.equal(await page.getByText('展示卡片', { exact: true }).count(), 1);
      assert.equal(await page.locator('#editor-params').getByPlaceholder('请填写参数值').first().inputValue(), '测试');
    }
    // Restore the original classification through a fresh editor load before the existing save regression.
    await page.reload();
    await page.waitForFunction(() => document.querySelector('input[placeholder="请输入商品名称"]')?.value === '本地测试工具');
    assert.equal(await page.locator('#editor-basics').getByPlaceholder('介绍商品用途、适用场景与真实卖点').count(), 1);
    assert.equal(await page.locator('#editor-sales').getByPlaceholder('由规格最低价自动计算').inputValue(), '1.00');
    assert.equal(await page.locator('#editor-images .upload-count').count(), 3);
    const gallery = page.locator('.image-uploader-row .uploader-wrap').nth(1);
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3foAAAAASUVORK5CYII=', 'base64');
    await gallery.locator('input[type="file"]').setInputFiles([
      { name: 'fixture-a.png', mimeType: 'image/png', buffer: png },
      { name: 'fixture-b.png', mimeType: 'image/png', buffer: png }
    ]);
    await gallery.locator('.image-sort-item').nth(2).waitFor();
    const lastImage = await gallery.locator('.el-upload-list__item').nth(2).locator('img').getAttribute('src');
    await gallery.locator('.image-sort-item').last().getByTitle('前移', { exact: true }).click();
    assert.equal(await gallery.locator('.el-upload-list__item').nth(1).locator('img').getAttribute('src'), lastImage);
    // Remove the two local files before saving; synthetic bytes never reach a server.
    for (let index = 0; index < 2; index++) {
      const item = gallery.locator('.el-upload-list__item').last();
      await item.hover();
      await item.locator('.el-upload-list__item-delete').click();
      await page.waitForFunction(expected => document.querySelectorAll('.image-uploader-row .uploader-wrap:nth-child(2) .el-upload-list__item').length === expected, 2 - index);
    }
    assert.equal(await gallery.locator('.el-upload-list__item').count(), 1);
    await page.locator('.editor-section-nav a[href="#editor-specs"]').click();
    assert.equal(new URL(page.url()).hash, '#/product/edit/1');
    await page.locator('.spec-editor-row').scrollIntoViewIfNeeded();
    const details = page.locator('.shipping-details').first();
    await details.locator('summary').click();
    assert.equal(await details.getAttribute('open'), '');
    await details.getByPlaceholder('该规格补充说明，可写定制周期、产地直发或与用户约定的发货条件').fill('保留说明');
    await details.locator('summary').click();
    assert.equal(await details.getAttribute('open'), null);
    const spec = page.locator('.spec-editor-row').first();
    await spec.getByText('特殊延迟', { exact: true }).click();
    assert.equal(await details.getAttribute('open'), '');
    await spec.getByText('普通现货', { exact: true }).click();
    assert.equal(await details.getAttribute('open'), null);
    assert.equal(await details.getByPlaceholder('该规格补充说明，可写定制周期、产地直发或与用户约定的发货条件').inputValue(), '保留说明');
    await page.getByRole('button', { name: '+ 新增规格', exact: true }).click();
    assert.equal(await page.locator('.spec-editor-row').count(), 2);
    await page.locator('.spec-editor-row').last().getByRole('button', { name: '删除', exact: true }).click();
    assert.equal(await page.locator('.spec-editor-row').count(), 1);
    if (screenshotDir) await page.screenshot({ path: screenshotDir + '/after-specs.png' });
    // All editor controls must remain within the available canvas at ordinary laptop sizes.
    for (const width of [1440, 1280, 1024]) {
      await page.setViewportSize({ width, height: 1000 });
      const overflow = await page.locator('.form input:visible, .form textarea:visible, .spec-image-fields, .form-actions').evaluateAll(nodes => nodes.filter(node => {
        const r = node.getBoundingClientRect();
        return r.right > window.innerWidth + 2 || r.left < -2;
      }).map(node => node.className));
      assert.deepEqual(overflow, [], 'editor overflow at ' + width);
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    const material = page.locator('#editor-params').getByPlaceholder('请填写参数值').first();
    await material.fill('');
    await page.getByRole('button', { name: '更新', exact: true }).click();
    await page.getByText('请先填写主要参数：核心材质', { exact: true }).waitFor();
    assert.equal(saves.length, 0);
    await material.fill('测试');
    const firstPrice = page.locator('.spec-editor-row').first().getByPlaceholder('价格', { exact: true });
    await firstPrice.fill('');
    await page.getByRole('button', { name: '更新', exact: true }).click();
    await page.getByText('请填写规格「本地标准型号」的有效价格（大于0，最多两位小数）', { exact: true }).waitFor();
    assert.equal(saves.length, 0);
    await firstPrice.fill('2.50');
    await page.getByRole('button', { name: '+ 新增规格', exact: true }).click();
    const secondSpec = page.locator('.spec-editor-row').last();
    await secondSpec.getByPlaceholder('配置名称，如：夜花黑纹款').fill('第二测试型号');
    await secondSpec.getByPlaceholder('价格', { exact: true }).fill('1.25');
    assert.equal(await page.getByPlaceholder('由规格最低价自动计算').inputValue(), '1.25');
    await page.getByRole('button', { name: '更新', exact: true }).click();
    await page.getByRole('button', { name: '确认更新', exact: true }).click();
    await page.waitForFunction(() => location.hash === '#/product/list');
    assert.equal(saves.length, 1);
    const saved = saves[0];
    assert.equal(saved.categoryId, 11);
    assert.equal(saved.params['目录系列'], 'basic');
    assert.equal(saved.series, 'basic');
    assert.equal(saved.toolGroup, 'straight');
    assert.equal(saved.params['额外信息'], '保留');
    assert.equal(saved.sortOrder, 8);
    assert.equal(saved.price, 1.25);
    assert.equal(saved.specs[0].price, 2.5);
    assert.equal(saved.specs[1].price, 1.25);
    assert.equal(saved.specs[0].shippingNote, '保留说明');
    fixture.category_id = 3;
    fixture.params = { 目录系列: 'accessories', 目录分类: 'accessories', 额外信息: '保留' };
    fixture.warranty_months = null;
    fixture.specs[0].card_image = key;
    await page.goto(base + '#/product/edit/1');
    await page.waitForFunction(() => document.querySelector('input[placeholder="请输入商品名称"]')?.value === '本地测试工具');
    assert.equal(await page.locator('#editor-params').count(), 0);
    assert.equal(await page.getByText('展示卡片', { exact: true }).count(), 0);
    await page.getByRole('button', { name: '更新', exact: true }).click();
    await page.getByRole('button', { name: '确认更新', exact: true }).click();
    await page.waitForFunction(() => location.hash === '#/product/list');
    assert.equal(saves.length, 2);
    assert.equal(saves[1].params['目录系列'], 'accessories');
    assert.equal(saves[1].params['核心材质'], undefined);
    assert.equal(saves[1].warrantyMonths, undefined);
    assert.deepEqual(saves[1].specs[0].cardImage, { existingObjectKey: key });
    await page.goto(base + '#/product/create');
    await page.getByPlaceholder('请输入商品名称', { exact: true }).waitFor();
    assert.equal(await page.getByPlaceholder('请输入商品名称', { exact: true }).inputValue(), '');
    await page.getByRole('button', { name: '保存', exact: true }).click();
    await page.getByText('请先填写商品名称', { exact: true }).waitFor();
    assert.equal(saves.length, 2);
    assert.deepEqual(errors, []);
    console.log('PASS editor layout: five sections, anchors, expandable shipping retained, add/remove model, laptop widths, mock save preserved fields, create validation; no production writes');
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
