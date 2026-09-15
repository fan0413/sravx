import { readFile } from 'node:fs/promises';

function tableMap(document) {
  if (!document || !Array.isArray(document.tables)) throw new Error('Evidence document has no tables array.');
  const values = new Map();
  for (const table of document.tables) {
    if (!table || typeof table.table !== 'string' || !table.table) throw new Error('Evidence document has an invalid table entry.');
    if (values.has(table.table)) throw new Error(`Evidence document repeats table ${table.table}.`);
    values.set(table.table, table);
  }
  return values;
}

function normalized(value) {
  return value === undefined ? null : value;
}

export function compareRowEvidence(source, target) {
  const sourceTables = tableMap(source);
  const targetTables = tableMap(target);
  const names = [...new Set([...sourceTables.keys(), ...targetTables.keys()])].sort();
  const differences = [];
  for (const table of names) {
    const left = sourceTables.get(table);
    const right = targetTables.get(table);
    if (!left || !right) {
      differences.push({ table, issue: left ? 'MISSING_TARGET_TABLE' : 'MISSING_SOURCE_TABLE' });
      continue;
    }
    const leftPrimary = JSON.stringify(left.primaryKey || []);
    const rightPrimary = JSON.stringify(right.primaryKey || []);
    if (leftPrimary !== rightPrimary) differences.push({ table, issue: 'PRIMARY_KEY_MISMATCH' });
    if (normalized(left.rowCount) !== normalized(right.rowCount)) differences.push({ table, issue: 'ROW_COUNT_MISMATCH' });
    if (normalized(left.minimumPrimaryKey) !== normalized(right.minimumPrimaryKey) || normalized(left.maximumPrimaryKey) !== normalized(right.maximumPrimaryKey)) differences.push({ table, issue: 'PRIMARY_KEY_RANGE_MISMATCH' });
    if (Array.isArray(left.chunks) || Array.isArray(right.chunks)) {
      const leftChunks = Array.isArray(left.chunks) ? left.chunks : [];
      const rightChunks = Array.isArray(right.chunks) ? right.chunks : [];
      if (JSON.stringify(left.columns || []) !== JSON.stringify(right.columns || [])) differences.push({ table, issue: 'COLUMN_ORDER_MISMATCH' });
      if (leftChunks.length !== rightChunks.length || leftChunks.some((chunk, index) => chunk.offset !== rightChunks[index]?.offset || chunk.rowCount !== rightChunks[index]?.rowCount || chunk.digest !== rightChunks[index]?.digest)) differences.push({ table, issue: 'CHUNK_DIGEST_MISMATCH' });
    }
  }
  return { sourceSchema: source.schema || '', targetSchema: target.schema || '', tablesCompared: names.length, differences, matches: differences.length === 0 };
}

function parseArguments(args) {
  if (args.length !== 4 || args[0] !== '--source' || args[2] !== '--target' || !args[1] || !args[3]) throw new Error('Usage: --source <controlled-json-path> --target <controlled-json-path>');
  return { source: args[1], target: args[3] };
}

if (import.meta.main) {
  const paths = parseArguments(process.argv.slice(2));
  const [source, target] = await Promise.all([readFile(paths.source, 'utf8').then(JSON.parse), readFile(paths.target, 'utf8').then(JSON.parse)]);
  const result = compareRowEvidence(source, target);
  console.log(JSON.stringify({ sourceSchema: result.sourceSchema, targetSchema: result.targetSchema, tablesCompared: result.tablesCompared, matches: result.matches, differences: result.differences }));
  if (!result.matches) process.exitCode = 2;
}
