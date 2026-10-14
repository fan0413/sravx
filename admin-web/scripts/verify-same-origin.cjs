// Read-only live browser checks. No credentials, tokens, orders or refund writes.
const assert = require('node:assert/strict');
const { chromium } = require(process.env.SRAVX_BROWSER_MODULE || 'playwright');
const base = process.env.SRAVX_ADMIN_TEST_URL || 'https://admin.sravxpet.com/';
const baseline = process.env.SRAVX_ADMIN_BASELINE === '1';
(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.SRAVX_BROWSER_EXECUTABLE });
  try {
    const page = await browser.newPage(), failures = [], errors = [], sessionRequests = [];
    page.on('request', r => {
      const url = new URL(r.url());
      if (url.pathname === '/api/v1/admin/auth/session') sessionRequests.push(url.origin);
    });
    page.on('requestfailed', r => failures.push(new URL(r.url()).hostname));
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '#/login');
    await page.getByPlaceholder('请输入用户名').waitFor();
    const result = await page.evaluate(async isBaseline => {
      const path = isBaseline ? 'https://api.sravxpet.com/api/v1/admin/auth/session' : '/api/v1/admin/auth/session';
      try {
        const response = await fetch(path);
        const body = await response.json();
        return { status: response.status, code: body.error?.code, blocked: false };
      } catch { return { blocked: true }; }
    }, baseline);
    assert.equal(result.blocked, baseline);
    if (!baseline) {
      assert.equal(result.status, 401);
      assert.equal(result.code, 'UNAUTHENTICATED');
      const order = await page.evaluate(async () => {
        const response = await fetch('/api/v1/admin/orders');
        return { status: response.status, json: (response.headers.get('content-type') || '').includes('application/json') };
      });
      assert.deepEqual(order, { status: 401, json: true });
      // Exercise the deployed adapter itself, not just a manually constructed URL.
      // An invalid synthetic token can only test that the guard still rejects it.
      await page.evaluate(() => sessionStorage.setItem('sravx.target.admin.session', 'fixture-only-invalid-session'));
      const start = sessionRequests.length;
      await page.goto(base + '#/order/list');
      await page.waitForURL(/#\/login\?redirect=/);
      await page.getByPlaceholder('请输入用户名').waitFor();
      assert.match(page.url(), /#\/login\?redirect=/);
      assert.deepEqual(sessionRequests.slice(start), [new URL(base).origin]);
      assert.equal(await page.evaluate(() => sessionStorage.getItem('sravx.target.admin.session')), null);
      assert.equal(failures.length, 0);
      assert.deepEqual(errors, []);
    }
    console.log(JSON.stringify({ baseline, ...result, browserFailures: failures.length, pageErrors: errors.length }));
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
