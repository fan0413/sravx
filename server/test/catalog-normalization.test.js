import test from 'node:test';
import assert from 'node:assert/strict';
import { classificationInput, saveClassification } from '../src/catalog/classification.js';
import { productInput } from '../src/media/admin-catalog-input.js';
import { createMysqlCatalogRepository } from '../src/repositories/mysql-catalog-repository.js';
import { createMysqlAdminCatalogRepository } from '../src/repositories/mysql-admin-catalog-repository.js';
import { catalogResponse } from '../src/routes/catalog.js';
import { inspectClassificationSchema } from '../scripts/catalog-classification-preflight.mjs';
import { createServer } from '../src/server.js';
import { issueSession } from '../src/security/session.js';
import { once } from 'node:events';

test('classification accepts explicit fields and rejects conflicts and accessory/scissors mixing', () => {
  for (const series of ['basic','pro','master']) assert.deepEqual(classificationInput({series,toolGroup:'straight'}), {series,toolGroup:'straight'});
  assert.deepEqual(classificationInput({series:'accessories',toolGroup:'accessories'}), {series:'accessories',toolGroup:'accessories'});
  for (const input of [{series:'unknown',toolGroup:'straight'}, {series:'basic',toolGroup:'accessories'}, {series:'accessories',toolGroup:'straight'}, {series:'basic',toolGroup:'straight',params:{目录系列:'pro'}}]) assert.throws(() => classificationInput(input), /classification/);
  assert.throws(() => classificationInput({}, {required:true}), /classification/);
  const saved = productInput({name:'本地测试',price:1,series:'basic',toolGroup:'straight',params:{材质:'测试'},shippingType:'normal',shipDeadlineDays:2,shippingPromise:'测试'}, {existing:true});
  assert.deepEqual(saved.params, {材质:'测试',目录系列:'basic',目录分类:'straight'});
});
test('classification query works without structured checkout and invalid values never widen results', async () => {
  for (const normalizedCatalog of [false,true]) {
    const calls=[]; const pool={async execute(sql,values){calls.push({sql,values});return [[]];}};
    await createMysqlCatalogRepository(pool,{normalizedCatalog}).listProducts({series:'basic',toolGroup:'straight'});
    assert.deepEqual(calls[0].values.slice(0,2), ['basic','straight']);
    assert.match(calls[0].sql, normalizedCatalog ? /product_classifications/ : /JSON_EXTRACT/);
    assert.doesNotMatch(calls[0].sql, /product_skus/);
    await createMysqlCatalogRepository(pool,{normalizedCatalog}).listProducts({series:'bad'});
    assert.match(calls[1].sql, /1 = 0/);
    await createMysqlCatalogRepository(pool,{normalizedCatalog}).listProducts({series:'basic',toolGroup:'bad'});
    assert.match(calls[2].sql, /1 = 0/);assert.deepEqual(calls[2].values,[20,0]);
    calls.length=0;
    await createMysqlAdminCatalogRepository(pool,{normalizedCatalog}).listProducts({series:'pro',toolGroup:'thinning'});
    assert.deepEqual(calls[0].values.slice(0,2), ['pro','thinning']);
    assert.deepEqual(calls[1].values, ['pro','thinning']);
  }
});
test('normalized classification writes enforce matching category and bound identifiers', async () => {
  let owner='Basic';const writes=[];
  const connection={async execute(sql,values){if(sql.startsWith('SELECT'))return [[{name:'直剪',parent_id:1,root_name:owner}]];writes.push({sql,values});return [{affectedRows:1}];}};
  await saveClassification(connection,1,{categoryId:11,params:{目录系列:'basic',目录分类:'straight'}});
  assert.deepEqual(writes[0].values,[1,'basic','straight']);
  owner='Pro';await assert.rejects(saveClassification(connection,1,{categoryId:11,params:{目录系列:'basic',目录分类:'straight'}}),/does not match/);
  assert.equal(writes.length,1);
});
test('normalized product and classification are saved in one transaction, failures roll back', async () => {
  let fail=false;const events=[];
  const connection={async beginTransaction(){events.push('begin');},async commit(){events.push('commit');},async rollback(){events.push('rollback');},release(){},async execute(sql){
    if(sql.startsWith('SELECT c.name')) return [[{name:'直剪',parent_id:1,root_name:fail?'Pro':'Basic'}]];
    events.push(sql.startsWith('INSERT INTO product_classifications')?'classification':'product');return [{insertId:1,affectedRows:1}];
  }};
  const repo=createMysqlAdminCatalogRepository({async execute(){return [[]];},async getConnection(){return connection;}},{normalizedCatalog:true});
  const input={params:{目录系列:'basic',目录分类:'straight'},categoryId:11,specs:[],images:[],detailImages:[]};
  await repo.createProduct(input);assert.deepEqual(events,['begin','product','classification','commit']);
  events.length=0;fail=true;await assert.rejects(repo.updateProduct(1,input),/does not match/);assert.deepEqual(events,['begin','product','rollback']);
});

test('public and authenticated admin HTTP calls propagate classification independently of checkout', async t => {
  const params=new URLSearchParams({series:'master',toolGroup:'fishbone'});
  let received;
  await catalogResponse('/api/v1/catalog/products',params,{async listProducts(query){received=query;return [];}});
  assert.equal(received.series,'master');assert.equal(received.toolGroup,'fishbone');
  const secret='local-catalog-contract-secret-for-tests-only';
  const server=createServer({sessionSecret:secret,adminSessionRepository:{async active(){return true;}},adminRepository:{async hasRole(){return true;}},adminCatalogRepository:{async listProducts(query){received=query;return {list:[],total:0};}}});
  server.listen(0,'127.0.0.1');await once(server,'listening');t.after(()=>server.close());
  const token=issueSession({subject:7,role:'admin',expiresAt:Math.floor(Date.now()/1000)+60},secret);
  const response=await fetch(`http://127.0.0.1:${server.address().port}/api/v1/admin/products?${params}`,{headers:{authorization:`Bearer ${token}`}});
  assert.equal(response.status,200);assert.equal(received.series,'master');assert.equal(received.toolGroup,'fishbone');
});
test('read-only migration preflight refuses incompatible parent schema and reports only aggregates', async () => {
  const connection={async execute(sql){assert.ok(sql.startsWith('SELECT'));if(sql.includes('VERSION()'))return [[{version:'8.0.36'}]];if(sql.includes('COLUMNS'))return [[{COLUMN_TYPE:'bigint unsigned',COLUMN_KEY:'PRI'}]];if(sql.includes('SELECT ENGINE'))return [[{ENGINE:'InnoDB'}]];if(sql.includes('information_schema.TABLES'))return [[]];return [[{total:0}]];}};
  assert.deepEqual(await inspectClassificationSchema(connection),{supportedVersion:true,compatibleParent:true,migrationTablePresent:false,activeProductCount:0,unclassifiedProductCount:0});
});

test('unclassified existing goods remain readable without guessing series ownership', async () => {
  const calls=[];
  const pool={async execute(sql){calls.push(sql);return [[{id:1,series:null,tool_group:null,classification_source:'legacy'}]];}};
  const result=await createMysqlCatalogRepository(pool,{normalizedCatalog:true}).listProducts({});
  assert.equal(result[0].classification_source,'legacy');
  assert.match(calls[0],/LEFT JOIN product_classifications/);
  assert.doesNotMatch(calls[0],/pc\.series =/);
});

test('optional fulfillment and spec card fields use empty database values without fabricated promises', async () => {
  const calls=[];
  const connection={async beginTransaction(){},async commit(){},async rollback(){},release(){},async execute(sql,values){calls.push({sql,values});return [{insertId:1,affectedRows:1}];}};
  const repo=createMysqlAdminCatalogRepository({execute:connection.execute,getConnection:async()=>connection});
  await repo.createProduct({specs:[{name:'fixture',sku:null,image:null,shippingType:'normal',shipDeadlineDays:2,shippingPromise:'fixture',shippingDelayReason:null,shippingNote:null,cardImage:null,price:1,sortOrder:0}],images:[],detailImages:[],params:{},shippingDelayReason:null,shippingNote:null});
  const product=calls.find(r=>r.sql.startsWith('INSERT INTO products'));
  assert.deepEqual(product.values.slice(-3,-1),['','']);
  const spec=calls.find(r=>r.sql.startsWith('INSERT INTO product_specs'));
  assert.deepEqual(spec.values.slice(7,10),['','','']);
});
