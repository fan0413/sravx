// Generate a controlled release manifest, never a source-code or secrets archive.
import { readdirSync, readFileSync, lstatSync, mkdirSync, writeFileSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { createHash } from 'node:crypto'
const root = resolve('dist/build/h5')
const output = resolve(process.argv[2] || '../.local-backup/releases/web-20261014')
if (!output.startsWith(resolve('../.local-backup/releases') + '\\') && !output.startsWith(resolve('../.local-backup/releases') + '/')) throw new Error('Release output must be in controlled releases directory')
const files = []
function visit(directory) {
  for (const entry of readdirSync(directory)) {
    const absolute = resolve(directory, entry), info = lstatSync(absolute)
    if (info.isSymbolicLink()) throw new Error('Release symlinks are not allowed')
    if (info.isDirectory()) { visit(absolute); continue }
    const path = relative(root, absolute).replaceAll('\\', '/')
    if (/(^|\/)(\.|node_modules|src|logs|certificates)|\.(pem|key|p12|sql|log|map|tar|gz)$/i.test(path)) throw new Error('Unsafe release file: ' + path)
    files.push({ path, bytes: info.size, sha256: createHash('sha256').update(readFileSync(absolute)).digest('hex') })
  }
}
visit(root)
if (!files.some(file => file.path === 'index.html')) throw new Error('Website entry missing')
for (const name of ['fishbone-7', 'curve-6-5', 'fluffy-7', 'natural-7']) {
  if (!files.some(file => file.path === `official/orbit/${name}.png`)) throw new Error('Showcase image missing')
}
mkdirSync(output, { recursive: true })
writeFileSync(resolve(output, 'manifest.json'), JSON.stringify({ release: 'web-20261014', files }, null, 2) + '\n')
console.log(JSON.stringify({ files: files.length, bytes: files.reduce((sum, file) => sum + file.bytes, 0), output }))
