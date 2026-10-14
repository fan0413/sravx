// Rendering fixture for the actual mini template/styles. No business/network writes.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.SRAVX_BROWSER_MODULE || 'playwright');
const admin = path.resolve(__dirname, '../../admin-web/node_modules');
const { compileTemplate } = require(path.join(admin, '@vue/compiler-sfc'));
const source = fs.readFileSync(path.resolve(__dirname, '../pages/shop/index.vue'), 'utf8');
const mini = source.split('<!-- #ifndef H5 -->')[1].split('<!-- #endif -->')[0];
const template = mini.match(/<view v-if="toolGroups.length" class="tools">[\s\S]*?<\/scroll-view>\s*<\/view>/)[0]
  .replace(/<scroll-view\b/g, '<div style="overflow-x:auto"').replace(/<\/scroll-view>/g, '</div>')
  .replace(/<view\b/g, '<div').replace(/<\/view>/g, '</div>').replace(/<text\b/g, '<span').replace(/<\/text>/g, '</span>');
const compiled = compileTemplate({ source: template, filename: 'shop-mini-strip.vue', id: 'strip-fixture' }).code
  .replace(/import \{([^}]+)\} from "vue"/, (_, imports) => 'const {' + imports.replace(/ as /g, ':') + '} = Vue;')
  .replace('export function render', 'function render');
const style = source.match(/<style>([\s\S]*?)<\/style>/)[1];
async function run() {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.SRAVX_BROWSER_EXECUTABLE });
  try {
    for (const width of [320, 375, 430]) {
      const page = await browser.newPage({ viewport: { width, height: 240 } }), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      const css = style.replace(/([\d.]+)rpx/g, (_, value) => Number(value) * width / 750 + 'px');
      await page.setContent('<style>body{margin:0;background:#F4F6F8;font-family:"PingFang SC","Microsoft YaHei",sans-serif}' + css + '</style><div id="app"></div>');
      await page.addScriptTag({ path: path.join(admin, 'vue/dist/vue.global.prod.js') });
      await page.addScriptTag({ content: compiled + `
        const app = Vue.createApp({render,data(){return {activeToolGroup:'all',toolGroups:[{key:'all',label:'全部'},{key:'straight',label:'直剪'},{key:'curved',label:'弯剪'},{key:'thinning',label:'牙剪'},{key:'fishbone',label:'鱼骨剪'},{key:'texturizing',label:'造型剪'}]}},methods:{selectGroup(key){this.activeToolGroup=key}}});app.mount('#app');` });
      assert.equal(await page.locator('.tool-scroll').count(), 1);
      assert.equal(await page.locator('.sub-chip').count(), 0);
      const sizes = await page.locator('.tool-scroll').evaluate(el => ({ viewport:el.clientWidth,content:el.scrollWidth,heights:[...el.querySelectorAll('.tool-chip')].map(c=>c.getBoundingClientRect().top) }));
      assert.equal(new Set(sizes.heights).size, 1);
      if (width === 320) assert.ok(sizes.content > sizes.viewport, 'small screen must overflow rather than compress chips');
      if (sizes.content > sizes.viewport) {
        await page.locator('.tool-scroll').hover(); await page.mouse.wheel(500,0);
        await page.waitForFunction(() => document.querySelector('.tool-scroll').scrollLeft > 0);
      }
      await page.getByText('造型剪', { exact:true }).click();
      assert.equal(await page.locator('.tool-chip.active').innerText(), '造型剪');
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({width,overflow:sizes.content>sizes.viewport,singleRow:true,selection:true,duplicateRow:false}));
      await page.close();
    }
  } finally { await browser.close(); }
}
run().catch(error=>{console.error(error);process.exitCode=1});
