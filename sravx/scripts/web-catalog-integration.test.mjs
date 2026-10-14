import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { productClassification } from '../common/product-classification.mjs'
const page = readFileSync(new URL('../pages/shop/index.vue', import.meta.url), 'utf8')
test('web build declares its boot plugin and keeps the original local demo resources', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url)))
  assert.equal(pkg.dependencies['@dcloudio/uni-h5'], pkg.dependencies['@dcloudio/uni-app'])
  assert.match(pkg.scripts['build:h5'], /prepare-h5-static/)
  const home = readFileSync(new URL('../components/SravxOfficialH5.vue', import.meta.url), 'utf8')
  assert.match(home, /static\/official\/hero-curved-scissor\.png/)
  assert.match(home, /static\/official\/thinning-scissor\.png/)
  assert.doesNotMatch(home, /createOrder|createPaymentOrder/)
})
test('web product cards show normalized minimum price and a recoverable catalog error', () => {
  const web = page.split('<!-- #ifdef H5 -->')[1].split('<!-- #endif -->')[0]
  assert.match(web, /item\.display_price_text/)
  assert.match(web, /v-else-if="catalogError"/)
  assert.match(web, /@click="load">重新加载/)
})
test('failed catalog reads stay explicit, do not turn demo content into backend goods, and retry recovers', async () => {
  let failed = true
  const source = page.match(/<script>([\s\S]*?)<\/script>/)[1].replace(/^import .*$/gm, '').replace('export default', 'globalThis.component =')
  const context = vm.createContext({
    api: { asList: x => x, getCategoryList: async () => { if (failed) throw new Error('synthetic failure'); return [{id:11,name:'直剪'}] }, getAllProducts: async () => [] },
    productClassification, SravxPageBack: {}, SravxH5GlobalNav: {}, uni: { showToast() {} }
  })
  vm.runInContext(source, context)
  const state = context.component.data()
  await context.component.methods.load.call(state)
  assert.equal(state.catalogError, 'synthetic failure')
  assert.equal(state.loading, false)
  assert.equal(state.sections.length, 0)
  failed = false
  await context.component.methods.load.call(state)
  assert.equal(state.catalogError, '')
  assert.equal(state.sections.length, 1)
  assert.equal(state.sections[0].products.length, 0)
})
