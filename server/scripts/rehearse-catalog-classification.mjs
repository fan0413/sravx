// Synthetic data only; refuses remote servers, non-rehearsal schemas and nonempty schemas.
import mysql from 'mysql2/promise';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { saveClassification } from '../src/catalog/classification.js';
import { createMysqlCatalogRepository } from '../src/repositories/mysql-catalog-repository.js';

if (process.argv[2] !== '--apply') throw new Error('Explicit --apply is required for local synthetic rehearsal.');
const url = new URL(process.env.CATALOG_REHEARSAL_DATABASE_URL || '');
if (!['localhost','127.0.0.1'].includes(url.hostname) || !/^\/sravx_rehearsal_[a-z0-9_]+$/i.test(url.pathname)) throw new Error('A localhost sravx_rehearsal_ database is required.');
let connection;
try {
  connection = await mysql.createConnection(url.toString());
  const [existing] = await connection.execute('SELECT TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE()');
  if (existing.length) throw new Error('Dedicated rehearsal schema must be empty.');
  await connection.execute(`CREATE TABLE categories (id BIGINT UNSIGNED PRIMARY KEY, name VARCHAR(50), parent_id BIGINT UNSIGNED NULL,
    is_show TINYINT NOT NULL DEFAULT 1, deleted_at DATETIME NULL) ENGINE=InnoDB`);
  await connection.execute(`CREATE TABLE products (id BIGINT UNSIGNED PRIMARY KEY, category_id BIGINT UNSIGNED,
    price DECIMAL(10,2), params JSON, is_on_sale TINYINT DEFAULT 1, is_recommend TINYINT DEFAULT 1,
    sort_order INT DEFAULT 0, deleted_at DATETIME NULL) ENGINE=InnoDB`);
  await connection.execute('CREATE TABLE product_specs (id BIGINT UNSIGNED PRIMARY KEY, product_id BIGINT UNSIGNED, price DECIMAL(10,2), KEY idx_spec_price(product_id,price)) ENGINE=InnoDB');
  const migration = await readFile(new URL('../migrations/013_catalog_classifications.sql', import.meta.url), 'utf8');
  await connection.execute(migration);
  await connection.execute("INSERT INTO categories (id,name,parent_id) VALUES (1,'Basic',NULL),(11,'直剪',1),(2,'Pro',NULL),(21,'直剪',2),(3,'配件',NULL)");
  await connection.execute("INSERT INTO products (id,category_id,price,params) VALUES (1,11,9,JSON_OBJECT()),(2,21,9,JSON_OBJECT()),(3,3,9,JSON_OBJECT())");
  for (const [id,categoryId,series,toolGroup] of [[1,11,'basic','straight'],[2,21,'pro','straight'],[3,3,'accessories','accessories']]) await saveClassification(connection,id,{categoryId,series,toolGroup});
  await assert.rejects(connection.execute("INSERT INTO product_classifications VALUES (999,'basic','straight')"));
  await assert.rejects(connection.execute("UPDATE product_classifications SET tool_group='accessories' WHERE product_id=1"));
  await connection.beginTransaction();
  await connection.execute('UPDATE products SET price=5 WHERE id=1');
  await connection.execute("UPDATE product_classifications SET tool_group='curved' WHERE product_id=1");
  await connection.rollback();
  const [[rolledBack]] = await connection.execute('SELECT price FROM products WHERE id=1');
  assert.equal(Number(rolledBack.price),9);
  const repo = createMysqlCatalogRepository(connection,{normalizedCatalog:true});
  assert.deepEqual((await repo.listProducts({series:'basic',toolGroup:'straight'})).map(row=>Number(row.id)),[1]);
  assert.deepEqual((await repo.listProducts({series:'accessories'})).map(row=>Number(row.id)),[3]);
  assert.deepEqual(await repo.listProducts({series:'basic',toolGroup:'invalid'}),[]);
  const [plan] = await connection.execute("EXPLAIN SELECT product_id FROM product_classifications WHERE series='basic' AND tool_group='straight'");
  assert.equal(plan[0].key,'idx_catalog_series_tool_product');
  process.stdout.write(JSON.stringify({passed:true,foreignKey:true,pairConstraint:true,classificationFilter:true,index:plan[0].key,syntheticSchemaRetained:true})+'\n');
} catch { process.stderr.write('Catalog rehearsal failed; review the isolated schema and controlled configuration. No production database is permitted.\n');process.exitCode=1; }
finally { if (connection) await connection.end(); }
