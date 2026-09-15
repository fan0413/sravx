import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { relative, resolve } from 'node:path';

const [manifestPath] = process.argv.slice(2);

if (!manifestPath) {
  process.stderr.write('Usage: node scripts/verify-release-manifest.mjs <manifest.json>\n');
  process.exitCode = 64;
} else {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  if (manifest.format !== 'sravx-api-release-manifest/v1' || !Array.isArray(manifest.files)) {
    throw new Error('Unsupported release manifest.');
  }

  const root = resolve(process.cwd());
  const result = { success: true, checked: 0, mismatches: [] };
  for (const file of manifest.files) {
    const deployPath = file?.deployPath;
    if (typeof deployPath !== 'string' || deployPath.length === 0) throw new Error('Invalid manifest file path.');
    const candidate = resolve(root, deployPath);
    const relativePath = relative(root, candidate);
    if (relativePath.startsWith('..') || relativePath === '' || /^(?:[A-Za-z]:|\\\\)/.test(relativePath)) throw new Error('Unsafe manifest file path.');

    let content;
    try {
      content = await readFile(candidate);
    } catch {
      result.success = false;
      result.mismatches.push({ deployPath, reason: 'missing' });
      continue;
    }
    const actualSha256 = createHash('sha256').update(content).digest('hex');
    result.checked += 1;
    if (actualSha256 !== file.sha256 || content.length !== file.bytes) {
      result.success = false;
      result.mismatches.push({ deployPath, reason: 'digest_or_size_mismatch' });
    }
  }

  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.success) process.exitCode = 1;
}
