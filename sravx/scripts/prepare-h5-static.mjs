// Preserve existing public demo assets and dynamic /static image fallbacks.
import { cpSync, existsSync } from 'node:fs'
const output = new URL('../dist/build/h5/', import.meta.url)
if (!existsSync(new URL('index.html', output))) throw new Error('先完成网页生产构建')
cpSync(new URL('../static/', import.meta.url), new URL('static/', output), { recursive: true })
console.log('网页演示资源与/static图片已保留在构建目录')
