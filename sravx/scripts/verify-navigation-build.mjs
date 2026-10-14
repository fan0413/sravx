import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const root = new URL('../dist/build/mp-weixin/', import.meta.url);
const app = JSON.parse(await readFile(new URL('app.json', root), 'utf8'));
const entries = new Set(['pages/welcome/index', 'pages/index/index', 'pages/splash/index']);
let checked = 0;
for (const path of app.pages) {
  if (entries.has(path)) continue;
  const config = JSON.parse(await readFile(new URL(path + '.json', root), 'utf8'));
  const template = await readFile(new URL(path + '.wxml', root), 'utf8');
  if (config.navigationStyle !== 'custom' || ['pages/cart/index', 'pages/user-center/index', 'pages/shop/index'].includes(path)) {
    assert.ok(config.usingComponents?.['sravx-page-back'], path + ' missing back component');
    assert.match(template, /sravx-page-back/, path);
  } else {
    // The compiler replaces template method names with letter bindings.
    const script = await readFile(new URL(path + '.js', root), 'utf8');
    assert.match(script, /goBackOrParent/, path + ' missing safe back handler');
    assert.match(template, /bindtap=/, path + ' missing compiled tap binding');
  }
  checked++;
}
console.log(`返回入口产物核验通过：${checked}个非入口页面，原生栏未替换，缺失返回组件已编入。`);
