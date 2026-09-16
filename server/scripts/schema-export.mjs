import { mkdir, open, rename } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export function databaseIdentifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) throw new Error('Invalid database name.');
  return value;
}

export function quoteIdentifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_$-]{1,128}$/.test(value)) throw new Error('Invalid identifier.');
  return `\`${value}\``;
}

export function parseArguments(args) {
  if (args.length !== 5 || args[0] !== '--database' || !args[1] || args[2] !== '--output' || !args[3] || args[4] !== '--apply') {
    throw new Error('Usage: --database <source-database> --output <controlled-json-path> --apply');
  }
  return { database: databaseIdentifier(args[1]), output: args[3] };
}

async function writePrivateJson(path, content) {
  const absolute = resolve(path);
  await mkdir(dirname(absolute), { recursive: true, mode: 0o700 });
  const temporary = `${absolute}.tmp-${process.pid}`;
  const file = await open(temporary, 'w', 0o600);
  try { await file.writeFile(`${JSON.stringify(content)}\n`, 'utf8'); } finally { await file.close(); }
  await rename(temporary, absolute);
}

function createConnectionOptions(environment, database) {
  const required = (name) => {
    const value = environment[`SOURCE_${name}`];
    if (!value) throw new Error(`SOURCE_${name} is required.`);
    return value;
  };
  return {
    host: required('MYSQL_HOST'),
    port: Number(required('MYSQL_PORT')),
    user: required('MYSQL_USER'),
    password: required('MYSQL_PASSWORD'),
    database,
    connectionLimit: 1,
    dateStrings: true
  };
}

async function createStatements(connection, database, objectType, rows) {
  const statements = [];
  for (const row of rows) {
    const name = row.name;
    const qualified = `${quoteIdentifier(database)}.${quoteIdentifier(name)}`;
    const [result] = await connection.query(`SHOW CREATE ${objectType} ${qualified}`);
    const statement = createStatement(result[0]);
    if (typeof statement !== 'string' || statement.length === 0) throw new Error(`Unable to export ${objectType} ${name}.`);
    statements.push({ name, statement });
  }
  return statements;
}

function createStatement(row) {
  return Object.entries(row || {}).find(([key]) => {
    const normalized = key.toLowerCase();
    return normalized.startsWith('create ') || normalized === 'sql original statement';
  })?.[1];
}

export async function exportSchema(connection, database) {
  const schema = databaseIdentifier(database);
  await connection.query('SET SESSION TRANSACTION READ ONLY');
  const [[settings]] = await connection.query('SELECT @@version AS version, @@sql_mode AS sqlMode, @@time_zone AS timeZone, @@character_set_server AS characterSetServer, @@collation_server AS collationServer');
  const [[schemaSettings]] = await connection.execute(
    `SELECT DEFAULT_CHARACTER_SET_NAME AS characterSet, DEFAULT_COLLATION_NAME AS collation
       FROM information_schema.SCHEMATA WHERE SCHEMA_NAME = ?`, [schema]
  );
  if (!schemaSettings) throw new Error(`Schema ${schema} was not found.`);
  const [tables] = await connection.execute(
    `SELECT TABLE_NAME AS name, TABLE_TYPE AS type, ENGINE AS engine, TABLE_COLLATION AS collation
       FROM information_schema.TABLES WHERE TABLE_SCHEMA = ? ORDER BY TABLE_NAME`, [schema]
  );
  const baseTables = tables.filter((table) => table.type === 'BASE TABLE');
  const views = tables.filter((table) => table.type === 'VIEW');
  const [triggers] = await connection.execute(
    `SELECT TRIGGER_NAME AS name, EVENT_OBJECT_TABLE AS tableName, ACTION_TIMING AS timing, EVENT_MANIPULATION AS manipulation
       FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA = ? ORDER BY TRIGGER_NAME`, [schema]
  );
  const [events] = await connection.execute(
    `SELECT EVENT_NAME AS name, EVENT_TYPE AS type, STATUS AS status
       FROM information_schema.EVENTS WHERE EVENT_SCHEMA = ? ORDER BY EVENT_NAME`, [schema]
  );
  const [routines] = await connection.execute(
    `SELECT ROUTINE_NAME AS name, ROUTINE_TYPE AS type
       FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA = ? ORDER BY ROUTINE_TYPE, ROUTINE_NAME`, [schema]
  );
  const [foreignKeys] = await connection.execute(
    `SELECT TABLE_NAME AS tableName, CONSTRAINT_NAME AS constraintName, REFERENCED_TABLE_NAME AS referencedTableName
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL
      GROUP BY TABLE_NAME, CONSTRAINT_NAME, REFERENCED_TABLE_NAME
      ORDER BY TABLE_NAME, CONSTRAINT_NAME`, [schema]
  );
  const [columns] = await connection.execute(
    `SELECT TABLE_NAME AS tableName, COLUMN_NAME AS name, ORDINAL_POSITION AS ordinalPosition,
            COLUMN_DEFAULT AS defaultValue, IS_NULLABLE AS nullable, DATA_TYPE AS dataType,
            COLUMN_TYPE AS columnType, CHARACTER_SET_NAME AS characterSet, COLLATION_NAME AS collation,
            COLUMN_KEY AS keyType, EXTRA AS extra, COLUMN_COMMENT AS comment, GENERATION_EXPRESSION AS generationExpression
       FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME, ORDINAL_POSITION`, [schema]
  );
  const [indexes] = await connection.execute(
    `SELECT TABLE_NAME AS tableName, NON_UNIQUE AS nonUnique, INDEX_NAME AS name,
            SEQ_IN_INDEX AS sequence, COLUMN_NAME AS columnName, COLLATION AS collation,
            SUB_PART AS subPart, INDEX_TYPE AS type, INDEX_COMMENT AS comment, IS_VISIBLE AS visible
       FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME, INDEX_NAME, SEQ_IN_INDEX`, [schema]
  );
  const [constraints] = await connection.execute(
    `SELECT TABLE_NAME AS tableName, CONSTRAINT_NAME AS name, CONSTRAINT_TYPE AS type
       FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME, CONSTRAINT_NAME`, [schema]
  );
  const routineStatements = [];
  for (const routine of routines) {
    const [result] = await connection.query(`SHOW CREATE ${routine.type} ${quoteIdentifier(schema)}.${quoteIdentifier(routine.name)}`);
    const statement = createStatement(result[0]);
    if (typeof statement !== 'string' || statement.length === 0) throw new Error(`Unable to export ${routine.type} ${routine.name}.`);
    routineStatements.push({ name: routine.name, type: routine.type, statement });
  }
  return {
    format: 'sravx-source-schema/v1',
    collectedAt: new Date().toISOString(),
    database: schema,
    settings,
    schemaSettings,
    objects: {
      tables: await createStatements(connection, schema, 'TABLE', baseTables),
      views: await createStatements(connection, schema, 'VIEW', views),
      triggers: await createStatements(connection, schema, 'TRIGGER', triggers),
      events: await createStatements(connection, schema, 'EVENT', events),
      routines: routineStatements,
      foreignKeys
    },
    metadata: { tables, columns, indexes, constraints },
    summary: {
      baseTables: baseTables.length,
      views: views.length,
      triggers: triggers.length,
      events: events.length,
      routines: routines.length,
      foreignKeys: foreignKeys.length
    }
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { database, output } = parseArguments(process.argv.slice(2));
  const mysql = await import('mysql2/promise');
  const pool = mysql.createPool(createConnectionOptions(process.env, database));
  try {
    const connection = await pool.getConnection();
    try {
      const schema = await exportSchema(connection, database);
      await writePrivateJson(output, schema);
      console.log(JSON.stringify({ format: schema.format, output: 'written_to_controlled_path', summary: schema.summary }));
    } finally { connection.release(); }
  } finally { await pool.end(); }
}
