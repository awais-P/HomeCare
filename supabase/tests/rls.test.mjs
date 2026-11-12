import { PGlite } from '@electric-sql/pglite';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Checks the database setup on an in-memory Postgres (PGlite) with a minimal stand-in for
// Supabase's auth schema. Two scenarios:
//   A. every file in supabase/migrations, in order (what the Supabase CLI would apply)
//   B. supabase/SETUP_RUN_IN_SQL_EDITOR.sql, run TWICE, with a user who signed up beforehand
//      (what a teammate pastes into the dashboard)
// Run: npm run db:test
const supabaseDir = join(import.meta.dirname, '..');
const migrationsDir = join(supabaseDir, 'migrations');
const setupScript = readFileSync(join(supabaseDir, 'SETUP_RUN_IN_SQL_EDITOR.sql'), 'utf8');

let pass = 0;
let fail = 0;
const ok = (c, m) => {
  if (c) pass++;
  else fail++;
  console.log(c ? 'PASS' : 'FAIL', m);
};

async function freshDb() {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    grant usage on schema auth to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    create table auth.users (id uuid primary key default gen_random_uuid(), phone text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  `);
  return db;
}

async function checkRules(db) {
  const expectErr = async (sql, m) => {
    try {
      await db.exec(sql);
      ok(false, m + ' (no error)');
    } catch (e) {
      ok(true, m + ' -> ' + e.message.split('\n')[0]);
    }
  };
  const asUser = async (id, fn) => {
    await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${id}', false);`);
    try {
      return await fn();
    } finally {
      await db.exec(`reset role; select set_config('request.jwt.claim.sub', '', false);`);
    }
  };

  const u1 = (await db.query(`insert into auth.users (phone) values ('923001234567') returning id`)).rows[0].id;
  const u2 = (await db.query(`insert into auth.users (phone) values ('923339876543') returning id`)).rows[0].id;
  const p = (await db.query(`select * from profiles where id in ($1, $2) order by phone`, [u1, u2])).rows;
  ok(p.length === 2, 'trigger creates a profile per signup');
  ok(p[0].phone === '+923001234567', 'phone stored as E.164 with +');
  ok(p[0].language === 'en' && p[0].full_name === null, 'defaults: language en, name empty');

  await asUser(u1, async () => {
    const r = await db.query(`select id from profiles`);
    ok(r.rows.length === 1 && r.rows[0].id === u1, 'user sees only own profile');
    const up = await db.query(`update profiles set full_name = 'Ali Khan', language = 'ur' where id = $1`, [u1]);
    ok(up.affectedRows === 1, 'user can update own name/language');
    const other = await db.query(`update profiles set full_name = 'Hacked' where id = $1`, [u2]);
    ok(other.affectedRows === 0, 'user cannot update someone else');
    await expectErr(`update profiles set phone = '+920000000000' where id = '${u1}'`, 'user cannot change phone column');
    await expectErr(`insert into profiles (id) values (gen_random_uuid())`, 'user cannot insert profiles');
    await expectErr(`delete from profiles where id = '${u1}'`, 'user cannot delete profiles');
    await expectErr(`update profiles set full_name = 'A' where id = '${u1}'`, 'name shorter than 2 chars rejected');
    await expectErr(`update profiles set email = 'not-an-email' where id = '${u1}'`, 'bad email rejected');
    const e = await db.query(`update profiles set email = 'ali@example.com' where id = $1`, [u1]);
    ok(e.affectedRows === 1, 'valid email accepted');
  });
  await db.exec(`set role anon;`);
  await expectErr(`select * from profiles`, 'anon cannot read profiles');
  await db.exec(`reset role;`);

  const after = (
    await db.query(`select full_name, language, updated_at > created_at as bumped from profiles where id = $1`, [u1])
  ).rows[0];
  ok(after.full_name === 'Ali Khan' && after.language === 'ur', 'update persisted');
  ok(after.bumped === true, 'updated_at bumped on update');
  ok((await db.query(`select full_name from profiles where id = $1`, [u2])).rows[0].full_name === null, 'other user untouched');
  await db.exec(`update auth.users set phone = '923211112222' where id = '${u1}'`);
  ok((await db.query(`select phone from profiles where id = $1`, [u1])).rows[0].phone === '+923211112222', 'phone change synced');
  await db.exec(`delete from auth.users where id = '${u2}'`);
  ok((await db.query(`select count(*)::int as n from profiles where id = $1`, [u2])).rows[0].n === 0, 'profile deleted with auth user');
}

// --- A. migrations -----------------------------------------------------------------------
console.log('\n== A. supabase/migrations');
{
  const db = await freshDb();
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
  }
  await checkRules(db);
}

// --- B. SQL editor script, run twice -----------------------------------------------------
console.log('\n== B. SETUP_RUN_IN_SQL_EDITOR.sql (run twice, with an earlier signup)');
{
  const db = await freshDb();
  const early = (await db.query(`insert into auth.users (phone) values ('923450000000') returning id`)).rows[0].id;

  for (const run of [1, 2]) {
    const results = await db.exec(setupScript);
    const report = results.at(-1).rows[0];
    const allTrue = Object.values(report).every((v) => v === true);
    ok(allTrue, `run ${run}: final check row is all true ${JSON.stringify(report)}`);
  }
  const earlyProfile = (await db.query(`select phone from profiles where id = $1`, [early])).rows[0];
  ok(earlyProfile?.phone === '+923450000000', 'user who signed up before setup got a profile');
  await checkRules(db);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
