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
    const switchTo = name => page.locator('.topbar .el-radio-button').filter({ hasText: name }).click();
    const menuCount = name => page.getByRole('menuitem', { name, exact: true }).count();
    const selected = async value => {
      // Hash navigation resolves before the asynchronous session guard commits.
      await page.waitForFunction(value => document.querySelector(`.topbar input[value="${value}"]`)?.checked === true, value);
      return page.locator(`.topbar input[value="${value}"]`).isChecked();
    };
    await page.goto(base);
    await page.getByRole('heading', { name: '通用管理', exact: true }).waitFor();
    assert.match(page.url(), /#\/channel\/common$/);
    assert.equal(await page.getByRole('menuitem', { name: '商品列表', exact: true }).count(), 1);
    assert.equal(await menuCount('积分商品列表'), 0); assert.equal(await menuCount('SN 码管理'), 0);
    assert.equal(await menuCount('订单列表'), 1); assert.equal(await menuCount('剪刀售后'), 1);
    if (process.env.SRAVX_ADMIN_TEST_SCREENSHOT) await page.screenshot({ path: process.env.SRAVX_ADMIN_TEST_SCREENSHOT, fullPage: true });
    await switchTo('网页管理');
    await page.getByRole('heading', { name: '网页管理', exact: true }).waitFor();
    assert.equal(await menuCount('商品列表'), 0); assert.equal(await menuCount('积分商品列表'), 0);
    assert.equal(await page.locator('.workspace-tools article').count(), 0);
    assert.match(await page.locator('.workspace-scope').innerText(), /尚无独立的后台编辑接口/);
    await switchTo('小程序管理');
    await page.getByRole('heading', { name: '小程序管理', exact: true }).waitFor();
    assert.equal(await menuCount('积分商品列表'), 1); assert.equal(await menuCount('积分订单列表'), 1); assert.equal(await menuCount('SN 码管理'), 1);
    assert.equal(await menuCount('商品列表'), 0); assert.equal(await menuCount('订单列表'), 0); assert.equal(await menuCount('剪刀售后'), 0);
    await page.goBack(); await page.getByRole('heading', { name: '网页管理', exact: true }).waitFor(); assert.ok(await selected('web'));
    await page.goForward(); await page.getByRole('heading', { name: '小程序管理', exact: true }).waitFor();
    await page.reload(); await page.getByRole('heading', { name: '小程序管理', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => localStorage.getItem('sravx.admin.workspace')), 'miniprogram');
    await page.getByRole('menuitem', { name: '积分商品列表', exact: true }).click();
    await page.waitForURL('**/#/points-product/list'); assert.ok(await selected('miniprogram'));
    await page.reload(); await page.waitForURL('**/#/points-product/list'); await page.locator('.topbar').waitFor(); assert.ok(await selected('miniprogram'));
    await switchTo('通用管理'); await page.getByRole('heading', { name: '通用管理', exact: true }).waitFor();
    await page.getByRole('menuitem', { name: '新建商品', exact: true }).click();
    await page.getByPlaceholder('请输入商品名称', { exact: true }).fill('仅本地未保存表单');
    await switchTo('网页管理');
    await page.getByRole('button', { name: '留在编辑页', exact: true }).click();
    assert.match(page.url(), /#\/product\/create$/);
    assert.equal(await page.getByPlaceholder('请输入商品名称', { exact: true }).inputValue(), '仅本地未保存表单');
    assert.ok(await selected('common')); assert.equal(await page.evaluate(() => localStorage.getItem('sravx.admin.workspace')), 'common');
    await page.goBack(); await page.getByRole('button', { name: '留在编辑页', exact: true }).click();
    await page.waitForURL('**/#/product/create');
    assert.equal(await page.getByPlaceholder('请输入商品名称', { exact: true }).inputValue(), '仅本地未保存表单');
    await page.getByRole('menuitem', { name: '网页管理入口', exact: true }).click();
    await page.getByRole('button', { name: '继续切换', exact: true }).click();
    await page.getByRole('heading', { name: '网页管理', exact: true }).waitFor();
    await page.getByRole('button', { name: '前往通用管理', exact: true }).click(); await page.getByRole('heading', { name: '通用管理', exact: true }).waitFor();
    await page.goto(base + '#/scissors/after-sale'); await page.locator('.topbar').waitFor(); assert.ok(await selected('common'));
    await page.goto(base + '#/scissors/list'); await page.locator('.topbar').waitFor(); assert.ok(await selected('miniprogram'));
    await page.goto(base + '#/category/list'); await page.locator('.topbar').waitFor(); assert.ok(await selected('common'));
    await page.goto(base + '#/not-a-page'); await page.getByRole('heading', { name: '通用管理', exact: true }).waitFor();
    const guest = await browser.newContext();
    const guestPage = await guest.newPage();
    for (const workspace of ['common', 'web', 'miniprogram']) {
      await guestPage.goto(base + '#/channel/' + workspace); await guestPage.waitForURL('**/#/login?redirect=**');
    }
    assert.deepEqual(errors, []); assert.deepEqual(writes, []);
    console.log('PASS 3 workspaces, disjoint menus, direct-link ownership, switch/back/refresh, cancel keeps draft, confirm navigates, feature registry, guest guards; no business writes');
    await guest.close(); await context.close();
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
