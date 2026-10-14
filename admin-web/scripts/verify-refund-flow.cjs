// All business calls are synthetic and intercepted, including approval/refund.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.SRAVX_BROWSER_MODULE || 'playwright');
const base = process.env.SRAVX_ADMIN_TEST_URL || 'http://127.0.0.1:5181/';
const baseline = process.env.SRAVX_REFUND_BASELINE === '1';
async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.SRAVX_BROWSER_EXECUTABLE });
  try {
    const context = await browser.newContext();
    await context.addInitScript(() => sessionStorage.setItem('sravx.target.admin.session', 'fixture-only'));
    const page = await context.newPage(), errors = [], writes = [], queries = [];
    const refund = { id: 7, order_id: 8, order_no: 'SYNTHETIC-ORDER', requested_amount: '0.10', status: 'pending_review', order_status: 'refunding' };
    page.on('pageerror', error => errors.push(error.message));
    await context.route('**/api/v1/**', async route => {
      const request = route.request(), url = new URL(request.url()), path = url.pathname;
      let data = { list: [], total: 0 };
      if (path === '/api/v1/admin/orders') data = { list: [{ id: 8, order_no: refund.order_no, status: 'refunding', pay_amount: '0.10' }], total: 1 };
      if (path === '/api/v1/admin/refund-requests') { queries.push(url.searchParams.get('keyword')); data = { list: [refund], total: 1 }; }
      if (path === '/api/v1/admin/refund-requests/7') data = { refund, order: { id: 8, status: 'refunding' }, user: null, address: null, items: [{ id: 1, product_name: '合成工具', spec_desc: '合成规格' }] };
      if (request.method() !== 'GET') {
        writes.push(path);
        if (path.endsWith('/decision')) { assert.equal(request.postDataJSON().decision, 'approve'); refund.status = 'approved'; data = { requestId: 7, status: 'approved' }; }
        else if (path.endsWith('/execute')) { refund.status = 'processing'; data = { status: 'PROCESSING' }; }
        else throw new Error('Unexpected fixture write: ' + path);
      }
      await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ success: true, data }) });
    });
    await page.goto(base + '#/order/list');
    await page.getByRole('button', { name: '详情', exact: true }).first().waitFor();
    if (baseline) {
      const orderLink = await page.getByRole('button', { name: '退款处理', exact: true }).count();
      await page.goto(base + '#/refund/detail/7');
      await page.getByText('合成工具', { exact: true }).waitFor();
      console.log(JSON.stringify({ baselineOrderRefundLinks: orderLink, baselineDetailApproval: await page.getByRole('button', { name: '同意退款', exact: true }).count() }));
      assert.equal(writes.length, 0); return;
    }
    await page.getByRole('button', { name: '退款处理', exact: true }).click();
    await page.getByRole('button', { name: '同意退款', exact: true }).waitFor();
    assert.equal(queries.at(-1), 'SYNTHETIC-ORDER');
    await page.getByRole('button', { name: '详情', exact: true }).click();
    await page.getByText('合成规格', { exact: true }).waitFor();
    await page.getByRole('button', { name: '同意退款', exact: true }).click();
    await page.getByRole('button', { name: '取消', exact: true }).click();
    assert.equal(writes.length, 0);
    await page.getByRole('button', { name: '同意退款', exact: true }).click();
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await page.getByRole('button', { name: '执行退款', exact: true }).waitFor();
    await page.getByRole('button', { name: '执行退款', exact: true }).click();
    await page.getByRole('button', { name: '确定', exact: true }).click();
    await page.getByRole('button', { name: '重试原退款', exact: true }).waitFor();
    assert.deepEqual(writes, ['/api/v1/admin/refund-requests/7/decision', '/api/v1/admin/refund-requests/7/execute']);
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await page.getByRole('button', { name: '重试原退款', exact: true }).waitFor();
    assert.deepEqual(errors, []);
    console.log('PASS order refund link/filter, detail approval, cancelled approval does not write, execution/processing retry, adjacent list, no page errors; synthetic APIs only');
  } finally { await browser.close(); }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
