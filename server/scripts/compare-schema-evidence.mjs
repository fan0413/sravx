import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const GROUPS = ['tables', 'views', 'routines', 'triggers', 'events'];

export function parseArguments(args) {
  if (args.length !== 4 || args[0] !== '--source' || !args[1] || args[2] !== '--target' || !args[3]) {
    throw new Error('Usage: --source <controlled-json-path> --target <controlled-json-path>');
  }
  return { source: args[1], target: args[3] };
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function statementMap(snapshot, group) {
  const objects = snapshot?.objects?.[group];
  if (!Array.isArray(objects)) throw new Error(`Invalid schema ${group}.`);
  return new Map(objects.map((object) => {
    if (typeof object?.name !== 'string' || typeof object?.statement !== 'string') throw new Error(`Invalid ${group} object.`);
    return [object.name, digest(object.statement)];
  }));
}

function foreignKeyDigest(snapshot) {
  const keys = snapshot?.objects?.foreignKeys;
  if (!Array.isArray(keys)) throw new Error('Invalid schema foreign keys.');
  return digest(JSON.stringify(keys.map((key) => ({ tableName: key.tableName, constraintName: key.constraintName, referencedTableName: key.referencedTableName })).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right)))));
}

export function compareSchemaEvidence(source, target) {
  if (source?.format !== 'sravx-source-schema/v1' || target?.format !== 'sravx-source-schema/v1') throw new Error('Unsupported schema evidence format.');
  const differences = [];
  for (const group of GROUPS) {
    const left = statementMap(source, group);
    const right = statementMap(target, group);
    for (const name of [...new Set([...left.keys(), ...right.keys()])].sort()) {
      if (left.get(name) !== right.get(name)) differences.push({ group, name, reason: left.has(name) && right.has(name) ? 'statement_digest_mismatch' : left.has(name) ? 'missing_from_target' : 'unexpected_in_target' });
    }
  }
  if (foreignKeyDigest(source) !== foreignKeyDigest(target)) differences.push({ group: 'foreignKeys', name: null, reason: 'definition_digest_mismatch' });
  if (source.schemaSettings?.characterSet !== target.schemaSettings?.characterSet || source.schemaSettings?.collation !== target.schemaSettings?.collation) differences.push({ group: 'schemaSettings', name: null, reason: 'default_encoding_mismatch' });
  return { sourceSchema: source.database, targetSchema: target.database, matches: differences.length === 0, differences };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const paths = parseArguments(process.argv.slice(2));
  const [source, target] = await Promise.all([readFile(paths.source, 'utf8').then(JSON.parse), readFile(paths.target, 'utf8').then(JSON.parse)]);
  const result = compareSchemaEvidence(source, target);
  console.log(JSON.stringify(result));
  if (!result.matches) process.exitCode = 1;
}
