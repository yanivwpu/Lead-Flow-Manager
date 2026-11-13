import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {requireReadOnlyRole} from '../scripts/shopify-pilot/readOnlyRole';
import {sanitizedPreview,sanitizedFailure,previewFromEnvironment} from '../scripts/shopify-pilot/previewIdentity';

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
