import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, '../..');
async function sourceFiles(directory, extensions = ['.js']) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path, extensions);
    return entry.isFile() && extensions.some((extension) => entry.name.endsWith(extension)) ? [path] : [];
  }));
  return files.flat();
}

const artifactFiles = [
  'package-lock.json',
  'package.json',
  ...(await sourceFiles(resolve(repositoryRoot, 'server/src')))
    .map((path) => relative(resolve(repositoryRoot, 'server'), path).replaceAll('\\', '/'))
    .sort(),
  ...(await sourceFiles(resolve(repositoryRoot, 'server/scripts'), ['.mjs', '.sh']))
    .map((path) => relative(resolve(repositoryRoot, 'server'), path).replaceAll('\\', '/'))
    .sort(),
  ...(await sourceFiles(resolve(repositoryRoot, 'server/migrations'), ['.sql']))
    .map((path) => relative(resolve(repositoryRoot, 'server'), path).replaceAll('\\', '/'))
    .sort()
];

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

async function fileDigest(deployPath) {
  const sourcePath = `server/${deployPath}`;
  const content = await readFile(resolve(repositoryRoot, sourcePath));
  return { sourcePath, deployPath, sha256: sha256(content), bytes: content.length };
}

function git(...argumentsList) {
  return execFileSync('git', ['-C', repositoryRoot, ...argumentsList], { encoding: 'utf8' }).trim();
}

const manifest = {
  format: 'sravx-api-release-manifest/v1',
  generatedAt: new Date().toISOString(),
  gitCommit: git('rev-parse', 'HEAD'),
  gitCommitShort: git('rev-parse', '--short', 'HEAD'),
  workingTreeDirty: git('status', '--porcelain') !== '',
  repositoryPath: relative(repositoryRoot, resolve(repositoryRoot)) || '.',
  deploymentRoot: 'server',
  files: await Promise.all(artifactFiles.map(fileDigest))
};

process.stdout.write(`${JSON.stringify(manifest, null, 2)}\n`);
