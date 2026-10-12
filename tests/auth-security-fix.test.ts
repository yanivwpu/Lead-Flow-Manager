/** Isolated integration tests: real handlers + token SQL, no production DB or email. */
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { build } from 'esbuild';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { pathToFileURL } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import bcrypt from 'bcryptjs';
import { passwordResetTokens, portalPasswordResetTokens, adminSettings } from '../shared/schema';
import { validateNewPassword } from '../server/passwordPolicy';

const pg = new PGlite();
await pg.exec(`CREATE TABLE password_reset_tokens (
 id varchar PRIMARY KEY DEFAULT gen_random_uuid(), user_id varchar NOT NULL,
 token_hash text NOT NULL UNIQUE, expires_at timestamp NOT NULL, used_at timestamp,
 created_at timestamp DEFAULT now());
 CREATE TABLE admin_settings (id varchar PRIMARY KEY, password_hash text NOT NULL, updated_at timestamp);
 CREATE TABLE portal_password_reset_tokens (id varchar PRIMARY KEY DEFAULT gen_random_uuid(), account_type text NOT NULL, account_id varchar NOT NULL, token_hash text NOT NULL UNIQUE, expires_at timestamp NOT NULL, used_at timestamp, created_at timestamp DEFAULT now());
 CREATE TABLE partners (id varchar PRIMARY KEY, status text);
 CREATE TABLE salespeople (id varchar PRIMARY KEY, is_active boolean);
 CREATE TABLE user_sessions (sid text PRIMARY KEY, sess jsonb);
 INSERT INTO partners VALUES ('fixture-partner','active');
 INSERT INTO salespeople VALUES ('fixture-sales',true);`);
const db = drizzle(pg);
const password = crypto.randomBytes(16).toString('hex');
const legacyPassword = crypto.randomBytes(3).toString('hex');
const account: any = { id: 'test-user', email: 'fixture@example.test', password: await bcrypt.hash(legacyPassword, 10), emailVerifiedAt: new Date() };
let updates = 0;
let portalUpdates = 0;
let deliveredToken = '';
const state: any = {
 db,
 storage: {
  getUserByEmail: async (email: string) => email === account.email ? account : undefined,
  getUserForSession: async (id: string) => id === account.id ? account : undefined,
  updateUser: async (_id: string, patch: any) => { updates++; Object.assign(account, patch); return account; },
  updatePartner: async (id: string, patch: any) => { portalUpdates++; return {id}; },
  updateSalesperson: async (id: string, patch: any) => { portalUpdates++; return {id}; },
  generateUniqueLoginCode: async () => '654321',
  getPartnerByEmail: async () => undefined,
  generateUniqueRefCode: async () => 'FIXTURE',
  getAdminPasswordHash: async () => (await pg.query<any>('SELECT password_hash FROM admin_settings')).rows[0]?.password_hash,
 },
 sendPasswordResetEmail: async (_email: string, token: string) => { deliveredToken = token; return true; },
 strategy: undefined,
};
(globalThis as any).__authFix = state;
const limit = 'async () => ({ allowed: true })';
const mocks: Record<string, string> = {
 './storage': 'export const storage = globalThis.__authFix.storage;',
 '../drizzle/db': 'export const db = globalThis.__authFix.db;',
 './email': 'export const sendPasswordResetEmail = globalThis.__authFix.sendPasswordResetEmail; export const sendPartnerPortalPasswordResetEmail=async()=>true, sendSalesPortalPasswordResetEmail=async()=>true, sendPartnerWelcomeEmail=async()=>false;',
 './authSecurity': `
 export const AUTH_RATE_LIMIT_MESSAGE='Rate limited', LOGIN_RATE_LIMIT_MESSAGE='Rate limited';
 export const checkForgotPasswordEmailLimit=${limit}, checkForgotPasswordIpLimit=${limit}, checkSignupEmailLimit=${limit}, checkSignupIpLimit=${limit}, checkVerificationResendCooldown=${limit}, checkVerificationResendLimit=${limit}, evaluateLoginRateLimit=${limit};
 export const isEmailVerified = u => u.emailVerifiedAt !== null;
 export const getAuthClientIp=()=> 'test-ip', getAuthUserAgent=()=> 'test-agent', getRequestId=()=> 'test-id';
 export const logAuthSecurityEvent=async()=>{}, softAuthDelay=async()=>{}, clearLoginFailures=async()=>{}, recordLoginFailure=async()=>{};`,
 './authTurnstile': `export const TURNSTILE_GENERIC_ERROR='Verification failed'; export const isTurnstileRequired=()=>false, warnIfTurnstileMisconfigured=()=>{}, verifyTurnstileToken=async()=>({ok:true});`,
 './emailVerification': 'export const consumeEmailVerificationToken=async()=>({ok:false}), issueEmailVerification=async()=>{}, resendVerificationForEmail=async()=>{};',
 './ghlOAuthHandoff': 'export const claimGhlOAuthHandoffIfPresent=async()=>{};',
 '@shared/userClientDto': 'export const toClientUser=u=>({id:u.id,email:u.email});',
 'passport': 'export default {use(s){globalThis.__authFix.strategy=s.verify}, serializeUser(){},deserializeUser(){}, initialize(){return ()=>{}},session(){return ()=>{}}};',
 'passport-local': 'export class Strategy {constructor(_options, verify){this.verify=verify}}',
 'express-session': 'export default ()=>()=>{};',
 'connect-pg-simple': 'export default ()=>class {};',
};
await mkdir('work/auth-tests', {recursive:true});
async function load(entry: string) {
 const outfile = `work/auth-tests/${entry.split('/').pop()}.mjs`;
 await build({ entryPoints:[entry], outfile, bundle:true, platform:'node', format:'esm', packages:'external', logLevel:'silent', plugins:[{name:'isolated-dependencies',setup(b){
  b.onResolve({filter:/.*/}, args => mocks[args.path] ? {path:args.path,namespace:'fixture'} : undefined);
  b.onLoad({filter:/.*/,namespace:'fixture'}, args=>({contents:mocks[args.path],loader:'js'}));
 }}]});
 return import(pathToFileURL(`${process.cwd()}/${outfile}`).href);
}
const auth = await load('server/auth.ts');
const tokens = await load('server/passwordResetTokens.ts');
const bootstrap = await load('server/salesAdminBootstrap.ts');
const admin = await load('server/salesAdminLogin.ts');
const portal = await load('server/portalPasswordReset.ts');
const portalRoutes = await load('server/routes/portalPasswordResetRoutes.ts');
const routes = new Map<string, any>();
const register = (method: string, path: string, handlers: any[]) => routes.set(`${method} ${path}`, (req: any, res: any) => { let i=0; const next=()=>handlers[i++]?.(req,res,next); return next(); });
const app: any = { post(path: string, ...handlers: any[]){register('POST',path,handlers)},patch(path: string, ...handlers: any[]){register('PATCH',path,handlers)},get(path: string,...handlers:any[]){routes.set(`GET ${path}`,handlers.at(-1))},set(){},use(){} };
auth.setupAuth(app);
auth.registerAuthRoutes(app);
admin.registerSalesAdminLoginRoute(app);
portalRoutes.registerPortalPasswordResetRoutes(app, (_req: any, res: any) => res.status(401).json({error:'Unauthorized'}));
async function call(path: string, body: any, method='POST', authorized=false) {
 const req: any = {body,params:{id:'fixture-partner'},headers:{},session:{isAdmin:authorized,save(cb:any){cb()}},isAuthenticated:()=>false,login(_u:any,cb:any){cb()},logout(cb:any){cb()}};
 let status = 200;
 let output: any;
 const done = new Promise<void>(resolve=> {
  const res: any = {status(n:number){status=n;return res},json(data:any){output=data;resolve();return res},send(data:any){output=data;resolve();return res},set(){return res}};
  Promise.resolve(routes.get(`${method} ${path}`)(req,res)).catch(()=>resolve());
 });
 await done;
 return {status,output,req};
}
// Retired routes fail uniformly even with the former allowlist and debug secret.
const authSource = await readFile('server/auth.ts','utf8');
const formerAllowlist = ['allowlisted-owner@example.test', 'allowlisted-admin@example.test'];
assert.ok(!authSource.includes('allowedEmails'));
process.env.EMERGENCY_AUTH_RESET_SECRET = crypto.randomBytes(24).toString('hex');
for (const email of [...formerAllowlist,account.email,'absent@example.test']) {
 for (const body of [{email,newPassword:password}, {email,newPassword:password,secret:process.env.EMERGENCY_AUTH_RESET_SECRET}, {}, null, {email:{},newPassword:[]}]) {
  for (const path of ['/api/auth/emergency-reset','/api/auth/reset-debug']) assert.equal((await call(path,body)).status,404);
 }
}
assert.equal((await call('/reset-emergency',null,'GET')).status,404);
assert.equal(updates,0);
// Existing short bcrypt credentials and legacy plaintext login remain compatible.
async function login(value: string) {
 return new Promise<boolean>(resolve=>state.strategy({headers:{}},account.email,value,(_err:any,user:any)=>resolve(Boolean(user))));
}
assert.ok(await login(legacyPassword));
assert.equal(await login(password),false);
account.password = legacyPassword;
assert.ok(await login(legacyPassword));
assert.ok(await bcrypt.compare(legacyPassword,account.password));
// Signup and reset malformed/weak passwords reject before account writes or token claims.
for (const value of [legacyPassword,{},[],42,'a'.repeat(73),'😀'.repeat(19)]) {
 assert.ok(validateNewPassword(value));
 assert.equal((await call('/api/auth/signup',{name:'Fixture',email:account.email,password:value})).status,400);
 assert.equal((await call('/api/auth/reset-password',{token:'malformed',password:value})).status,400);
}
assert.equal(validateNewPassword(password),null);
assert.equal(validateNewPassword('😀'.repeat(15)),null);
assert.equal(validateNewPassword('a'.repeat(72)),null);
// Generic forgot response and real token issuance (delivery stub only).
const known = await call('/api/auth/forgot-password',{email:account.email});
const absent = await call('/api/auth/forgot-password',{email:'absent@example.test'});
assert.deepEqual(known.output,absent.output);
assert.ok(deliveredToken);
assert.equal((await call('/api/auth/reset-password',{token:deliveredToken,password:legacyPassword})).status,400);
assert.equal((await call('/api/auth/reset-password',{token:deliveredToken,password})).status,200);
assert.equal((await call('/api/auth/reset-password',{token:deliveredToken,password})).status,400);
assert.ok(await login(password));
for (const token of [null,{},[],42,'invalid-token-value']) {
 assert.equal((await call('/api/auth/reset-password',{token,password})).status,400);
}
const expired = crypto.randomBytes(32).toString('hex');
await db.insert(passwordResetTokens).values({userId:account.id,tokenHash:crypto.createHash('sha256').update(expired).digest('hex'),expiresAt:new Date(Date.now()-1000)});
assert.equal((await call('/api/auth/reset-password',{token:expired,password})).status,400);
await tokens.issuePasswordResetForEmail(account.email);
const before = updates;
const simultaneous = await Promise.all([call('/api/auth/reset-password',{token:deliveredToken,password}),call('/api/auth/reset-password',{token:deliveredToken,password})]);
assert.deepEqual(simultaneous.map(r=>r.status).sort(),[200,400]);
assert.equal(updates-before,1);
// Exercise actual portal SQL and reset HTTP handlers for both account types.
for (const accountType of ['partner','salesperson'] as const) {
 const accountId = accountType === 'partner' ? 'fixture-partner' : 'fixture-sales';
 const path = accountType === 'partner' ? '/api/partner-portal/reset-password' : '/api/sales-portal/reset-password';
 async function issue(expired=false) {
  const raw = crypto.randomBytes(32).toString('hex');
  await db.insert(portalPasswordResetTokens).values({accountType,accountId,tokenHash:crypto.createHash('sha256').update(raw).digest('hex'),expiresAt:new Date(Date.now()+(expired?-1000:60000))});
  return raw;
 }
 const raw = await issue();
 const count = portalUpdates;
 for (const value of [legacyPassword,{},[],42,'a'.repeat(73)]) {
  assert.equal((await call(path,{token:raw,password:value})).status,400);
 }
 assert.equal(portalUpdates,count);
 assert.equal((await call(path,{token:await issue(true),password})).status,400);
 assert.equal((await call(path,{token:raw,password})).status,200);
 assert.equal((await call(path,{token:raw,password})).status,400);
 const concurrent = await issue();
 const beforePortal = portalUpdates;
 const results = await Promise.all([call(path,{token:concurrent,password}),call(path,{token:concurrent,password})]);
 assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
 assert.equal(portalUpdates-beforePortal,1);
 const other = accountType === 'partner' ? 'salesperson' : 'partner';
 assert.equal((await portal.completePortalPasswordReset({accountType:other,rawToken:await issue(),newPassword:password})).ok,false);
}
// No public bootstrap. Operator bootstrap is insert-only, including concurrent calls.
for (const body of [{password}, {}, null, {password:[]}, {password:legacyPassword}]) {
 const result = await call('/api/admin/login',body);
 assert.equal(result.status,401);
 assert.notEqual(result.req.session.isAdmin,true);
}
assert.equal((await db.select().from(adminSettings)).length,0);
assert.equal(await bootstrap.initializeSalesAdmin(password),true);
const stored = (await db.select().from(adminSettings))[0].passwordHash;
assert.equal(await bootstrap.initializeSalesAdmin(crypto.randomBytes(16).toString('hex')),false);
assert.ok((await db.select().from(adminSettings))[0].passwordHash === stored);
assert.equal((await call('/api/admin/login',{password})).status,200);
assert.equal((await call('/api/admin/login',{password:legacyPassword})).status,401);
await pg.exec('DELETE FROM admin_settings');
assert.deepEqual((await Promise.all([bootstrap.initializeSalesAdmin(password),bootstrap.initializeSalesAdmin(password)])).sort(),[false,true]);
// Source contracts for remaining password mutation routes and retired fixed-password provisioning.
const routesSource = await readFile('server/routes.ts','utf8');
assert.ok(routesSource.includes('registerSalesAdminLoginRoute(app)'));
assert.ok(!routesSource.includes('DEMO_PARTNER_PASSWORD'));
assert.ok(!authSource.includes('EMERGENCY_AUTH_RESET_SECRET'));
assert.ok(!(await readFile('server/index.ts','utf8')).includes('WhachatSSO2026'));
assert.match(routesSource,/if \(password !== undefined\) \{\s*const passwordError = validateNewPassword\(password\)/);
// Execute the unchanged route-registration blocks with real Sales Admin middleware.
const start = routesSource.indexOf('  app.post("/api/admin/partners",');
const end = routesSource.indexOf('  // Admin: Delete partner',start);
await writeFile('work/auth-tests/partner-mutations.ts', `
 import bcrypt from 'bcryptjs';
 import { storage } from './storage';
 import { validateNewPassword } from '../../server/passwordPolicy';
 import { requireAdmin } from '../../server/adminAuth';
 export function register(app: any) { ${routesSource.slice(start,end)} }
`);
(await load('work/auth-tests/partner-mutations.ts')).register(app);
for (const method of ['POST','PATCH']) {
 const path = method === 'POST' ? '/api/admin/partners' : '/api/admin/partners/:id';
 assert.equal((await call(path,{name:'Fixture',email:'fixture@example.test',password},method)).status,401);
 for (const value of [legacyPassword,{},[],42,null,'a'.repeat(73)]) {
  assert.equal((await call(path,{name:'Fixture',email:'fixture@example.test',password:value},method,true)).status,400);
 }
}
assert.equal((await call('/api/admin/partners/:id',{password},'PATCH',true)).status,200);
await pg.close();
console.log('auth-security-fix.test.ts: all assertions passed');
