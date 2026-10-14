import { readFileSync, readdirSync, lstatSync } from 'node:fs'
import { resolve, relative } from 'node:path'
import { createHash } from 'node:crypto'
const root = resolve(process.argv[2] || 'dist/build/h5')
const manifest = JSON.parse(readFileSync(process.argv[3] || '../.local-backup/releases/web-20261014/manifest.json', 'utf8'))
const actual = []
function visit(directory) {
  for (const name of readdirSync(directory)) {
    const file = resolve(directory, name), info = lstatSync(file)
    if (info.isSymbolicLink()) throw new Error('Unexpected symlink')
    if (info.isDirectory()) visit(file)
    else actual.push(relative(root, file).replaceAll('\\', '/'))
  }
}
visit(root)
if (actual.length !== manifest.files.length) throw new Error('File count mismatch')
for (const entry of manifest.files) {
  if (!actual.includes(entry.path)) throw new Error('Missing release file')
  const content = readFileSync(resolve(root, entry.path))
  if (content.length !== entry.bytes || createHash('sha256').update(content).digest('hex') !== entry.sha256) throw new Error('Release hash mismatch')
}
console.log('Verified release files: ' + actual.length)
