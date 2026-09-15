import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../..');
const artifactFiles = [
  'server/package-lock.json',
  'server/src/server.js'
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function fileDigest(path) {
  const content = await readFile(resolve(repositoryRoot, path));
  return { path, sha256: sha256(content), bytes: content.length };
}

function git(...argumentsList) {
  return execFileSync('git', ['-C', repositoryRoot, ...argumentsList], { encoding: 'utf8' }).trim();
}

const manifest = {
  format: 'sravx-api-release-manifest/v1',
  generatedAt: new Date().toISOString(),
  gitCommit: git('rev-parse', 'HEAD'),
  gitCommitShort: git('rev-parse', '--short', 'HEAD'),
  repositoryPath: relative(repositoryRoot, resolve(repositoryRoot)) || '.',
  files: await Promise.all(artifactFiles.map(fileDigest))
};

process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
