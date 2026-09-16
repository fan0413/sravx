import { mkdir, open, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { quoteIdentifier } from './row-baseline.mjs';

export const USER_BASE_COLUMNS = Object.freeze(['id', 'status', 'openid', '_openid', 'unionid', 'username', 'phone', 'gender', 'birthday', 'occupation', 'created_at', 'updated_at', 'profile_updated_at']);
const REQUIRED_COLUMNS = Object.freeze(['id', 'status']);
const IDENTITY_COLUMNS = Object.freeze(['openid', '_openid', 'unionid']);

export function selectUserBaseColumns(columns) {
  const names = new Set(columns);
  const missing = REQUIRED_COLUMNS.filter((name) => !names.has(name));
  const identities = IDENTITY_COLUMNS.filter((name) => names.has(name));
  if (missing.length || !identities.length) throw new Error('The source users table does not support the approved user-base scope.');
  return USER_BASE_COLUMNS.filter((name) => names.has(name));
}

export function validateSnapshot(snapshot) {
  if (!snapshot || snapshot.scope !== 'users-basic-data-only' || !Array.isArray(snapshot.columns) || !Array.isArray(snapshot.rows)) throw new Error('Invalid user snapshot.');
  const columns = selectUserBaseColumns(snapshot.columns);
  if (JSON.stringify(columns) !== JSON.stringify(snapshot.columns)) throw new Error('Snapshot contains unapproved user fields.');
  const ids = new Set();
  const subjects = new Set();
  for (const row of snapshot.rows) {
    if (!row || !Number.isInteger(Number(row.id)) || Number(row.id) <= 0) throw new Error('Snapshot has an invalid user id.');
    if (typeof row.status !== 'string' || !row.status) throw new Error('Snapshot has an invalid user status.');
    const openid = String(row.openid || '').trim();
    const legacyOpenid = String(row._openid || '').trim();
    if (openid && legacyOpenid && openid !== legacyOpenid) throw new Error('Snapshot has conflicting OpenID values.');
    const bindings = identityBindings(row);
    if (!bindings.length) throw new Error('Snapshot contains a user without a supported identity.');
    if (ids.has(Number(row.id))) throw new Error('Snapshot repeats a user id.');
    ids.add(Number(row.id));
    for (const { provider, subject } of bindings) {
      const identity = `${provider}:${subject}`;
      if (subjects.has(identity)) throw new Error('Snapshot reuses an identity across users.');
      subjects.add(identity);
    }
  }
  return { columns, rowCount: snapshot.rows.length };
}

export function identityBindings(row) {
  const bindings = [];
  const openid = String(row.openid || row._openid || '').trim();
  const unionid = String(row.unionid || '').trim();
  if (openid) bindings.push({ provider: 'wechat_miniprogram_openid', subject: openid });
  if (unionid) bindings.push({ provider: 'wechat_unionid', subject: unionid });
  return bindings;
}

export async function writePrivateJson(path, content) {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true, mode: 0o700 });
  const temporary = `${absolute}.tmp-${process.pid}`;
  const file = await open(temporary, 'w', 0o600);
  try { await file.writeFile(`${JSON.stringify(content)}\n`, 'utf8'); } finally { await file.close(); }
  await rename(temporary, absolute);
}

export async function sourceUserColumns(connection, database) {
  const [rows] = await connection.execute(
    `SELECT COLUMN_NAME AS name FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ? AND TABLE_NAME = 'users' ORDER BY ORDINAL_POSITION`, [database]
  );
  return rows.map((row) => row.name);
}

function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!['--database', '--output'].includes(key) || !value || values.has(key)) throw new Error('Usage: --database <name> --output <controlled-json-path>');
    values.set(key, value);
  }
  if (values.size !== 2) throw new Error('Usage: --database <name> --output <controlled-json-path>');
  return { database: values.get('--database'), output: values.get('--output') };
}

if (import.meta.main) {
  const { database, output } = parseArguments(process.argv.slice(2));
  const required = (name) => {
    const value = process.env[`SOURCE_${name}`];
    if (!value) throw new Error(`SOURCE_${name} is required.`);
    return value;
  };
  const mysql = await import('mysql2/promise');
  const pool = mysql.createPool({ host: required('MYSQL_HOST'), port: Number(required('MYSQL_PORT')), user: required('MYSQL_USER'), password: required('MYSQL_PASSWORD'), database, connectionLimit: 1, dateStrings: true });
  try {
    const connection = await pool.getConnection();
    try {
      await connection.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await connection.query('START TRANSACTION WITH CONSISTENT SNAPSHOT, READ ONLY');
      const columns = selectUserBaseColumns(await sourceUserColumns(connection, database));
      const selected = columns.map(quoteIdentifier).join(', ');
      const [rows] = await connection.query(`SELECT ${selected} FROM ${quoteIdentifier('users')} ORDER BY ${quoteIdentifier('id')} ASC`);
      const snapshot = { scope: 'users-basic-data-only', collectedAt: new Date().toISOString(), sourceDatabase: database, columns, rows };
      const result = validateSnapshot(snapshot);
      await connection.commit();
      await writePrivateJson(output, snapshot);
      console.log(JSON.stringify({ scope: snapshot.scope, rowCount: result.rowCount, columns: result.columns, output: 'written_to_controlled_path' }));
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally { connection.release(); }
  } finally { await pool.end(); }
}
