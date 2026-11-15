import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Checks the database setup on an in-memory Postgres (PGlite + PostGIS) with a minimal stand-in
// for Supabase's auth schema. Two scenarios:
//   A. every file in supabase/migrations, in order (what the Supabase CLI would apply)
//   B. the dashboard scripts SETUP_01..03, each run TWICE, with a user who signed up
//      beforehand (what a teammate pastes into the SQL Editor)
// Run: npm run db:test
const supabaseDir = join(import.meta.dirname, '..');
const migrationsDir = join(supabaseDir, 'migrations');
const editorScripts = ['SETUP_01_PROFILES.sql', 'SETUP_02_ADDRESSES_AND_ZONES.sql', 'SETUP_03_PARTNERS.sql'].map((f) =>
  readFileSync(join(supabaseDir, f), 'utf8'),
);

// Points used below
const G10 = { lat: 33.676, lng: 73.015 }; // inside "G-9 / G-10 / G-11"
const I8 = { lat: 33.668, lng: 73.076 }; // inside "I-8"
const LAHORE = { lat: 31.5204, lng: 74.3587 }; // outside every zone

let pass = 0;
let fail = 0;
const ok = (c, m) => {
  if (c) pass++;
  else fail++;
  console.log(c ? 'PASS' : 'FAIL', m);
};

async function freshDb() {
  const db = new PGlite({ extensions: { postgis } });
  await db.exec(`
    create role anon nologin; create role authenticated nologin;
    create schema auth;
    grant usage on schema auth to anon, authenticated;
    grant usage on schema public to anon, authenticated;
    create schema extensions;
    grant usage on schema extensions to anon, authenticated;
    alter default privileges in schema public grant all on tables to anon, authenticated;
    create table auth.users (id uuid primary key default gen_random_uuid(), phone text);
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    -- Minimal stand-in for Supabase Storage
    create schema storage;
    grant usage on schema storage to anon, authenticated;
    create table storage.buckets (id text primary key, name text not null, public boolean default false,
      file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text references storage.buckets (id),
      name text not null, owner uuid default auth.uid(), created_at timestamptz default now(), unique (bucket_id, name));
    create function storage.foldername(name text) returns text[] language sql immutable as $$
      select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
    alter table storage.objects enable row level security;
    grant select, insert, update, delete on storage.objects to authenticated;
    grant select on storage.buckets to authenticated;
  `);
  return db;
}

function helpers(db) {
  const expectErr = async (sql, m, params) => {
    try {
      await db.query(sql, params);
      ok(false, m + ' (no error)');
      return null;
    } catch (e) {
      const msg = e.message.split('\n')[0];
      ok(true, m + ' -> ' + msg);
      return msg;
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
  const newUser = async (phone) =>
    (await db.query(`insert into auth.users (phone) values ($1) returning id`, [phone])).rows[0].id;
  return { expectErr, asUser, newUser };
}

// ----------------------------------------------------------------------- M1: profiles
async function checkProfiles(db) {
  const { expectErr, asUser, newUser } = helpers(db);
  const u1 = await newUser('923001234567');
  const u2 = await newUser('923339876543');
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
    await expectErr(`update profiles set phone = '+920000000000' where id = $1`, 'user cannot change phone column', [u1]);
    await expectErr(`insert into profiles (id) values (gen_random_uuid())`, 'user cannot insert profiles');
    await expectErr(`delete from profiles where id = $1`, 'user cannot delete profiles', [u1]);
    await expectErr(`update profiles set full_name = 'A' where id = $1`, 'name shorter than 2 chars rejected', [u1]);
    await expectErr(`update profiles set email = 'not-an-email' where id = $1`, 'bad email rejected', [u1]);
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

// ----------------------------------------------------------------------- M2: zones + addresses
async function checkAddressesAndZones(db) {
  const { expectErr, asUser, newUser } = helpers(db);
  const alice = await newUser('923010000001');
  const bob = await newUser('923010000002');

  const zoneCount = (await db.query(`select count(*)::int n from service_zones where is_active`)).rows[0].n;
  ok(zoneCount === 6, `6 pilot zones seeded (got ${zoneCount})`);

  const insertAddress = (p, extra = '') =>
    db.query(
      `insert into addresses (latitude, longitude, formatted_address${extra ? ', ' + extra.split('=')[0] : ''})
       values ($1, $2, 'Street 1, G-10/2, Islamabad'${extra ? ', ' + extra.split('=')[1] : ''}) returning *`,
      [p.lat, p.lng],
    );

  await asUser(alice, async () => {
    const inside = (await db.query(`select check_service_area($1, $2) r`, [G10.lat, G10.lng])).rows[0].r;
    ok(inside.inside === true && inside.zone_name === 'G-9 / G-10 / G-11', 'check_service_area: G-10 is inside its own zone (' + inside.zone_name + ')');
    const outside = (await db.query(`select check_service_area($1, $2) r`, [LAHORE.lat, LAHORE.lng])).rows[0].r;
    ok(outside.inside === false, 'check_service_area: Lahore is outside');
    const geo = (await db.query(`select service_zones_geojson() g`)).rows[0].g;
    ok(geo.type === 'FeatureCollection' && geo.features.length === 6 && geo.features[0].geometry.type === 'MultiPolygon',
      'service_zones_geojson returns 6 MultiPolygon features');

    const a1 = (await insertAddress(G10)).rows[0];
    ok(a1.is_default === true && a1.zone_id !== null && a1.user_id === alice, 'first address: default, zone set, owned');
    const a2 = (await insertAddress(I8)).rows[0];
    ok(a2.is_default === false, 'second address is not default');
    await db.query(`update addresses set is_default = true where id = $1`, [a2.id]);
    const defaults = (await db.query(`select id from addresses where is_default`)).rows;
    ok(defaults.length === 1 && defaults[0].id === a2.id, 'making one default clears the other');

    const msg = await expectErr(
      `insert into addresses (latitude, longitude, formatted_address) values ($1, $2, 'Mall Road, Lahore')`,
      'address outside every zone rejected', [LAHORE.lat, LAHORE.lng]);
    ok(msg?.includes('outside_service_area'), 'error code is outside_service_area');
    await expectErr(`update addresses set latitude = $1, longitude = $2 where id = $3`,
      'moving an address outside the zone rejected', [LAHORE.lat, LAHORE.lng, a1.id]);

    await expectErr(`insert into addresses (latitude, longitude, formatted_address, recipient_phone) values ($1, $2, 'x y z', '0300123')`,
      'bad recipient phone rejected', [G10.lat, G10.lng]);
    const forParents = (await db.query(
      `insert into addresses (label, latitude, longitude, formatted_address, recipient_name, recipient_phone)
       values ('parents', $1, $2, 'House 5, G-10/2', 'Ammi', '+923331112222') returning label, recipient_name`,
      [G10.lat, G10.lng])).rows[0];
    ok(forParents.label === 'parents' && forParents.recipient_name === 'Ammi', 'address for someone else saved');

    await expectErr(`update addresses set zone_id = null where id = $1`, 'user cannot set zone_id', [a1.id]);
    await expectErr(`insert into addresses (user_id, latitude, longitude, formatted_address) values ($1, $2, $3, 'x y z')`,
      'user cannot save an address for another user', [bob, G10.lat, G10.lng]);

    await db.query(`delete from addresses where id = $1`, [a2.id]);
    const newDefault = (await db.query(`select count(*)::int n from addresses where is_default`)).rows[0].n;
    ok(newDefault === 1, 'deleting the default promotes another address');

    const w = await db.query(`insert into waitlist_requests (latitude, longitude, formatted_address) values ($1, $2, 'Lahore') returning user_id`,
      [LAHORE.lat, LAHORE.lng]);
    ok(w.rows[0].user_id === alice, 'waitlist request saved for the user');
  });

  await asUser(bob, async () => {
    ok((await db.query(`select * from addresses`)).rows.length === 0, "bob cannot see alice's addresses");
    const upd = await db.query(`update addresses set house = 'hacked'`);
    ok(upd.affectedRows === 0, "bob cannot update alice's addresses");
    const del = await db.query(`delete from addresses`);
    ok(del.affectedRows === 0, "bob cannot delete alice's addresses");
    ok((await db.query(`select * from waitlist_requests`)).rows.length === 0, "bob cannot see alice's waitlist requests");
    await expectErr(`insert into service_zones (slug, name, city, area) select 'x', 'x', 'islamabad', area from service_zones limit 1`,
      'users cannot create zones');
    for (let i = 0; i < 20; i++) await insertAddress(G10);
    await expectErr(`insert into addresses (latitude, longitude, formatted_address) values ($1, $2, 'one too many')`,
      'more than 20 addresses rejected', [G10.lat, G10.lng]);
  });

  await db.exec(`set role anon;`);
  await expectErr(`select check_service_area(33.676, 73.015)`, 'anon cannot call check_service_area');
  await expectErr(`select * from addresses`, 'anon cannot read addresses');
  await db.exec(`reset role;`);
}

// ----------------------------------------------------------------------- M3: partners + admins
async function checkPartners(db) {
  const { expectErr, asUser, newUser } = helpers(db);
  const rider = await newUser('923020000001');
  const ustaad = await newUser('923020000002');
  const admin = await newUser('923020000003');
  const stranger = await newUser('923020000004');
  await db.query(`insert into admins (user_id) values ($1)`, [admin]);

  const upload = (uid, file) =>
    db.query(`insert into storage.objects (bucket_id, name) values ('partner-documents', $1)`, [`${uid}/${file}`]);

  await asUser(rider, async () => {
    ok((await db.query(`select is_admin() a`)).rows[0].a === false, 'partner is not an admin');
    const p = (await db.query(`insert into partners (role) values ('rider') returning *`)).rows[0];
    ok(p.id === rider && p.status === 'draft' && p.is_online === false, 'rider creates own draft application');
    await expectErr(`update partners set status = 'approved' where id = $1`, 'partner cannot change own status', [rider]);
    await expectErr(`update partners set is_online = true where id = $1`, 'partner cannot set online directly', [rider]);
    await expectErr(`insert into partners (id, role) values ($1, 'rider')`, 'cannot create an application for someone else', [stranger]);
    await expectErr(`update partners set cnic_number = '12345' where id = $1`, 'bad CNIC format rejected', [rider]);
    await expectErr(`update partners set payout_account = '12345' where id = $1`, 'bad payout number rejected', [rider]);

    const msg = await expectErr(`select submit_partner_application()`, 'incomplete application cannot be submitted');
    ok(msg?.includes('application_incomplete'), 'error is application_incomplete');

    await db.query(
      `update partners set cnic_number = '61101-1234567-1', vehicle_type = 'motorcycle', vehicle_number = 'RIK-1234',
              payout_method = 'jazzcash', payout_account = '03001234567' where id = $1`, [rider]);
    await db.query(`update profiles set full_name = 'Rider One' where id = $1`, [rider]);
    await upload(rider, 'cnic_front.jpg');
    await upload(rider, 'cnic_back.jpg');
    await expectErr(`insert into storage.objects (bucket_id, name) values ('partner-documents', $1)`,
      "cannot upload into another partner's folder", [`${stranger}/selfie.jpg`]);
    await expectErr(`insert into storage.objects (bucket_id, name) values ('partner-documents', $1)`,
      'only cnic_front / cnic_back / selfie files allowed', [`${rider}/random.pdf`]);
    const stillMissing = await expectErr(`select submit_partner_application()`, 'submit without selfie rejected');
    ok(stillMissing !== null, 'missing selfie blocks submission');
    await upload(rider, 'selfie.jpg');
    const submitted = (await db.query(`select (submit_partner_application()).status s`)).rows[0].s;
    ok(submitted === 'pending', 'complete application submitted -> pending');

    const edit = await db.query(`update partners set vehicle_number = 'XYZ-1' where id = $1`, [rider]);
    ok(edit.affectedRows === 0, 'pending application is locked for editing');
    await expectErr(`insert into storage.objects (bucket_id, name) values ('partner-documents', $1)`,
      'documents locked while pending', [`${rider}/cnic_front.png`]);
    await expectErr(`select set_partner_online(true, 33.676, 73.015)`, 'pending partner cannot go online');
    await expectErr(`select review_partner($1, 'approved')`, 'partner cannot approve themselves', [rider]);
  });

  await asUser(ustaad, async () => {
    await db.query(`insert into partners (role, cnic_number, payout_method, payout_account)
                    values ('ustaad', '61101-7654321-2', 'easypaisa', '03331234567')`);
    await db.query(`update profiles set full_name = 'Ustaad Two' where id = $1`, [ustaad]);
    for (const f of ['cnic_front.jpg', 'cnic_back.jpg', 'selfie.jpg']) await upload(ustaad, f);
    const noTrades = await expectErr(`select submit_partner_application()`, 'ustaad without trades rejected');
    ok(noTrades?.includes('application_incomplete'), 'missing trades reported');
    await db.query(`update partners set trades = '{plumber,electrician}' where id = $1`, [ustaad]);
    ok((await db.query(`select (submit_partner_application()).status s`)).rows[0].s === 'pending', 'ustaad with trades submitted');
    ok((await db.query(`select * from partners`)).rows.length === 1, 'partner sees only own application');
    ok((await db.query(`select * from storage.objects`)).rows.every((o) => o.name.startsWith(ustaad)), 'partner sees only own documents');
  });

  await asUser(stranger, async () => {
    ok((await db.query(`select * from partners`)).rows.length === 0, 'customer cannot see partners');
    ok((await db.query(`select * from storage.objects where bucket_id = 'partner-documents'`)).rows.length === 0,
      'customer cannot see partner documents');
  });

  await asUser(admin, async () => {
    ok((await db.query(`select is_admin() a`)).rows[0].a === true, 'admin is recognised');
    const all = (await db.query(`select p.id, pr.full_name from partners p join profiles pr on pr.id = p.id order by pr.full_name`)).rows;
    ok(all.length === 2 && all[0].full_name === 'Rider One', 'admin sees all partners with names');
    ok((await db.query(`select * from storage.objects where bucket_id = 'partner-documents'`)).rows.length === 6,
      'admin can read all partner documents');
    const noReason = await expectErr(`select review_partner($1, 'rejected')`, 'reject without a reason refused', [ustaad]);
    ok(noReason?.includes('reason_required'), 'error is reason_required');
    const rejected = (await db.query(`select (review_partner($1, 'rejected', 'CNIC photo is blurry')).status s`, [ustaad])).rows[0].s;
    ok(rejected === 'rejected', 'admin rejects with a reason');
    ok((await db.query(`select (review_partner($1, 'approved')).status s`, [rider])).rows[0].s === 'approved', 'admin approves rider');
    await expectErr(`select review_partner($1, 'approved')`, 'cannot approve a rejected application directly', [ustaad]);
    await expectErr(`update partners set status = 'approved' where id = $1`, 'admin also changes status only through review_partner', [ustaad]);
  });

  await asUser(ustaad, async () => {
    const reason = (await db.query(`select status, status_reason from partners where id = $1`, [ustaad])).rows[0];
    ok(reason.status === 'rejected' && reason.status_reason === 'CNIC photo is blurry', 'ustaad sees rejection reason');
    const fix = await db.query(`update partners set trades = '{plumber}' where id = $1`, [ustaad]);
    ok(fix.affectedRows === 1, 'rejected application can be edited again');
    await upload(ustaad, 'cnic_front.png');
    ok((await db.query(`select (submit_partner_application()).status s`)).rows[0].s === 'pending', 'resubmitted after rejection');
  });

  await asUser(rider, async () => {
    await expectErr(`select set_partner_online(true)`, 'going online needs a location');
    const online = (await db.query(`select * from set_partner_online(true, 33.676, 73.015)`)).rows[0];
    ok(online.is_online === true && online.last_latitude === 33.676 && online.last_location !== null, 'approved rider goes online with location');
    await db.query(`select update_partner_location(33.680, 73.020)`);
    ok((await db.query(`select last_latitude from partners where id = $1`, [rider])).rows[0].last_latitude === 33.68, 'location heartbeat saved');
    await db.query(`select set_partner_online(false)`);
    const hb = await expectErr(`select update_partner_location(33.681, 73.021)`, 'heartbeat after going offline refused');
    ok(hb?.includes('partner_offline'), 'error is partner_offline');
    await db.query(`select set_partner_online(true, 33.676, 73.015)`);
  });

  await asUser(admin, async () => {
    const s = (await db.query(`select * from review_partner($1, 'suspended', 'Customer complaint')`, [rider])).rows[0];
    ok(s.status === 'suspended' && s.is_online === false, 'suspending a partner takes them offline');
  });
  await asUser(rider, async () => {
    await expectErr(`select set_partner_online(true, 33.676, 73.015)`, 'suspended partner cannot go online');
  });

  await db.exec(`set role anon;`);
  await expectErr(`select * from partners`, 'anon cannot read partners');
  await expectErr(`select submit_partner_application()`, 'anon cannot submit applications');
  await db.exec(`reset role;`);
}

// --- A. migrations -----------------------------------------------------------------------
console.log('\n== A. supabase/migrations');
{
  const db = await freshDb();
  for (const file of readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort()) {
    await db.exec(readFileSync(join(migrationsDir, file), 'utf8'));
  }
  await checkProfiles(db);
  await checkAddressesAndZones(db);
  await checkPartners(db);
}

// --- B. SQL editor scripts, each run twice ------------------------------------------------
console.log('\n== B. SETUP_01..03 (each run twice, with an earlier signup)');
{
  const db = await freshDb();
  const early = (await db.query(`insert into auth.users (phone) values ('923450000000') returning id`)).rows[0].id;

  for (const [i, script] of editorScripts.entries()) {
    for (const run of [1, 2]) {
      const results = await db.exec(script);
      const report = results.at(-1).rows[0];
      const allTrue = Object.values(report).every((v) => v === true);
      ok(allTrue, `SETUP_0${i + 1} run ${run}: final check row is all true ${JSON.stringify(report)}`);
    }
  }
  const earlyProfile = (await db.query(`select phone from profiles where id = $1`, [early])).rows[0];
  ok(earlyProfile?.phone === '+923450000000', 'user who signed up before setup got a profile');
  await checkProfiles(db);
  await checkAddressesAndZones(db);
  await checkPartners(db);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
