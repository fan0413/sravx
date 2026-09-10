import { createHash } from 'node:crypto';
import { mkdir, open, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { quoteIdentifier } from './row-baseline.mjs';

const encoder = new TextEncoder();

export function canonicalizeJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalizeJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalizeJson(value[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function encodeValue(value, dataType = '') {
  if (value === null || value === undefined) return Buffer.from('N;');
  if (Buffer.isBuffer(value)) return Buffer.concat([Buffer.from(`B:${value.length}:`), value]);
  const text = dataType.toLowerCase() === 'json'
    ? canonicalizeJson(typeof value === 'string' ? JSON.parse(value) : value)
    : String(value);
  const bytes = encoder.encode(text);
  return Buffer.concat([Buffer.from(`V:${bytes.length}:`), Buffer.from(bytes)]);
}

export function digestRows(rows, columns) {
  const digest = createHash('sha256');
  for (const row of rows) {
    const rowDigest = createHash('sha256');
    for (const column of columns) {
      const name = Buffer.from(column.name, 'utf8');
      const value = encodeValue(row[column.name], column.dataType);
      rowDigest.update(Buffer.from(`C:${name.length}:`));
      rowDigest.update(name);
      rowDigest.update(value);
    }
    const hash = rowDigest.digest();
    digest.update(Buffer.from(`R:${hash.length}:`));
    digest.update(hash);
  }
  return digest.digest('hex');
}

function parseArgs(args) {
  const fields = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!['--database', '--output', '--chunk-size'].includes(key) || !value || fields.has(key)) throw new Error('Usage: --database <name> --output <controlled-json-path> [--chunk-size <1-1000>]');
    fields.set(key, value);
  }
  if (!fields.has('--database') || !fields.has('--output')) throw new Error('Usage: --database <name> --output <controlled-json-path> [--chunk-size <1-1000>]');
  const chunkSize = Number(fields.get('--chunk-size') || 500);
  if (!Number.isInteger(chunkSize) || chunkSize < 1 || chunkSize > 1000) throw new Error('Chunk size must be 1 through 1000.');
  return { database: fields.get('--database'), output: fields.get('--output'), chunkSize };
}

async function writePrivateJson(path, content) {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true, mode: 0o700 });
  const temporary = `${absolute}.tmp-${process.pid}`;
  const file = await open(temporary, 'w', 0o600);
  try { await file.writeFile(`${JSON.stringify(content, null, 2)}\n`, 'utf8'); } finally { await file.close(); }
  await rename(temporary, absolute);
}

async function metadata(connection, database, table) {
  const [columns] = await connection.execute(
    `SELECT COLUMN_NAME AS name, DATA_TYPE AS dataType FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? ORDER BY ORDINAL_POSITION`, [database, table]
  );
  const [primary] = await connection.execute(
    `SELECT COLUMN_NAME AS name FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY' ORDER BY ORDINAL_POSITION`, [database, table]
  );
  if (!primary.length) throw new Error(`Table ${table} has no primary key.`);
  return { columns, primary: primary.map((item) => item.name) };
}

async function collectTable(connection, database, table, chunkSize) {
  const { columns, primary } = await metadata(connection, database, table);
  const selected = columns.map((column) => quoteIdentifier(column.name)).join(', ');
  const ordering = primary.map(quoteIdentifier).join(', ');
  const chunks = [];
  for (let offset = 0; ; offset += chunkSize) {
    const [rows] = await connection.query(`SELECT ${selected} FROM ${quoteIdentifier(table)} ORDER BY ${ordering} LIMIT ? OFFSET ?`, [chunkSize, offset]);
    if (!rows.length) break;
    chunks.push({ offset, rowCount: rows.length, digest: digestRows(rows, columns) });
    if (rows.length < chunkSize) break;
  }
  return { table, columns: columns.map((column) => column.name), primaryKey: primary, chunks };
}

if (import.meta.main) {
  const { database, output, chunkSize } = parseArgs(process.argv.slice(2));
  const mysql = await import('mysql2/promise');
  const required = (name) => { if (!process.env[name]) throw new Error(`${name} is required.`); return process.env[name]; };
  const pool = mysql.createPool({ host: required('MYSQL_HOST'), port: Number(required('MYSQL_PORT')), user: required('MYSQL_MIGRATION_USER'), password: required('MYSQL_MIGRATION_PASSWORD'), database, connectionLimit: 1, dateStrings: true, supportBigNumbers: true, bigNumberStrings: true, decimalNumbers: false });
  try {
    const connection = await pool.getConnection();
    try {
      await connection.query('SET SESSION TRANSACTION READ ONLY');
      const [tables] = await connection.execute(`SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME`, [database]);
      const results = [];
      for (const { name } of tables) results.push(await collectTable(connection, database, name, chunkSize));
      await writePrivateJson(output, { schema: database, collectedAt: new Date().toISOString(), chunkSize, tables: results });
      console.log(`Collected row digests for ${results.length} tables.`);
    } finally { connection.release(); }
  } finally { await pool.end(); }
}
