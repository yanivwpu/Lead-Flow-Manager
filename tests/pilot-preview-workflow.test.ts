import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import pg from 'pg';
import {requireReadOnlyRole} from '../scripts/shopify-pilot/readOnlyRole';
import {sanitizedPreview,sanitizedFailure,previewFromEnvironment,previewPoolOptions} from '../scripts/shopify-pilot/previewIdentity';

test('pg receives only validated connection fields and fixed certificate-verified Neon TLS, without connecting',()=>{
  const base='postgresql://fixture_reader:encoded%40password@ep-fixture.neon.tech:5432/fixture%2Ddatabase';
  for(const suffix of ['', '?sslmode=require','?sslmode=verify-full']) {
    const options=previewPoolOptions(base+suffix);
    assert.equal(options.connectionString,undefined);
    // Inspect the real installed pg client's effective config: no database IO.
    const client=new pg.Client(options);
    assert.equal(client.host,'ep-fixture.neon.tech');
    assert.equal(client.port,5432);
    assert.equal(client.user,'fixture_reader');
    assert.equal(client.database,'fixture-database');
    assert.equal(client.password,'encoded@password');
    assert.deepEqual(client.ssl,{rejectUnauthorized:true,servername:'ep-fixture.neon.tech'});
  }
});

test('conflicting or unknown URL parameters fail before constructing any connection',async()=>{
  const base='postgresql://fixture_reader:fixture_password@ep-fixture.neon.tech/fixture';
  for(const query of ['ssl=0','ssl=false','host=example.com','host=ep-other.neon.tech','hostaddr=127.0.0.1',
    'port=5433','user=other','password=other','database=other','sslmode=disable','sslmode=no-verify','sslmode=verify-ca',
    'sslcert=/private/cert','sslkey=/private/key','sslrootcert=/private/root','uselibpqcompat=true',
    'options=-c%20role%3Dother','SSL=0','Host=example.com','%68ost=example.com','%73sl=0',
    'sslmode=require&ssl=0','sslmode=verify-full&host=example.com','sslmode=require&sslmode=disable',
    'sslmode=verify-full&sslmode=verify-full','sslmode=require&SSLMode=disable']) {
    const binding=base+'?'+query;
    assert.throws(()=>previewPoolOptions(binding),{message:'neon_read_only_binding_required'},query);
    await assert.rejects(previewFromEnvironment({PILOT_IDENTITY_READ_ONLY_DATABASE_URL:binding,
      PILOT_IDENTITY_CANONICAL_CONTACT_ID:'fixture-A',PILOT_IDENTITY_SOURCE_CONTACT_ID:'fixture-B',SHOPIFY_API_SECRET:'fixture-key'}),
      {message:'neon_read_only_binding_required'},query);
  }
  for(const binding of ['not-a-url','postgresql://reader:password@example.com/db',
    'postgresql://reader:password@ep-fixture.neon.tech.attacker.invalid/db',
    'postgresql://ep-fixture.neon.tech/db','postgresql://reader:password@ep-fixture.neon.tech/',
    base+'#host=example.com']) assert.throws(()=>previewPoolOptions(binding),{message:'neon_read_only_binding_required'});
});

test('real PostgreSQL privilege audit rejects writers, inaccessible tables and switchable write roles',async()=>{
  const pg=new PGlite();
  const client=pg as any;
  try {
    await pg.exec(`CREATE TABLE role_fixture(id text,private_data text);
      REVOKE CREATE ON SCHEMA public FROM PUBLIC;
      CREATE ROLE preview_reader LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
      GRANT USAGE ON SCHEMA public TO preview_reader;
      GRANT SELECT ON ALL TABLES IN SCHEMA public TO preview_reader;
      SET SESSION AUTHORIZATION preview_reader;`);
    await requireReadOnlyRole(client);
    await pg.exec('SET SESSION AUTHORIZATION postgres');
    await pg.exec('ALTER TABLE role_fixture ENABLE ROW LEVEL SECURITY');
    await pg.exec('SET SESSION AUTHORIZATION preview_reader');
    await assert.rejects(requireReadOnlyRole(client),/read_only_database_role_required/,'filtered rows cannot produce a complete reference audit');
    await pg.exec('SET SESSION AUTHORIZATION postgres');
    await pg.exec('ALTER TABLE role_fixture DISABLE ROW LEVEL SECURITY');
    await pg.exec('SET SESSION AUTHORIZATION preview_reader');
    for(const grant of ['UPDATE ON role_fixture','UPDATE(private_data) ON role_fixture']) {
      await pg.exec('SET SESSION AUTHORIZATION postgres');
      await pg.exec(`GRANT ${grant} TO preview_reader`);
      await pg.exec('SET SESSION AUTHORIZATION preview_reader');
      await assert.rejects(requireReadOnlyRole(client),/read_only_database_role_required/);
      await pg.exec('SET SESSION AUTHORIZATION postgres');
      await pg.exec(`REVOKE ${grant} FROM preview_reader`);
      await pg.exec('SET SESSION AUTHORIZATION preview_reader');
    }
    await pg.exec(`SET SESSION AUTHORIZATION postgres; CREATE TABLE hidden_fixture(id text); SET SESSION AUTHORIZATION preview_reader;`);
    await assert.rejects(requireReadOnlyRole(client),/read_only_database_role_required/);
    await pg.exec(`SET SESSION AUTHORIZATION postgres; GRANT SELECT ON hidden_fixture TO preview_reader;
      CREATE ROLE preview_writer NOINHERIT; GRANT UPDATE ON role_fixture TO preview_writer;
      GRANT preview_writer TO preview_reader; SET SESSION AUTHORIZATION preview_reader;`);
    assert.equal((await pg.query("SELECT has_table_privilege(current_user,'role_fixture','UPDATE') AS writable")).rows[0].writable,false,'membership does not inherit writes, but SET ROLE remains unsafe');
    await assert.rejects(requireReadOnlyRole(client),/read_only_database_role_required/);
    await pg.exec('SET SESSION AUTHORIZATION postgres');
    await assert.rejects(requireReadOnlyRole(client),/read_only_database_role_required/,'owner is never a read-only binding');
  } finally {await pg.close();}
});

test('output is an explicit allowlist; raw patches, identifiers, row hashes and connection values cannot escape',()=>{
  const fixture:any={digest:'a'.repeat(64),blocked:['unhandled_reference:private_detail'],
    refs:[{table:'messages',column:'contact_id',count:6,digest:'private-row-hash'}],
    changes:{restricted:false,canonical:{automations_paused:false,phone:'PRIVATE_PHONE'},source:{id:'PRIVATE_ID'}},summary:{secret:'PRIVATE_SECRET'}};
  const output=sanitizedPreview(fixture);
  assert.deepEqual(output,{digest:'a'.repeat(64),blockers:['unhandled_reference'],references:[{table:'messages',column:'contact_id',count:6}]});
  assert.doesNotMatch(JSON.stringify(output),/PRIVATE|private-row-hash|private_detail/);
  assert.deepEqual(sanitizedFailure(Error('PRIVATE_DATABASE_ERROR')),{digest:null,blockers:['preview_unavailable'],references:[]});
  assert.deepEqual(sanitizedFailure(Error('pilot_reconciliation_privacy_locked')),{digest:null,blockers:['privacy_locked'],references:[]});
  fixture.changes.restricted=true;
  assert.ok(sanitizedPreview(fixture).blockers.includes('recipient_restricted'));
  fixture.refs[0].count=-1;
  assert.throws(()=>sanitizedPreview(fixture),/invalid_preview_result/);
});

test('missing bindings fail before a connection; entry point never imports the apply implementation',async()=>{
  await assert.rejects(previewFromEnvironment({}),/explicit_read_only_target_and_pair_required/);
  const entry=await readFile('scripts/shopify-pilot/previewIdentity.ts','utf8');
  const core=await readFile('scripts/shopify-pilot/identityPreview.ts','utf8');
  assert.doesNotMatch(entry,/from ['"].*reconcileIdentity/);
  assert.doesNotMatch(core,/export async function reconcile|client\.query\(['"`](?:UPDATE|INSERT|DELETE|COMMIT)/);
  assert.match(core,/BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(entry,/requireReadOnlyRole\(client\)/);
  assert.match(entry,/rejectUnauthorized:true/);
});

test('workflow has only manual main dispatch, protected environment, pinned actions and step-scoped secrets',async()=>{
  const yaml=await readFile('.github/workflows/shopify-pilot-preview.yml','utf8');
  assert.match(yaml,/workflow_dispatch:/);
  assert.doesNotMatch(yaml,/pull_request:|push:|schedule:|workflow_call:|inputs:/);
  assert.match(yaml,/github\.event_name == 'workflow_dispatch' && github\.ref == 'refs\/heads\/main'/);
  assert.match(yaml,/environment: shopify-pilot-operator/);
  assert.match(yaml,/contents: read/);
  assert.match(yaml,/persist-credentials: false/);
  assert.match(yaml,/ref: \$\{\{ github.sha \}\}/);
  assert.doesNotMatch(yaml,/write|upload-artifact|download-artifact|GITHUB_OUTPUT|GITHUB_STEP_SUMMARY|reconcileIdentity|railway|secrets\.DATABASE_URL/);
  for(const use of yaml.matchAll(/uses: ([^\n]+)/g)) assert.match(use[1],/@[a-f0-9]{40}/);
  const install=yaml.indexOf('npm ci');
  assert.ok(install>0 && yaml.indexOf('${{ secrets.')>install,'dependencies see no production secret bindings');
});
