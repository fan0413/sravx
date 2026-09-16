import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

const IDENTIFIER = /^[A-Za-z0-9_$-]{1,128}$/;
const REHEARSAL_DATABASE = /^sravx_rehearsal_[A-Za-z0-9_]{1,96}$/;

export function quoteIdentifier(value) {
  if (typeof value !== 'string' || !IDENTIFIER.test(value)) throw new Error('Invalid identifier.');
  return `\`${value}\``;
}

export function parseArguments(args) {
  if (args.length !== 5 || args[0] !== '--snapshot' || !args[1] || args[2] !== '--database' || !args[3] || args[4] !== '--apply') {
    throw new Error('Usage: --snapshot <controlled-json-path> --database <sravx_rehearsal_name> --apply');
  }
  if (!REHEARSAL_DATABASE.test(args[3])) throw new Error('A dedicated sravx_rehearsal_ database is required.');
  return { snapshot: args[1], database: args[3] };
}

function namedStatements(value, type) {
  if (!Array.isArray(value) || value.some((entry) => typeof entry?.name !== 'string' || typeof entry?.statement !== 'string' || entry.statement.length === 0)) {
    throw new Error(`Invalid ${type} statements.`);
  }
  return value;
}

export function orderedTables(tables, foreignKeys) {
  const byName = new Map(namedStatements(tables, 'table').map((table) => [table.name, table]));
  const parents = new Map([...byName.keys()].map((name) => [name, new Set()]));
  for (const key of foreignKeys || []) {
    if (byName.has(key.tableName) && byName.has(key.referencedTableName)) parents.get(key.tableName).add(key.referencedTableName);
  }
  const pending = new Set(byName.keys());
  const result = [];
  while (pending.size > 0) {
    const ready = [...pending].filter((name) => [...parents.get(name)].every((parent) => !pending.has(parent))).sort();
    if (ready.length === 0) throw new Error('Foreign-key dependency cycle requires manual rehearsal handling.');
    for (const name of ready) {
      pending.delete(name);
      result.push(byName.get(name));
    }
  }
  return result;
}

export function restorePlan(snapshot) {
  if (snapshot?.format !== 'sravx-source-schema/v1' || !snapshot?.objects || typeof snapshot?.schemaSettings?.characterSet !== 'string' || typeof snapshot?.schemaSettings?.collation !== 'string') {
    throw new Error('Unsupported schema snapshot.');
  }
  return {
    tables: orderedTables(snapshot.objects.tables, snapshot.objects.foreignKeys),
    views: namedStatements(snapshot.objects.views, 'view'),
    routines: namedStatements(snapshot.objects.routines, 'routine'),
    triggers: namedStatements(snapshot.objects.triggers, 'trigger'),
    events: namedStatements(snapshot.objects.events, 'event'),
    characterSet: snapshot.schemaSettings.characterSet,
    collation: snapshot.schemaSettings.collation
  };
}

function connectionOptions(environment) {
  const required = (name) => {
    const value = environment[`REHEARSAL_MYSQL_${name}`];
    if (!value) throw new Error(`REHEARSAL_MYSQL_${name} is required.`);
    return value;
  };
  return { host: required('HOST'), port: Number(required('PORT')), user: required('USER'), password: required('PASSWORD'), connectionLimit: 1 };
}

export async function restoreSchema(connection, database, plan) {
  const schema = quoteIdentifier(database);
  await connection.query(`CREATE DATABASE ${schema} CHARACTER SET ${quoteIdentifier(plan.characterSet)} COLLATE ${quoteIdentifier(plan.collation)}`);
  await connection.query(`USE ${schema}`);
  for (const group of [plan.tables, plan.views, plan.routines, plan.triggers, plan.events]) {
    for (const object of group) await connection.query(object.statement);
  }
  return { tables: plan.tables.length, views: plan.views.length, routines: plan.routines.length, triggers: plan.triggers.length, events: plan.events.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { snapshot: snapshotPath, database } = parseArguments(process.argv.slice(2));
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8'));
  const plan = restorePlan(snapshot);
  const mysql = await import('mysql2/promise');
  const pool = mysql.createPool(connectionOptions(process.env));
  try {
    const connection = await pool.getConnection();
    try {
      const summary = await restoreSchema(connection, database, plan);
      console.log(JSON.stringify({ format: 'sravx-schema-rehearsal/v1', database: 'created_in_isolated_rehearsal', summary }));
    } finally { connection.release(); }
  } finally { await pool.end(); }
}
