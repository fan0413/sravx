import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { identityBindings, validateSnapshot } from './user-basic-snapshot.mjs';

function parseArguments(args) {
  if (args.length !== 3 || args[0] !== '--snapshot' || !args[1] || args[2] !== '--apply') throw new Error('Usage: --snapshot <controlled-json-path> --apply');
  return { snapshot: args[1] };
}

export async function importUsers(connection, snapshot) {
  const { columns, rowCount } = validateSnapshot(snapshot);
  const [[targetCount]] = await connection.query('SELECT COUNT(*) AS total FROM users');
  if (Number(targetCount.total) !== 0) throw new Error('Target users table must be empty before the approved one-time import.');
  await connection.beginTransaction();
  try {
    const placeholders = columns.map(() => '?').join(', ');
    for (const row of snapshot.rows) {
      await connection.execute(`INSERT INTO users (${columns.map((name) => `\`${name}\``).join(', ')}) VALUES (${placeholders})`, columns.map((name) => row[name] ?? null));
      for (const binding of identityBindings(row)) {
        await connection.execute('INSERT INTO user_identities (user_id, provider, provider_subject) VALUES (?, ?, ?)', [row.id, binding.provider, binding.subject]);
      }
    }
    await connection.commit();
    return { importedUsers: rowCount, importedIdentityBindings: snapshot.rows.reduce((total, row) => total + identityBindings(row).length, 0) };
  } catch (error) {
    await connection.rollback();
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { snapshot: path } = parseArguments(process.argv.slice(2));
  const snapshot = JSON.parse(await readFile(path, 'utf8'));
  const required = (name) => {
    const value = process.env[`TARGET_${name}`];
    if (!value) throw new Error(`TARGET_${name} is required.`);
    return value;
  };
  const mysql = await import('mysql2/promise');
  const pool = mysql.createPool({ host: required('MYSQL_HOST'), port: Number(required('MYSQL_PORT')), user: required('MYSQL_USER'), password: required('MYSQL_PASSWORD'), database: required('MYSQL_DATABASE'), connectionLimit: 1, dateStrings: true });
  try {
    const connection = await pool.getConnection();
    try {
      const result = await importUsers(connection, snapshot);
      console.log(JSON.stringify({ scope: 'users-basic-data-only', ...result }));
    } finally { connection.release(); }
  } finally { await pool.end(); }
}
