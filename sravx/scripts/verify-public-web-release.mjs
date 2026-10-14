// Download only published static website artifacts. No credentials or business writes.
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
const base = new URL(process.argv[2] || 'https://sravxpet.com/')
if (base.protocol !== 'https:') throw new Error('HTTPS required')
const manifest = JSON.parse(readFileSync('../.local-backup/releases/web-20261014/manifest.json', 'utf8'))
let cursor = 0, verified = 0
await Promise.all(Array.from({ length: 6 }, async () => {
  while (cursor < manifest.files.length) {
    const entry = manifest.files[cursor++]
    const response = await fetch(new URL(entry.path, base), { signal: AbortSignal.timeout(30000) })
    if (!response.ok) throw new Error('Static resource status ' + response.status)
    if (entry.path === 'index.html' && (!response.headers.get('content-type')?.includes('text/html') || response.headers.get('content-disposition')?.includes('attachment'))) throw new Error('Invalid HTML response headers')
    const bytes = Buffer.from(await response.arrayBuffer())
    if (bytes.length !== entry.bytes || createHash('sha256').update(bytes).digest('hex') !== entry.sha256) throw new Error('Published file hash mismatch: ' + entry.path)
    verified++
  }
}))
console.log('Public HTTPS website artifacts verified: ' + verified)
