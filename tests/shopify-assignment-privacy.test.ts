import test from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { PgDialect } from "drizzle-orm/pg-core";
import { assignmentPrivacyQueries } from "../server/shopifyAssignmentPrivacy";
test("signed shop erasure purges its assignment and inverse metadata; unrelated shop remains", async () => {
  const db = new PGlite(); const dialect=new PgDialect();
  try {
    await db.exec(`CREATE SCHEMA shopify_reassignment_private;
      CREATE TABLE shopify_reassignment_private.manifest(table_name text,patches jsonb);
      CREATE TABLE shopify_store_assignments(shop text);
      INSERT INTO shopify_reassignment_private.manifest VALUES
        ('users','[{"shopify_shop":"whachatcrm.myshopify.com"}]'),
        ('contacts','[{"id":"fixture"}]');
      INSERT INTO shopify_store_assignments VALUES ('whachatcrm.myshopify.com'),('other.myshopify.com');`);
    const erase=async(shop:string)=>{for(const q of assignmentPrivacyQueries(shop,{manifest:true,assignments:true})){
      const query=dialect.sqlToQuery(q);await db.query(query.sql,query.params);}};
    await erase('unrelated.myshopify.com');
    assert.equal((await db.query('SELECT * FROM shopify_reassignment_private.manifest')).rows.length,2);
    await erase('whachatcrm.myshopify.com');
    assert.equal((await db.query('SELECT * FROM shopify_reassignment_private.manifest')).rows.length,0);
    assert.deepEqual((await db.query('SELECT shop FROM shopify_store_assignments')).rows,[{shop:'other.myshopify.com'}]);
    await erase('whachatcrm.myshopify.com'); // replay is harmless
    assert.deepEqual(assignmentPrivacyQueries('whachatcrm.myshopify.com',undefined),[]);
  } finally {await db.close();}
});
