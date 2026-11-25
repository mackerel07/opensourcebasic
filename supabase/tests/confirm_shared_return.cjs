// Run against disposable PGlite only; no production connection is used.
const { PGlite } = require('@electric-sql/pglite');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const assert = require('node:assert/strict');
(async () => {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create table public.inventory_labels(code text primary key);
    insert into public.inventory_labels values ('calculator'),('scissors'),('mouse');`);
  const migrations = resolve(__dirname, '../migrations');
  await db.exec(readFileSync(resolve(migrations, '20261117083955_shared_inventory_without_login.sql'), 'utf8'));
  await db.exec(readFileSync(resolve(migrations, '20261125060936_confirm_shared_return.sql'), 'utf8'));
  await db.exec('set role anon');
  const group = (await db.query('select id from public.shared_item_groups')).rows[0].id;
  const call = async (id, counts) => (await db.query('select public.confirm_shared_return($1,$2,$3) as receipt', [id,group,JSON.stringify(counts)])).rows[0].receipt;
  const quantities = async () => Object.fromEntries((await db.query('select label_code,expected_quantity from public.shared_item_group_items where group_id=$1',[group])).rows.map(r=>[r.label_code,r.expected_quantity]));
  const receiptCount = async () => (await db.query('select count(*)::integer as n from public.shared_inventory_returns')).rows[0].n;
  await db.query("update public.shared_item_group_items set expected_quantity=0 where group_id=$1 and label_code='scissors'",[group]);
  const id='00000000-0000-4000-8000-000000000001';
  const result = await call(id,{calculator:2,scissors:1});
  assert.equal(result.applied,true);
  assert.deepEqual(await quantities(),{calculator:3,scissors:1,mouse:1});
  assert.equal((await call(id,{calculator:2,scissors:1})).applied,false);
  assert.deepEqual(await quantities(),{calculator:3,scissors:1,mouse:1});
  await assert.rejects(call(id,{calculator:1}),e=>e.code==='22023');
  // Calculator would update first; mouse overflow must roll back both it and the receipt.
  await assert.rejects(call('00000000-0000-4000-8000-000000000002',{calculator:1,mouse:999}),e=>e.code==='22023');
  assert.deepEqual(await quantities(),{calculator:3,scissors:1,mouse:1});
  assert.equal(await receiptCount(),1);
  for (const counts of [{scissors:-1},{scissors:1.5},{scissors:'1'},{unknown:1},{}]) {
    await assert.rejects(call('00000000-0000-4000-8000-000000000003',counts),e=>e.code==='22023');
  }
  await call('00000000-0000-4000-8000-000000000004',{scissors:0});
  assert.deepEqual(await quantities(),{calculator:3,scissors:1,mouse:1});
  await call('00000000-0000-4000-8000-000000000005',{scissors:2});
  await call('00000000-0000-4000-8000-000000000006',{scissors:3});
  assert.equal((await quantities()).scissors,6);
  await assert.rejects(db.query('delete from public.shared_inventory_returns'),e=>e.code==='42501');
  await assert.rejects(db.query("update public.shared_inventory_returns set confirmed_counts='{}'"),e=>e.code==='42501');
  const security=(await db.query("select prosecdef from pg_proc where proname='confirm_shared_return'")).rows[0];
  assert.equal(security.prosecdef,false);
  console.log('PASS: confirmed counts, zero stock, duplicate replay, conflicting replay, atomic rollback, validation, additive updates, receipt permissions, security invoker');
  await db.close();
})().catch(e=>{console.error(e);process.exitCode=1;});
