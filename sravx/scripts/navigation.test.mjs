import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { goBackOrParent, parentUrl, parentRoutes, pageStack } from '../common/navigation.mjs';

test('all non-entry pages have an explicit parent, never welcome/showcase by mistake', () => {
  const config = readFileSync(new URL('../pages.json', import.meta.url), 'utf8');
  const paths = [...config.matchAll(/"path":\s*"([^"]+)"/g)].map(m => m[1]);
  for (const path of paths.filter(p => !['pages/welcome/index','pages/index/index','pages/splash/index'].includes(p))) assert.ok(parentRoutes[path], path);
  for (const route of ['pages/cart/index','pages/user-center/index','pages/order-list/index','pages/shop/index']) assert.equal(parentUrl(route), '/pages/index/index');
  assert.equal(parentUrl('pages/product-detail/index', {series:'basic'}), '/pages/shop/index?series=basic');
  assert.equal(parentUrl('pages/profile-edit/index'), '/pages/user-center/index');
  assert.equal(parentUrl('pages/points-product-detail/index'), '/pages/points-mall/index');
  assert.equal(parentUrl('pages/confirm-order/index', {isPointsOrder:'true'}), '/pages/points-mall/index');
  assert.equal(parentUrl('pages/order-after-sale/index',{orderId:12}), '/pages/order-detail/index?id=12&backend=target');
});
test('history is preferred; empty stack and failed navigation have a safe parent', () => {
  const calls=[];
  try {
    globalThis.uni={navigateBack:o=>calls.push(['back',o]),reLaunch:o=>calls.push(['parent',o.url])};
    globalThis.getCurrentPages=()=>[{route:'pages/index/index'},{route:'pages/cart/index'}];
    goBackOrParent(); assert.equal(calls[0][0], 'back'); assert.equal(calls[0][1].delta, 1);
    calls[0][1].fail(); assert.deepEqual(calls[1], ['parent','/pages/index/index']);
    globalThis.getCurrentPages=()=>[{route:'pages/order-detail/index'}];
    goBackOrParent(); assert.deepEqual(calls[2], ['parent','/pages/order-list/index']);
    globalThis.getCurrentPages=()=>[]; goBackOrParent('/pages/cart/index'); assert.deepEqual(calls[3], ['parent','/pages/cart/index']);
  } finally {delete globalThis.uni;delete globalThis.getCurrentPages;}
});
test('native pages show supplemental back only on direct entry; custom bars always show it', () => {
  const file = readFileSync(new URL('../components/sravx-page-back/sravx-page-back.vue',import.meta.url),'utf8');
  const script=file.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm,'').replace('export default','globalThis.component=');
  for(const size of [1,2]) {
    const context=vm.createContext({pageStack:()=>Array(size).fill({}),goBackOrParent,uni:{}});
    vm.runInContext(script,context);
    const instance={...context.component.data(),rootOnly:true,mode:'inline'};
    context.component.mounted.call(instance);assert.equal(instance.visible,size===1);
    instance.rootOnly=false;context.component.mounted.call(instance);assert.equal(instance.visible,true);
  }
  assert.equal(pageStack().length,0);
});
test('native pages retain native headers and custom pages contain back controls', () => {
  const config=readFileSync(new URL('../pages.json',import.meta.url),'utf8');
  for(const line of config.split(/\r?\n/)) {
    const match=line.match(/"path":\s*"([^"]+)"/);if(!match)continue;
    const source=readFileSync(new URL('../'+match[1]+'.vue',import.meta.url),'utf8');
    if(!line.includes('navigationStyle'))assert.match(source, /<sravx-page-back root-only\s*\/>/,match[1]);
    if(source.includes('<sravx-page-back')) {
      assert.match(source, /import SravxPageBack from/, match[1]+' needs explicit registration for HBuilderX');
      assert.match(source, /components\s*:\s*\{[^}]*SravxPageBack/, match[1]);
    }
    if(['pages/cart/index','pages/user-center/index','pages/shop/index'].includes(match[1]))assert.match(source, /<sravx-page-back/,match[1]);
    if(['pages/index/index','pages/welcome/index','pages/splash/index'].includes(match[1]))assert.doesNotMatch(source, /<sravx-page-back/);
  }
});
