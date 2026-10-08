// Local synthetic session/data only. Never submit catalog or transaction writes.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.SRAVX_BROWSER_MODULE || 'playwright');
const base = process.env.SRAVX_ADMIN_TEST_URL || 'http://127.0.0.1:5181/';
async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.SRAVX_BROWSER_EXECUTABLE });
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => sessionStorage.setItem('sravx.target.admin.session', 'local-fixture-only'));
    const page = await context.newPage();
    const errors = [], writes = [];
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/api/v1/**', route => {
      if (route.request().method() !== 'GET') { writes.push(route.request().method()); return route.abort(); }
      return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: 1, list: [], total: 0 } }) });
    });
    await page.goto(base + '#/channel/web');
    await page.getByRole('heading', { name: '网页功能', exact: true }).waitFor();
    await page.locator('.topbar .el-radio-button').filter({ hasText: '小程序功能' }).click();
    await page.getByRole('heading', { name: '小程序功能', exact: true }).waitFor();
    assert.equal(await page.getByRole('menuitem', { name: '商品列表', exact: true }).count(), 1);
    await page.goBack(); await page.getByRole('heading', { name: '网页功能', exact: true }).waitFor();
    await page.goForward(); await page.getByRole('heading', { name: '小程序功能', exact: true }).waitFor();
    await page.reload(); await page.getByRole('heading', { name: '小程序功能', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('sravx.admin.workspace')), 'miniprogram');
    await page.getByRole('menuitem', { name: '新建商品', exact: true }).click();
    await page.getByPlaceholder('请输入商品名称', { exact: true }).fill('仅本地未保存表单');
    await page.locator('.topbar .el-radio-button').filter({ hasText: '网页功能' }).click();
    assert.match(page.url(), /#\/product\/create$/);
    assert.equal(await page.getByPlaceholder('请输入商品名称', { exact: true }).inputValue(), '仅本地未保存表单');
    await page.getByRole('menuitem', { name: '网页功能入口', exact: true }).click();
    await page.getByRole('heading', { name: '网页功能', exact: true }).waitFor();
    assert.match(await page.locator('.workspace-scope').innerText(), /尚无独立的后台编辑接口/);
    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    await guestPage.goto(base + '#/channel/web'); await guestPage.waitForURL('**/#/login?redirect=**');
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    console.log('PASS workspace switch, back/forward, refresh, single shared menu, unsaved form, guest guard; no business writes');
    await guest.close(); await context.close();
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
