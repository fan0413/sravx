// Read-only aggregate inspection. No credentials, product content or identity output.
import mysql from 'mysql2/promise';
import { pathToFileURL } from 'node:url';

export async function inspectClassificationSchema(connection) {
  const [[version]] = await connection.execute('SELECT VERSION() AS version');
  const [columns] = await connection.execute(`SELECT COLUMN_TYPE, COLUMN_KEY FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products' AND COLUMN_NAME = 'id'`);
  const [engines] = await connection.execute(`SELECT ENGINE FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'`);
  const [tables] = await connection.execute(`SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'product_classifications'`);
  const [counts] = await connection.execute('SELECT COUNT(*) AS total FROM products WHERE deleted_at IS NULL');
  const supportedVersion = /^8\./.test(version.version) && (Number(version.version.split('.')[1]) > 0 || Number(version.version.split('.')[2].split('-')[0]) >= 16);
  const compatibleParent = /^bigint(?:\(\d+\))? unsigned$/i.test(columns[0]?.COLUMN_TYPE || '') && columns[0]?.COLUMN_KEY === 'PRI' && engines[0]?.ENGINE === 'InnoDB';
  let unclassified = Number(counts[0].total);
  if (tables.length) {
    const [missing] = await connection.execute('SELECT COUNT(*) AS total FROM products p LEFT JOIN product_classifications pc ON pc.product_id = p.id WHERE p.deleted_at IS NULL AND pc.product_id IS NULL');
    unclassified = Number(missing[0].total);
  }
  return { supportedVersion, compatibleParent, migrationTablePresent: tables.length === 1, activeProductCount: Number(counts[0].total), unclassifiedProductCount: unclassified };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.env.CATALOG_PREFLIGHT_DATABASE_URL) throw new Error('An explicitly selected CATALOG_PREFLIGHT_DATABASE_URL is required.');
  try {
    const connection = await mysql.createConnection(process.env.CATALOG_PREFLIGHT_DATABASE_URL);
    try { process.stdout.write(JSON.stringify(await inspectClassificationSchema(connection)) + '\n'); }
    finally { await connection.end(); }
  } catch { process.stderr.write('Catalog preflight failed; inspect the controlled database configuration and schema.\n'); process.exitCode = 1; }
}
