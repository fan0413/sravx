import { mkdir, open, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { quoteIdentifier } from './row-baseline.mjs';

const REQUIRED_USER_COLUMNS = Object.freeze(['id', 'status']);
const IDENTITY_COLUMNS = Object.freeze(['openid', '_openid', 'unionid']);
const PROFILE_COLUMNS = Object.freeze(['username', 'phone', 'avatar', 'gender', 'birthday', 'occupation', 'created_at', 'updated_at', 'profile_updated_at']);

function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!['--source-database', '--target-database', '--output'].includes(key) || !value || values.has(key)) {
      throw new Error('Usage: --source-database <name> --target-database <name> --output <controlled-json-path>');
    }
    values.set(key, value);
  }
  if (values.size !== 3) throw new Error('Usage: --source-database <name> --target-database <name> --output <controlled-json-path>');
  return { sourceDatabase: values.get('--source-database'), targetDatabase: values.get('--target-database'), output: values.get('--output') };
}

async function writePrivateJson(path, content) {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true, mode: 0o700 });
  const temporary = `${absolute}.tmp-${process.pid}`;
  const file = await open(temporary, 'w', 0o600);
  try { await file.writeFile(`${JSON.stringify(content, null, 2)}\n`, 'utf8'); } finally { await file.close(); }
  await rename(temporary, absolute);
}

async function tableColumns(connection, database, table) {
  const [rows] = await connection.execute(
    `SELECT COLUMN_NAME AS name, IS_NULLABLE AS nullable, COLUMN_TYPE AS type
       FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY ORDINAL_POSITION`, [database, table]
  );
  return rows.map((row) => ({ name: row.name, nullable: row.nullable === 'YES', type: row.type }));
}

async function indexColumns(connection, database, table) {
  const [rows] = await connection.execute(
    `SELECT INDEX_NAME AS name, NON_UNIQUE AS nonUnique, COLUMN_NAME AS columnName, SEQ_IN_INDEX AS sequence
       FROM information_schema.STATISTICS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ?
      ORDER BY INDEX_NAME, SEQ_IN_INDEX`, [database, table]
  );
  const indexes = new Map();
  for (const row of rows) {
    if (!indexes.has(row.name)) indexes.set(row.name, { name: row.name, unique: Number(row.nonUnique) === 0, columns: [] });
    indexes.get(row.name).columns.push(row.columnName);
  }
  return [...indexes.values()];
}

async function userSummary(connection, tableColumns) {
  const names = new Set(tableColumns.map((column) => column.name));
  const identity = IDENTITY_COLUMNS.filter((name) => names.has(name));
  const conditions = identity.map((name) => `NULLIF(TRIM(${quoteIdentifier(name)}), '') IS NOT NULL`);
  if (!conditions.length) return { total: 0, identityEligible: 0, identityMissing: 0, identityColumns: [] };
  const [[result]] = await connection.query(
    `SELECT COUNT(*) AS total, SUM((${conditions.join(' OR ')})) AS identityEligible FROM ${quoteIdentifier('users')}`
  );
  const total = Number(result.total) || 0;
  const identityEligible = Number(result.identityEligible) || 0;
  return { total, identityEligible, identityMissing: total - identityEligible, identityColumns: identity };
}

function fields(columns) {
  return new Set(columns.map((column) => column.name));
}

export function evaluatePreflight({ sourceUsers, targetUsers, targetIdentities, sourceSummary }) {
  const source = fields(sourceUsers);
  const target = fields(targetUsers);
  const identities = fields(targetIdentities);
  const missingSource = REQUIRED_USER_COLUMNS.filter((name) => !source.has(name));
  const missingTarget = REQUIRED_USER_COLUMNS.filter((name) => !target.has(name));
  const missingIdentityTableColumns = ['user_id', 'provider', 'provider_subject'].filter((name) => !identities.has(name));
  const identityColumns = IDENTITY_COLUMNS.filter((name) => source.has(name) && target.has(name));
  const profileColumns = PROFILE_COLUMNS.filter((name) => source.has(name) && target.has(name));
  const blockers = [];
  if (missingSource.length) blockers.push('SOURCE_USERS_SCHEMA_INCOMPLETE');
  if (missingTarget.length) blockers.push('TARGET_USERS_SCHEMA_INCOMPLETE');
  if (!identityColumns.length) blockers.push('NO_SHARED_IDENTITY_COLUMN');
  if (missingIdentityTableColumns.length) blockers.push('TARGET_IDENTITIES_SCHEMA_INCOMPLETE');
  if (sourceSummary.identityMissing > 0) blockers.push('SOURCE_USERS_WITHOUT_IDENTITY');
  return {
    sourceUserColumns: sourceUsers.map((column) => column.name),
    targetUserColumns: targetUsers.map((column) => column.name),
    importColumns: ['id', 'status', ...identityColumns, ...profileColumns.filter((name) => !identityColumns.includes(name) && !['id', 'status'].includes(name))],
    sourceSummary,
    targetIdentityIndexes: targetIdentities.indexes || [],
    blockers,
    readyForIsolatedImport: blockers.length === 0
  };
}

async function connectionFrom(prefix, database) {
  const required = (name) => {
    const value = process.env[`${prefix}_${name}`];
    if (!value) throw new Error(`${prefix}_${name} is required.`);
    return value;
  };
  const mysql = await import('mysql2/promise');
  return mysql.createPool({ host: required('MYSQL_HOST'), port: Number(required('MYSQL_PORT')), user: required('MYSQL_USER'), password: required('MYSQL_PASSWORD'), database, connectionLimit: 1, dateStrings: true });
}

if (import.meta.main) {
  const { sourceDatabase, targetDatabase, output } = parseArguments(process.argv.slice(2));
  const [sourcePool, targetPool] = await Promise.all([connectionFrom('SOURCE', sourceDatabase), connectionFrom('TARGET', targetDatabase)]);
  try {
    const [sourceConnection, targetConnection] = await Promise.all([sourcePool.getConnection(), targetPool.getConnection()]);
    try {
      await Promise.all([sourceConnection.query('SET SESSION TRANSACTION READ ONLY'), targetConnection.query('SET SESSION TRANSACTION READ ONLY')]);
      const [sourceUsers, targetUsers, targetIdentities] = await Promise.all([
        tableColumns(sourceConnection, sourceDatabase, 'users'),
        tableColumns(targetConnection, targetDatabase, 'users'),
        tableColumns(targetConnection, targetDatabase, 'user_identities')
      ]);
      const summary = await userSummary(sourceConnection, sourceUsers);
      const result = evaluatePreflight({ sourceUsers, targetUsers, targetIdentities: Object.assign(targetIdentities, { indexes: await indexColumns(targetConnection, targetDatabase, 'user_identities') }), sourceSummary: summary });
      await writePrivateJson(output, { collectedAt: new Date().toISOString(), scope: 'users-basic-data-only', ...result });
      console.log(JSON.stringify({ scope: 'users-basic-data-only', readyForIsolatedImport: result.readyForIsolatedImport, blockers: result.blockers, sourceUsers: summary.total, identityEligible: summary.identityEligible, identityMissing: summary.identityMissing }));
      if (!result.readyForIsolatedImport) process.exitCode = 2;
    } finally { sourceConnection.release(); targetConnection.release(); }
  } finally { await Promise.all([sourcePool.end(), targetPool.end()]); }
}
