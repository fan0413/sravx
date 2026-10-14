// Read-only check: public documentation links and API names must match the source.
const fs = require('node:fs')
const path = require('node:path')
const cp = require('node:child_process')
const ts = require('../admin-web/node_modules/typescript')
const root = path.resolve(__dirname, '..')
const git = process.env.SRAVX_GIT_PATH || 'git'
const tracked = new Set(cp.execFileSync(git, ['ls-files', '-z'], { cwd: root }).toString().split('\0').filter(Boolean))
const documents = ['README.md', ...[...tracked].filter(name => name.startsWith('docs/') && name.endsWith('.md'))]
const failures = []
for (const name of documents) {
  const source = fs.readFileSync(path.join(root, name), 'utf8')
  for (const [, target] of source.matchAll(/\]\(([^)]+)\)/g)) {
    if (/^(https?:|#)/.test(target)) continue
    const destination = path.posix.normalize(path.posix.join(path.posix.dirname(name), target.split('#')[0]))
    if (!tracked.has(destination)) failures.push(name + ': link is not in Git: ' + destination)
  }
}
const description = fs.readFileSync(path.join(root, 'docs/api-reference.md'), 'utf8')
let count = 0
for (const name of ['sravx/common/api.js', 'admin-web/src/api/admin.ts', 'admin-web/src/lib/target-admin-auth.ts']) {
  const source = ts.createSourceFile(name, fs.readFileSync(path.join(root, name), 'utf8'), ts.ScriptTarget.Latest, true)
  let names
  if (name.endsWith('api.js')) {
    const statement = source.statements.find(item => ts.isVariableStatement(item) && item.declarationList.declarations.some(item => item.name.getText(source) === 'api'))
    names = statement.declarationList.declarations.find(item => item.name.getText(source) === 'api').initializer.properties.map(item => item.name.getText(source))
  } else names = source.statements.filter(item => ts.isFunctionDeclaration(item) && item.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)).map(item => item.name.text)
  for (const name of names) { count++; if (!description.includes(name)) failures.push('API description missing: ' + name) }
}
if (failures.length) { console.error(failures.join('\n')); process.exitCode = 1 }
else console.log('PASS: public links and ' + count + ' API function names checked')
