import { mkdir, open, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

export function quoteIdentifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_]+$/.test(value)) throw new Error('Unsafe SQL identifier.');
  return `\`${value}\``;
}

export function parseArguments(args) {
  const values = new Map();
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    const value = args[index + 1];
    if (!['--output', '--database'].includes(key) || !value || values.has(key)) throw new Error('Usage: --database <name> --output <controlled-json-path>');
    values.set(key, value);
  }
  if (!values.has('--database') || !values.has('--output')) throw new Error('Usage: --database <name> --output <controlled-json-path>');
  return { database: values.get('--database'), output: values.get('--output') };
}

async function writePrivateJson(path, content) {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true, mode: 0o700 });
  const temporary = `${absolute}.tmp-${process.pid}`;
  const file = await open(temporary, 'w', 0o600);
  try {
    await file.writeFile(`${JSON.stringify(content, null, 2)}\n`, 'utf8');
  } finally {
    await file.close();
  }
  await rename(temporary, absolute);
}

async function collectBaseline(connection, database) {
  const [tables] = await connection.execute(
    `SELECT TABLE_NAME AS tableName FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = ? AND TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME ASC`,
    [database]
  );
  const results = [];
  for (const { tableName } of tables) {
    const [primaryKeyRows] = await connection.execute(
      `SELECT COLUMN_NAME AS columnName FROM information_schema.KEY_COLUMN_USAGE
       WHERE TABLE_SCHEMA = ? AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
       ORDER BY ORDINAL_POSITION ASC`,
      [database, tableName]
    );
    const primaryKey = primaryKeyRows.map((row) => row.columnName);
    const identifier = quoteIdentifier(tableName);
    if (primaryKey.length === 1) {
      const column = quoteIdentifier(primaryKey[0]);
      const [rows] = await connection.query(`SELECT COUNT(*) AS rowCount, MIN(${column}) AS minimumPrimaryKey, MAX(${column}) AS maximumPrimaryKey FROM ${identifier}`);
      results.push({ table: tableName, primaryKey, ...rows[0] });
    } else {
      const [rows] = await connection.query(`SELECT COUNT(*) AS rowCount FROM ${identifier}`);
      results.push({ table: tableName, primaryKey, ...rows[0], minimumPrimaryKey: null, maximumPrimaryKey: null });
    }
  }
  return results;
}

if (import.meta.main) {
  const { database, output } = parseArguments(process.argv.slice(2));
  if (!database || !output) throw new Error('Both --database and --output are required.');
  const mysql = await import('mysql2/promise');
  const required = (name) => {
    const value = process.env[name];
    if (!value) throw new Error(`${name} is required.`);
    return value;
  };
  const pool = mysql.createPool({
    host: required('MYSQL_HOST'),
    port: Number(required('MYSQL_PORT')),
    user: required('MYSQL_MIGRATION_USER'),
    password: required('MYSQL_MIGRATION_PASSWORD'),
    database,
    connectionLimit: 1
  });
  try {
    const connection = await pool.getConnection();
    try {
      await connection.query('SET SESSION TRANSACTION READ ONLY');
      const tables = await collectBaseline(connection, database);
      await writePrivateJson(output, { schema: database, collectedAt: new Date().toISOString(), tables });
      console.log(`Collected baseline metadata for ${tables.length} tables.`);
    } finally {
      connection.release();
    }
  } finally {
    await pool.end();
  }
}
