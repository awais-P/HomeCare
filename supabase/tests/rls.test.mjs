import { PGlite } from '@electric-sql/pglite';
import { postgis } from '@electric-sql/pglite-postgis';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// Checks the database setup on an in-memory Postgres (PGlite + PostGIS) with a minimal stand-in
// for Supabase's auth schema. Two scenarios:
//   A. every file in supabase/migrations, in order (what the Supabase CLI would apply)
//   B. the dashboard scripts SETUP_01..06, each run TWICE, with a user who signed up
//      beforehand (what a teammate pastes into the SQL Editor)
// Run: npm run db:test
const supabaseDir = join(import.meta.dirname, '..');
const migrationsDir = join(supabaseDir, 'migrations');
const editorScripts = ['SETUP_01_PROFILES.sql', 'SETUP_02_ADDRESSES_AND_ZONES.sql', 'SETUP_03_PARTNERS.sql', 'SETUP_04_ORDERS_AND_ACCOUNT.sql', 'SETUP_05_SAUDA_LIVE.sql', 'SETUP_06_USTAAD.sql'].map((f) =>
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

// ----------------------------------------------------------------------- P4: settings, orders, account deletion
async function checkOrders(db) {
  const { expectErr, asUser, newUser } = helpers(db);
  const customer = await newUser('923030000001');
  const other = await newUser('923030000002');
  const rider = await newUser('923030000003');
  const rider2 = await newUser('923030000004');
  const admin = await newUser('923030000005');
  await db.query(`insert into admins (user_id) values ($1) on conflict do nothing`, [admin]);

  // Riders: approved and online near G-10 (set directly as the test superuser).
  for (const r of [rider, rider2]) {
    await db.query(`insert into partners (id, role, status, is_online, last_latitude, last_longitude, last_seen_at)
                    values ($1, 'rider', 'approved', true, 33.676, 73.015, now())`, [r]);
  }

  // Settings
  await asUser(customer, async () => {
    const bands = (await db.query(`select setting('delivery_fee_bands') v`)).rows[0].v;
    ok(Array.isArray(bands) && bands[0].fee === 150, 'provisional delivery fee bands seeded');
    const fees = (await db.query(`select delivery_fee_for_km(2) a, delivery_fee_for_km(5) b, delivery_fee_for_km(25) c`)).rows[0];
    ok(fees.a === 150 && fees.b === 250 && fees.c === 350, 'fee bands: 2 km=150, 5 km=250, 25 km=350');
    const upd = await db.query(`update app_settings set value = '1' where key = 'rider_cash_limit'`);
    ok(upd.affectedRows === 0, 'customers cannot change settings');
  });
  await asUser(admin, async () => {
    const upd = await db.query(`update app_settings set value = '5000' where key = 'rider_cash_limit'`);
    ok(upd.affectedRows === 1, 'admins can change settings');
  });

  // Customer places orders
  let order1, order2, order3, addressId;
  await asUser(customer, async () => {
    addressId = (await db.query(`insert into addresses (latitude, longitude, formatted_address, house)
      values (33.676, 73.015, 'Sawan Road, G-10, Islamabad', 'House 7') returning id`)).rows[0].id;
    const o = (await db.query(`select * from create_sauda_order($1, 'sabzi', '2 kg tamatar, 1 dozen anday', 'Ali Kiryana, G-10 Markaz')`, [addressId])).rows[0];
    order1 = o.id;
    ok(o.status === 'requested' && o.estimated_fee === 150 && /^HC-[0-9A-F]{6}$/.test(o.code), 'order placed: requested, Rs 150 estimate, HC- code');
    ok(o.delivery_text.includes('House 7') && o.zone_id !== null, 'delivery address copied onto the order');
    order2 = (await db.query(`select id from create_sauda_order($1, 'pharmacy', 'Panadol 1 strip')`, [addressId])).rows[0].id;
    order3 = (await db.query(`select id from create_sauda_order($1, 'bakery', 'Dawn bread')`, [addressId])).rows[0].id;
    await expectErr(`select create_sauda_order($1, 'grocery', 'too many')`, 'fourth active order refused', [addressId]);
    const ev = (await db.query(`select to_status from order_events where order_id = $1`, [order1])).rows;
    ok(ev.length === 1 && ev[0].to_status === 'requested', 'order creation logged');
    await expectErr(`insert into orders (category, items_text, delivery_text, delivery_latitude, delivery_longitude, estimated_fee)
                     values ('sabzi', 'x y', 'x', 33.6, 73.0, 1)`, 'customers cannot insert orders directly');
    await expectErr(`update orders set estimated_fee = 1 where id = $1`, 'customers cannot change prices', [order1]);
  });
  await asUser(other, async () => {
    const msg = await expectErr(`select create_sauda_order($1, 'sabzi', 'x y')`, "cannot order to someone else's address", [addressId]);
    ok(msg?.includes('address_not_found'), 'error is address_not_found');
    ok((await db.query(`select * from orders`)).rows.length === 0, "other customers cannot see the order");
  });

  // Rider takes and completes order 1
  await asUser(rider, async () => {
    ok((await db.query(`select * from orders`)).rows.length === 0, 'rider cannot read open orders directly');
    const open = (await db.query(`select * from list_open_orders(33.68, 73.02)`)).rows;
    ok(open.length === 3 && open[0].distance_km < 1 && !('delivery_text' in open[0]), 'online rider sees 3 nearby open orders, without addresses');
    const far = (await db.query(`select * from list_open_orders(31.52, 74.35)`)).rows;
    ok(far.length === 0, 'orders far away are not listed');
    ok((await db.query(`select status from accept_order($1)`, [order1])).rows[0].status === 'accepted', 'rider accepts order');
    const busy = await expectErr(`select accept_order($1)`, 'rider with an active order cannot take another', [order2]);
    ok(busy?.includes('rider_busy'), 'error is rider_busy');
    const row = (await db.query(`select delivery_text from orders where id = $1`, [order1])).rows[0];
    ok(row?.delivery_text.includes('House 7'), 'assigned rider now sees the address');
    const contact = (await db.query(`select * from order_contact($1)`, [order1])).rows[0];
    ok(contact?.phone === '+923030000001', 'rider gets the customer phone for the active order');
    await expectErr(`select advance_order($1, 'on_the_way')`, 'cannot skip the shop step', [order1]);
    await expectErr(`select advance_order($1, 'at_shop')`, 'arriving at the shop needs a location', [order1]);
    const atShop = (await db.query(`select * from advance_order($1, 'at_shop', 33.69, 73.015)`, [order1])).rows[0];
    ok(atShop.status === 'at_shop' && atShop.delivery_fee === 150 && Number(atShop.shop_distance_km) > 1, 'at shop: fee set from shop-to-home distance');
    await db.query(`insert into storage.objects (bucket_id, name) values ('order-media', $1)`, [`bills/${order1}.jpg`]);
    await expectErr(`insert into storage.objects (bucket_id, name) values ('order-media', $1)`, 'bill photo for another order refused', [`bills/${order2}.jpg`]);
    const cash = await expectErr(`select advance_order($1, 'on_the_way', null, null, 9000, $2)`, 'bill above the cash limit refused', [order1, `bills/${order1}.jpg`]);
    ok(cash?.includes('cash_limit_exceeded'), 'error is cash_limit_exceeded');
    await expectErr(`select advance_order($1, 'on_the_way', null, null, 1200)`, 'bill photo required', [order1]);
    ok((await db.query(`select status from advance_order($1, 'on_the_way', null, null, 1200, $2)`, [order1, `bills/${order1}.jpg`])).rows[0].status === 'on_the_way', 'on the way with bill');
    const done = (await db.query(`select * from advance_order($1, 'delivered')`, [order1])).rows[0];
    ok(done.status === 'delivered' && done.cash_collected === true, 'delivered, cash collected');
    // Release flow on order 2
    ok((await db.query(`select status from accept_order($1)`, [order2])).rows[0].status === 'accepted', 'rider accepts a second order after delivering');
    const released = (await db.query(`select * from cancel_order($1, 'Bike puncture')`, [order2])).rows[0];
    ok(released.status === 'requested' && released.rider_id === null, 'rider releases order back to waiting');
  });

  await asUser(customer, async () => {
    const bill = (await db.query(`select name from storage.objects where bucket_id = 'order-media' and name = $1`, [`bills/${order1}.jpg`])).rows;
    ok(bill.length === 1, 'customer can see the bill photo of their order');
    const rated = (await db.query(`select rating from rate_order($1, 5::smallint, 'Fast!')`, [order1])).rows[0];
    ok(rated.rating === 5, 'customer rates delivered order');
    ok((await db.query(`select * from order_contact($1)`, [order1])).rows.length === 0, 'no contact details after delivery');
    await expectErr(`select rate_order($1, 4::smallint)`, 'cannot rate twice', [order1]);
    await expectErr(`select cancel_order($1)`, 'cannot cancel a delivered order', [order1]);
    const events = (await db.query(`select to_status from order_events where order_id = $1 order by id`, [order1])).rows.map((r) => r.to_status);
    ok(events.join('>') === 'requested>accepted>at_shop>on_the_way>delivered', 'full status history logged');
    const free = (await db.query(`select * from cancel_order($1)`, [order3])).rows[0];
    ok(free.status === 'cancelled' && free.cancellation_fee === 0, 'cancel while searching is free');
  });

  // Admin assigns order 2 to rider 2; customer cancels after acceptance (fee)
  await asUser(admin, async () => {
    const all = (await db.query(`select id from orders where customer_id = $1`, [customer])).rows;
    ok(all.length === 3, 'admin sees all orders');
    ok((await db.query(`select status from assign_order($1, $2)`, [order2, rider2])).rows[0].status === 'accepted', 'admin assigns order to a rider');
    await expectErr(`select cancel_order($1)`, 'admin cancel needs a reason', [order2]);
  });
  await asUser(customer, async () => {
    const paid = (await db.query(`select * from cancel_order($1, 'Changed my mind')`, [order2])).rows[0];
    ok(paid.status === 'cancelled' && paid.cancellation_fee === 50, 'cancel after a rider accepted costs Rs 50');
  });
  await asUser(rider, async () => {
    await expectErr(`select assign_order($1, $2)`, 'riders cannot assign orders', [order2, rider]);
  });

  // Account deletion
  let order4;
  await asUser(customer, async () => {
    order4 = (await db.query(`select id from create_sauda_order($1, 'grocery', 'Olpers 1 litre')`, [addressId])).rows[0].id;
  });
  await asUser(rider2, async () => {
    await db.query(`select accept_order($1)`, [order4]);
  });
  await asUser(customer, async () => {
    const blocked = await expectErr(`select delete_my_account()`, 'cannot delete account during an active order');
    ok(blocked?.includes('active_order'), 'error is active_order');
  });
  await asUser(rider2, async () => {
    await db.query(`select cancel_order($1, 'test release')`, [order4]); // back to requested
  });
  await asUser(customer, async () => {
    await db.query(`select delete_my_account()`);
  });
  ok((await db.query(`select count(*)::int n from auth.users where id = $1`, [customer])).rows[0].n === 0, 'account deleted');
  ok((await db.query(`select count(*)::int n from addresses where user_id = $1`, [customer])).rows[0].n === 0, 'addresses deleted with the account');
  const kept = (await db.query(`select customer_id, delivery_text, status from orders where id = $1`, [order1])).rows[0];
  ok(kept.customer_id === null && kept.delivery_text === 'Deleted account' && kept.status === 'delivered', 'finished order kept without personal details');
  ok((await db.query(`select status from orders where id = $1`, [order4])).rows[0].status === 'cancelled', 'waiting order cancelled on deletion');

  await db.exec(`set role anon;`);
  await expectErr(`select delete_my_account()`, 'anon cannot call delete_my_account');
  await expectErr(`select * from orders`, 'anon cannot read orders');
  await db.exec(`reset role;`);
}

// ----------------------------------------------------------------------- P4 slice 2: offers, voice, substitutions, tracking, push
async function checkSaudaLive(db) {
  const { expectErr, asUser, newUser } = helpers(db);
  // Riders left online by earlier checks would take part in dispatch: switch everyone off first.
  await db.exec(`update partners set is_online = false`);
  const customer = await newUser('923040000001');
  const r1 = await newUser('923040000002'); // nearest
  const r2 = await newUser('923040000003'); // a bit farther
  const r3 = await newUser('923040000004'); // offline
  const stranger = await newUser('923040000005');
  const spots = [[r1, 33.6762, 73.0152, true], [r2, 33.69, 73.03, true], [r3, 33.676, 73.015, false]];
  for (const [id, lat, lng, online] of spots) {
    await db.query(`insert into partners (id, role, status, is_online, last_latitude, last_longitude, last_seen_at)
                    values ($1, 'rider', 'approved', $2, $3, $4, now())`, [id, online, lat, lng]);
  }
  const offersOf = async (orderId) =>
    (await db.query(`select rider_id, status from order_offers where order_id = $1 order by offered_at, status`, [orderId])).rows;
  const outbox = async (userId) => (await db.query(`select kind, params from notification_outbox where user_id = $1 order by id`, [userId])).rows;

  // Push tokens
  await db.exec(`set role anon;`);
  await expectErr(`select register_push_token('anon-token-123456', 'customer', 'android')`, 'anon cannot register a push token');
  await db.exec(`reset role;`);
  await asUser(customer, async () => {
    await db.query(`select register_push_token('customer-token-0001', 'customer', 'android')`);
    await db.query(`select register_push_token('customer-token-0001', 'customer', 'android')`);
    await expectErr(`select * from push_tokens`, 'apps cannot read push tokens directly');
    await expectErr(`select * from notification_outbox`, 'apps cannot read the notification queue');
    await expectErr(`select register_push_token('x', 'customer', 'android')`, 'too-short token rejected');
  });
  for (const r of [r1, r2]) await asUser(r, () => db.query(`select register_push_token($1, 'partner', 'android')`, [`rider-token-${r}`]));
  ok((await db.query(`select count(*)::int n from push_tokens`)).rows[0].n >= 3, 'push tokens saved (re-registering does not duplicate)');

  // Voice-note order -> automatic offer to the nearest rider
  let o1, o2, addressId;
  const voice = `${customer}/voice-abc123.m4a`;
  await asUser(customer, async () => {
    addressId = (await db.query(`insert into addresses (latitude, longitude, formatted_address)
      values (33.676, 73.015, 'Street 3, G-10/4, Islamabad') returning id`)).rows[0].id;
    await db.query(`insert into storage.objects (bucket_id, name) values ('order-media', $1)`, [voice]);
    await expectErr(`insert into storage.objects (bucket_id, name) values ('order-media', $1)`,
      "cannot upload a voice note into someone else's folder", [`${stranger}/voice-x.m4a`]);
    const noList = await expectErr(`select place_sauda_order($1, 'grocery', '  ')`, 'order without a list or voice note refused', [addressId]);
    ok(noList?.includes('list_required'), 'error is list_required');
    await expectErr(`select place_sauda_order($1, 'grocery', '', null, null, '{}', $2)`, "someone else's voice note refused",
      [addressId, `${stranger}/voice-x.m4a`]);
    const o = (await db.query(`select * from place_sauda_order($1, 'grocery', '', null, null, '{}', $2)`, [addressId, voice])).rows[0];
    o1 = o.id;
    ok(o.voice_note_path === voice && o.items_text === 'Voice note' && o.status === 'requested', 'voice-only order placed');
    ok((await db.query(`select * from order_offers`)).rows.length === 0, 'customers cannot see offers');
    await expectErr(`select dispatch_pending()`, 'apps cannot run dispatch directly');
  });
  let offers = await offersOf(o1);
  ok(offers.length === 1 && offers[0].rider_id === r1 && offers[0].status === 'offered', 'new order offered to the nearest online rider');
  ok((await outbox(r1)).some((n) => n.kind === 'new_offer'), 'rider gets a new-offer notification');

  await asUser(r1, async () => {
    const mine = (await db.query(`select * from my_offer()`)).rows;
    ok(mine.length === 1 && mine[0].order_id === o1 && mine[0].voice_note_path === voice && mine[0].seconds_left > 20
      && !('delivery_text' in mine[0]), 'rider sees the offer (voice note, countdown, no address)');
    ok((await db.query(`select name from storage.objects where name = $1`, [voice])).rows.length === 1, 'offered rider can play the voice note');
    ok((await db.query(`select * from order_offers`)).rows.length === 1, 'rider sees own offer');
    ok((await db.query(`select respond_offer($1, false) r`, [mine[0].offer_id])).rows[0].r === null, 'rider declines the offer');
    await expectErr(`select respond_offer($1, true)`, 'cannot accept a declined offer', [mine[0].offer_id]);
  });
  offers = await offersOf(o1);
  ok(offers.find((f) => f.rider_id === r1)?.status === 'declined' && offers.find((f) => f.rider_id === r2)?.status === 'offered',
    'declined offer goes straight to the next nearest rider');
  await asUser(r1, async () => {
    ok((await db.query(`select * from my_offer()`)).rows.length === 0, 'rider who declined is not offered it again');
    ok((await db.query(`select name from storage.objects where name = $1`, [voice])).rows.length === 0, 'voice note hidden after declining');
  });
  await asUser(stranger, async () => {
    ok((await db.query(`select name from storage.objects where name = $1`, [voice])).rows.length === 0, 'others cannot play the voice note');
  });

  // Offer runs out; offers used up -> needs a rider
  await db.exec(`update order_offers set expires_at = now() - interval '1 second' where status = 'offered'`);
  await db.exec(`update app_settings set value = '2' where key = 'max_auto_offers'`);
  await asUser(r2, async () => {
    ok((await db.query(`select * from my_offer()`)).rows.length === 0, 'expired offer disappears');
  });
  offers = await offersOf(o1);
  ok(offers.find((f) => f.rider_id === r2)?.status === 'expired', 'unanswered offer marked expired');
  ok((await db.query(`select dispatch_gave_up_at from orders where id = $1`, [o1])).rows[0].dispatch_gave_up_at !== null,
    'after the last offer the order is flagged as needing a rider');
  await db.exec(`update app_settings set value = '3' where key = 'max_auto_offers'`);
  await asUser(r1, async () => {
    ok((await db.query(`select * from list_open_orders(33.676, 73.015)`)).rows.some((r) => r.id === o1), 'flagged order still in the nearby list');
  });

  // Second order: accepted through the offer
  await asUser(customer, async () => {
    o2 = (await db.query(`select id from place_sauda_order($1, 'grocery', 'Olpers 1 litre, Dawn bread')`, [addressId])).rows[0].id;
  });
  await asUser(r1, async () => {
    const [offer] = (await db.query(`select * from my_offer()`)).rows;
    ok(offer?.order_id === o2, 'next order offered to the nearest free rider');
    const taken = (await db.query(`select * from respond_offer($1, true)`, [offer.offer_id])).rows[0];
    ok(taken.status === 'accepted' && taken.rider_id === r1, 'rider accepts through the offer');
    await expectErr(`select respond_offer($1, true)`, 'an accepted offer cannot be answered again', [offer.offer_id]);
  });
  ok((await offersOf(o2)).every((f) => f.status !== 'offered'), 'no open offers left on a taken order');
  ok((await outbox(customer)).some((n) => n.kind === 'order_status' && n.params.status === 'accepted'), 'customer notified: rider accepted');

  // Rider location for the customer
  await asUser(customer, async () => {
    const loc = (await db.query(`select * from order_rider_location($1)`, [o2])).rows[0];
    ok(loc?.latitude === 33.6762, 'customer sees where the rider is');
    ok((await db.query(`select * from order_rider_location($1)`, [o1])).rows.length === 0, 'no rider location while still searching');
  });
  await asUser(stranger, async () => {
    ok((await db.query(`select * from order_rider_location($1)`, [o2])).rows.length === 0, "others cannot see the rider's location");
  });

  // Substitutions
  let s1, s2;
  await asUser(r1, async () => {
    const early = await expectErr(`select request_substitution($1, 'Olpers 1 litre')`, 'substitution only once at the shop', [o2]);
    ok(early?.includes('not_at_shop'), 'error is not_at_shop');
    await db.query(`select advance_order($1, 'at_shop', 33.68, 73.02)`, [o2]);
    s1 = (await db.query(`select * from request_substitution($1, 'Olpers 1 litre', 'Nestle Milkpak 1 litre', 290)`, [o2])).rows[0];
    ok(s1.status === 'pending' && s1.suggestion === 'Nestle Milkpak 1 litre' && s1.price === 290, 'rider asks: no Olpers, get Nestle?');
    await db.query(`insert into storage.objects (bucket_id, name) values ('order-media', $1)`, [`subs/${o2}/bread1.jpg`]);
    await expectErr(`insert into storage.objects (bucket_id, name) values ('order-media', $1)`,
      'substitution photo for another order refused', [`subs/${o1}/x.jpg`]);
    await expectErr(`select request_substitution($1, 'Dawn bread', null, null, $2)`, 'photo from another order refused', [o2, `subs/${o1}/x.jpg`]);
    s2 = (await db.query(`select * from request_substitution($1, 'Dawn bread', null, null, $2)`, [o2, `subs/${o2}/bread1.jpg`])).rows[0];
    ok(s2.suggestion === null && s2.photo_path === `subs/${o2}/bread1.jpg`, 'rider asks: bread not available, skip it?');
  });
  ok((await outbox(customer)).filter((n) => n.kind === 'substitution').length === 2, 'customer notified about each question');
  await asUser(customer, async () => {
    ok((await db.query(`select * from order_substitutions where order_id = $1`, [o2])).rows.length === 2, 'customer sees the questions');
    ok((await db.query(`select name from storage.objects where name = $1`, [`subs/${o2}/bread1.jpg`])).rows.length === 1, 'customer sees the substitution photo');
    await expectErr(`select request_substitution($1, 'x')`, 'customers cannot ask substitutions', [o2]);
    ok((await db.query(`select status from answer_substitution($1, true)`, [s1.id])).rows[0].status === 'approved', 'customer approves Nestle');
    const again = await expectErr(`select answer_substitution($1, false)`, 'an answered question cannot be changed', [s1.id]);
    ok(again?.includes('substitution_closed'), 'error is substitution_closed');
  });
  ok((await outbox(r1)).some((n) => n.kind === 'substitution_answer' && n.params.approved === true), 'rider notified of the answer');
  await asUser(stranger, async () => {
    ok((await db.query(`select * from order_substitutions`)).rows.length === 0, 'others cannot see substitutions');
    await expectErr(`select answer_substitution($1, true)`, 'others cannot answer', [s2.id]);
    ok((await db.query(`select name from storage.objects where name = $1`, [`subs/${o2}/bread1.jpg`])).rows.length === 0, 'others cannot see the photo');
  });
  await asUser(r2, async () => {
    ok((await db.query(`select * from order_substitutions`)).rows.length === 0, 'other riders cannot see substitutions');
  });
  await asUser(r1, async () => {
    await db.query(`insert into storage.objects (bucket_id, name) values ('order-media', $1)`, [`bills/${o2}.jpg`]);
    await db.query(`select advance_order($1, 'on_the_way', null, null, 700, $2)`, [o2, `bills/${o2}.jpg`]);
  });
  ok((await db.query(`select status from order_substitutions where id = $1`, [s2.id])).rows[0].status === 'no_reply',
    'unanswered question closed as no reply when the rider leaves the shop');
  await asUser(customer, async () => {
    await expectErr(`select answer_substitution($1, true)`, 'cannot answer after the rider left the shop', [s2.id]);
  });

  // Rider takes the flagged order from the list, then gives it back
  await asUser(r2, async () => {
    await db.query(`select accept_order($1)`, [o1]);
    await db.query(`select cancel_order($1, 'Too far')`, [o1]);
  });
  const back = (await db.query(`select status, dispatch_gave_up_at from orders where id = $1`, [o1])).rows[0];
  ok(back.status === 'requested' && back.dispatch_gave_up_at === null, 'released order goes back to automatic offers');
  ok((await offersOf(o1)).find((f) => f.rider_id === r2)?.status === 'declined', 'rider who gave it back is not offered it again');

  await asUser(customer, async () => {
    await db.query(`select unregister_push_token('customer-token-0001')`);
  });
  ok((await db.query(`select count(*)::int n from push_tokens where user_id = $1`, [customer])).rows[0].n === 0, 'push token removed on sign-out');
  const queued = (await outbox(customer)).length;
  await asUser(r2, () => db.query(`select accept_order($1)`, [o1]));
  ok((await outbox(customer)).length === queued, 'no notifications queued for someone without the app');
  await db.exec(`update partners set is_online = false`);
}

// ----------------------------------------------------------------------- P5: Ustaad bookings
async function checkUstaad(db) {
  const { expectErr, asUser, newUser } = helpers(db);
  await db.exec(`update partners set is_online = false`);
  const customer = await newUser('923050000001');
  const u1 = await newUser('923050000002'); // plumber + electrician, nearest
  const u2 = await newUser('923050000003'); // plumber, farther
  const u3 = await newUser('923050000004'); // electrician only
  const u4 = await newUser('923050000005'); // plumber, offline
  const stranger = await newUser('923050000006');
  const admin = await newUser('923050000007');
  await db.query(`insert into admins (user_id) values ($1) on conflict do nothing`, [admin]);
  const ustaads = [
    [u1, '{plumber,electrician}', 33.6762, 73.0152, true],
    [u2, '{plumber}', 33.69, 73.03, true],
    [u3, '{electrician}', 33.70, 73.04, true],
    [u4, '{plumber}', 33.676, 73.015, false],
  ];
  for (const [id, trades, lat, lng, online] of ustaads) {
    await db.query(`insert into partners (id, role, trades, status, is_online, last_latitude, last_longitude, last_seen_at)
                    values ($1, 'ustaad', $2, 'approved', $3, $4, $5, now())`, [id, trades, online, lat, lng]);
  }
  await db.query(`update profiles set full_name = 'Ustaad Two' where id = $1`, [u2]);
  for (const [who, app] of [[customer, 'customer'], [u1, 'partner'], [u2, 'partner']]) {
    await asUser(who, () => db.query(`select register_push_token($1, $2, 'android')`, [`token-${who}`, app]));
  }
  const offersOf = async (jobId) =>
    (await db.query(`select ustaad_id, status from job_offers where job_id = $1 order by offered_at, status`, [jobId])).rows;
  const openOffer = async (jobId) => (await offersOf(jobId)).find((f) => f.status === 'offered')?.ustaad_id;
  const outbox = async (userId) => (await db.query(`select kind, params from notification_outbox where user_id = $1 order by id`, [userId])).rows;
  const slot = async (dayHours) =>
    (await db.query(`select ((date_trunc('day', now() at time zone 'Asia/Karachi') + $1::interval) at time zone 'Asia/Karachi') t`, [dayHours])).rows[0].t;
  const book = (trade, extra = '') => db.query(`select * from create_ustaad_job($1, '${trade}', 'Kitchen tap leaking'${extra})`, [addressId]);

  let addressId, j1, j2, j3, j4, j5, j6, w;
  const photo = `${customer}/job-tap1.jpg`;
  await asUser(customer, async () => {
    addressId = (await db.query(`insert into addresses (latitude, longitude, formatted_address)
      values (33.676, 73.015, 'Street 9, G-10/1, Islamabad') returning id`)).rows[0].id;
    await db.query(`insert into storage.objects (bucket_id, name) values ('order-media', $1)`, [photo]);
    const j = (await db.query(`select * from create_ustaad_job($1, 'plumber', 'Kitchen tap leaking', 'now', null, $2)`, [addressId, [photo]])).rows[0];
    j1 = j.id;
    ok(j.status === 'requested' && j.visit_fee === 625 && j.surge_percent === 25 && /^UJ-[0-9A-F]{6}$/.test(j.code),
      'come-now job booked: visit fee Rs 500 + 25% surge = Rs 625');
    ok(j.address_text.includes('G-10/1') && j.zone_id !== null, 'address copied onto the job');
    const soon = await expectErr(`select create_ustaad_job($1, 'plumber', 'x y', 'scheduled', now() + interval '20 minutes')`,
      'slot less than an hour away refused', [addressId]);
    ok(soon?.includes('invalid_slot'), 'error is invalid_slot');
    await expectErr(`select create_ustaad_job($1, 'plumber', 'x y', 'scheduled', $2)`, 'slot at 3 am refused', [addressId, await slot('1 day 3 hours')]);
    await expectErr(`select create_ustaad_job($1, 'plumber', 'x y', 'now', null, '{}', $2)`, 'preferred ustaad without that trade refused', [addressId, u3]);
    await expectErr(`insert into ustaad_jobs (trade, problem_text, address_text, latitude, longitude, visit_fee) values ('plumber', 'x y', 'x', 33.6, 73.0, 1)`,
      'customers cannot insert jobs directly');
    await expectErr(`update ustaad_jobs set visit_fee = 1 where id = $1`, 'customers cannot change the visit fee', [j1]);
    ok((await db.query(`select * from job_offers`)).rows.length === 0, 'customers cannot see job offers');
  });
  await asUser(stranger, async () => {
    ok((await db.query(`select * from ustaad_jobs`)).rows.length === 0, "others cannot see someone's jobs");
  });

  // Offers: nearest free ustaad with the trade
  ok((await openOffer(j1)) === u1, 'job offered to the nearest online plumber');
  ok((await outbox(u1)).some((n) => n.kind === 'new_job_offer'), 'ustaad gets a new-job notification');
  await asUser(u1, async () => {
    const [offer] = (await db.query(`select * from my_job_offer()`)).rows;
    ok(offer?.job_id === j1 && offer.problem_text === 'Kitchen tap leaking' && offer.seconds_left > 30 && !('address_text' in offer),
      'ustaad sees the offer: problem, countdown, no address');
    ok((await db.query(`select name from storage.objects where name = $1`, [photo])).rows.length === 1, 'offered ustaad sees the problem photo');
    ok((await db.query(`select respond_job_offer($1, false) r`, [offer.offer_id])).rows[0].r === null, 'ustaad skips the offer');
  });
  ok((await openOffer(j1)) === u2, 'skipped job goes to the next nearest plumber');
  await asUser(u3, async () => {
    const open = (await db.query(`select * from list_open_jobs(33.676, 73.015)`)).rows;
    ok(open.every((r) => r.trade === 'electrician'), 'an electrician only sees electrician jobs');
  });
  await asUser(stranger, async () => {
    ok((await db.query(`select name from storage.objects where name = $1`, [photo])).rows.length === 0, 'others cannot see the problem photo');
    await expectErr(`select * from list_open_jobs(33.676, 73.015)`, 'non-ustaads cannot list jobs');
  });

  await asUser(u2, async () => {
    const [offer] = (await db.query(`select * from my_job_offer()`)).rows;
    const taken = (await db.query(`select * from respond_job_offer($1, true)`, [offer.offer_id])).rows[0];
    ok(taken.status === 'accepted' && taken.ustaad_id === u2, 'ustaad accepts through the offer');
    ok((await db.query(`select address_text from ustaad_jobs where id = $1`, [j1])).rows[0]?.address_text.includes('G-10/1'),
      'accepted ustaad now sees the address');
    ok((await db.query(`select * from job_contact($1)`, [j1])).rows[0]?.phone === '+923050000001', 'ustaad gets the customer phone');
  });
  ok((await outbox(customer)).some((n) => n.kind === 'job_status' && n.params.status === 'accepted'), 'customer notified: ustaad accepted');

  await asUser(customer, async () => {
    j3 = (await book('plumber')).rows[0].id;
  });
  ok((await openOffer(j3)) === u1, 'the next come-now job goes to the free ustaad, not the busy one');
  await asUser(u2, async () => {
    const busy = await expectErr(`select accept_job($1)`, 'an ustaad with a come-now job cannot take another', [j3]);
    ok(busy?.includes('ustaad_busy'), 'error is ustaad_busy');
  });

  // Customer's view of the ustaad
  await asUser(customer, async () => {
    const card = (await db.query(`select * from job_ustaad($1)`, [j1])).rows[0];
    ok(card?.name === 'Ustaad Two' && card.phone === '+923050000003' && card.jobs_done === 0 && card.is_favourite === false,
      "customer sees the ustaad's name, phone and record");
    ok((await db.query(`select * from job_ustaad_location($1)`, [j1])).rows[0]?.latitude === 33.69, 'customer sees where the ustaad is');
    await expectErr(`insert into favourite_ustaads (ustaad_id) values ($1)`, 'cannot favourite an ustaad before they worked for you', [u2]);
    const early = await expectErr(`select answer_quote($1, true)`, 'no quote to approve yet', [j1]);
    ok(early?.includes('no_quote_to_answer'), 'error is no_quote_to_answer');
  });
  await asUser(stranger, async () => {
    ok((await db.query(`select * from job_ustaad_location($1)`, [j1])).rows.length === 0, "others cannot see the ustaad's location");
  });

  // Visit → quote → approve → complete
  await asUser(u2, async () => {
    await expectErr(`select advance_job($1, 'arrived', 33.676, 73.015)`, 'cannot skip "on the way"', [j1]);
    await db.query(`select advance_job($1, 'on_the_way')`, [j1]);
    await expectErr(`select advance_job($1, 'arrived')`, 'arriving needs a location', [j1]);
    ok((await db.query(`select status from advance_job($1, 'arrived', 33.676, 73.015)`, [j1])).rows[0].status === 'arrived', 'ustaad arrived');
    await expectErr(`select send_quote($1, -5)`, 'negative quote refused', [j1]);
    await db.query(`select send_quote($1, 1500, 800, 'Replace mixer valve')`, [j1]);
    const revised = (await db.query(`select * from send_quote($1, 1200, 800, 'Replace mixer valve')`, [j1])).rows[0];
    ok(revised.status === 'quoted' && revised.labour_cost === 1200 && revised.parts_cost === 800, 'quote sent and revised');
  });
  ok((await outbox(customer)).some((n) => n.kind === 'job_quote' && n.params.total === 2000), 'customer notified of the quote');
  await asUser(customer, async () => {
    await expectErr(`select send_quote($1, 1, 1)`, 'customers cannot write quotes', [j1]);
    await expectErr(`select cancel_job($1)`, 'customer cannot cancel at the quote stage (decline instead)', [j1]);
    ok((await db.query(`select status from answer_quote($1, true)`, [j1])).rows[0].status === 'in_progress', 'customer approves the quote');
  });
  ok((await outbox(u2)).some((n) => n.kind === 'quote_answer' && n.params.approved === true), 'ustaad notified: quote approved');
  await asUser(u2, async () => {
    const done = (await db.query(`select *, warranty_until > now() + interval '6 days' w from complete_job($1)`, [j1])).rows[0];
    ok(done.status === 'completed' && done.amount_due === 2000 && done.cash_collected && done.w, 'job completed: Rs 2,000 due, 7-day warranty');
  });
  await asUser(customer, async () => {
    ok((await db.query(`select rating from rate_job($1, 5::smallint, 'Neat work')`, [j1])).rows[0].rating === 5, 'customer rates the ustaad');
    await expectErr(`select rate_job($1, 4::smallint)`, 'cannot rate twice', [j1]);
    await db.query(`insert into favourite_ustaads (ustaad_id) values ($1)`, [u2]);
    const favs = (await db.query(`select * from my_favourite_ustaads()`)).rows;
    ok(favs.length === 1 && favs[0].ustaad_id === u2 && Number(favs[0].rating_avg) === 5 && favs[0].jobs_done === 1,
      'favourite ustaad saved with rating and jobs done');
    const card = (await db.query(`select * from job_ustaad($1)`, [j1])).rows[0];
    ok(card.phone === null && card.is_favourite === true, 'phone hidden after the job; marked as favourite');
    const events = (await db.query(`select to_status from job_events where job_id = $1 order by id`, [j1])).rows.map((r) => r.to_status);
    ok(events.join('>') === 'requested>accepted>on_the_way>arrived>quoted>in_progress>completed', 'full job history logged');
  });

  // Warranty revisit, offered to the same ustaad first
  await asUser(customer, async () => {
    w = (await db.query(`select * from report_issue_again($1, 'Leaking again')`, [j1])).rows[0];
    ok(w.is_warranty && w.visit_fee === 0 && w.parent_job_id === j1 && w.preferred_ustaad_id === u2, 'problem came back: free revisit job');
    const twice = await expectErr(`select report_issue_again($1, 'again')`, 'only one revisit at a time', [j1]);
    ok(twice?.includes('revisit_exists'), 'error is revisit_exists');
  });
  ok((await openOffer(w.id)) === u2, 'revisit offered to the same ustaad first');
  await asUser(u2, async () => {
    const [offer] = (await db.query(`select * from my_job_offer()`)).rows;
    ok(offer?.is_warranty === true, 'ustaad sees it is a warranty revisit');
    await db.query(`select respond_job_offer($1, true)`, [offer.offer_id]);
    await db.query(`select advance_job($1, 'on_the_way')`, [w.id]);
    await db.query(`select advance_job($1, 'arrived', 33.676, 73.015)`, [w.id]);
    const free = await expectErr(`select send_quote($1, 500, 300)`, 'warranty labour must be free', [w.id]);
    ok(free?.includes('warranty_labour_free'), 'error is warranty_labour_free');
    await db.query(`select send_quote($1, 0, 300, 'New washer')`, [w.id]);
  });
  await asUser(customer, () => db.query(`select answer_quote($1, true)`, [w.id]));
  await asUser(u2, async () => {
    ok((await db.query(`select amount_due from complete_job($1)`, [w.id])).rows[0].amount_due === 300, 'revisit: customer pays parts only');
  });

  // Declined quote → visit fee only
  await asUser(u1, async () => {
    const [offer] = (await db.query(`select * from my_job_offer()`)).rows;
    ok(offer?.job_id === j3, 'the other ustaad has the second job on offer');
    await db.query(`select respond_job_offer($1, true)`, [offer.offer_id]);
    await db.query(`select advance_job($1, 'on_the_way')`, [j3]);
    await db.query(`select advance_job($1, 'arrived', 33.676, 73.015)`, [j3]);
    await db.query(`select send_quote($1, 3000, 0)`, [j3]);
  });
  await asUser(customer, async () => {
    const declined = (await db.query(`select * from answer_quote($1, false)`, [j3])).rows[0];
    ok(declined.status === 'visit_only' && declined.amount_due === 625, 'quote declined: only the Rs 625 visit fee is due');
    ok((await db.query(`select rating from rate_job($1, 3::smallint)`, [j3])).rows[0].rating === 3, 'visit-only job can be rated');
  });

  // Scheduled job: too early to set off; free cancellation well before the slot
  await asUser(customer, async () => {
    const s = (await db.query(`select * from create_ustaad_job($1, 'plumber', 'Install geyser', 'scheduled', $2)`, [addressId, await slot('1 day 11 hours')])).rows[0];
    j2 = s.id;
    ok(s.timing === 'scheduled' && s.visit_fee === 500 && s.scheduled_for !== null, 'scheduled job booked at 11 am tomorrow, no surge');
  });
  await asUser(u1, async () => {
    ok((await db.query(`select status from accept_job($1)`, [j2])).rows[0].status === 'accepted', 'ustaad accepts the scheduled job');
    const early = await expectErr(`select advance_job($1, 'on_the_way')`, 'cannot set off more than 2 hours before the slot', [j2]);
    ok(early?.includes('too_early'), 'error is too_early');
  });
  await asUser(customer, async () => {
    const c = (await db.query(`select * from cancel_job($1)`, [j2])).rows[0];
    ok(c.status === 'cancelled' && c.cancellation_fee === 0, 'scheduled job cancelled free well before the slot');
    j4 = (await book('electrician')).rows[0].id;
  });
  await asUser(u1, async () => {
    await db.query(`select accept_job($1)`, [j4]);
  });
  await asUser(customer, async () => {
    const c = (await db.query(`select * from cancel_job($1, 'Fixed it myself')`, [j4])).rows[0];
    ok(c.status === 'cancelled' && c.cancellation_fee === 50, 'come-now job cancelled after acceptance: Rs 50');
    j5 = (await book('plumber')).rows[0].id;
  });

  // Ustaad gives a job back; admin assigns it
  await asUser(u1, async () => {
    await db.query(`select accept_job($1)`, [j5]);
    const back = (await db.query(`select * from cancel_job($1, 'Bike broke down')`, [j5])).rows[0];
    ok(back.status === 'requested' && back.ustaad_id === null, 'ustaad gives the job back before arriving');
  });
  ok((await offersOf(j5)).find((f) => f.ustaad_id === u1)?.status === 'declined', 'it is not offered to them again');
  await asUser(stranger, async () => {
    await expectErr(`select assign_job($1, $2)`, 'only admins assign jobs', [j5, u4]);
  });
  await asUser(admin, async () => {
    await expectErr(`select assign_job($1, $2)`, 'cannot assign to an ustaad without the trade', [j5, u3]);
    ok((await db.query(`select status from assign_job($1, $2)`, [j5, u4])).rows[0].status === 'accepted', 'admin assigns the job');
  });
  ok(!(await openOffer(j5)), 'open offers closed when the job is assigned');
  await asUser(u4, async () => {
    await db.query(`select advance_job($1, 'on_the_way')`, [j5]);
    await db.query(`select advance_job($1, 'arrived', 33.676, 73.015)`, [j5]);
    await expectErr(`select cancel_job($1)`, 'ustaad cannot give back a job after arriving', [j5]);
  });
  await asUser(customer, async () => {
    const msg = await expectErr(`select cancel_job($1)`, 'customer cannot cancel after the ustaad arrived', [j5]);
    ok(msg?.includes('contact_support_to_cancel'), 'error is contact_support_to_cancel');
  });
  await asUser(admin, async () => {
    await expectErr(`select cancel_job($1)`, 'admin cancel needs a reason', [j5]);
    ok((await db.query(`select status from cancel_job($1, 'Customer not home')`, [j5])).rows[0].status === 'cancelled', 'admin cancels with a reason');
    ok((await db.query(`select id from ustaad_jobs where customer_id = $1`, [customer])).rows.length === 6, 'admin sees all jobs');
  });

  // Account deletion
  await asUser(customer, async () => {
    j6 = (await book('plumber')).rows[0].id;
  });
  await asUser(u2, () => db.query(`select accept_job($1)`, [j6]));
  await asUser(customer, async () => {
    const blocked = await expectErr(`select delete_my_account()`, 'cannot delete an account with an active job');
    ok(blocked?.includes('active_job'), 'error is active_job');
  });
  await asUser(u2, () => db.query(`select cancel_job($1)`, [j6]));
  await asUser(customer, () => db.query(`select delete_my_account()`));
  ok((await db.query(`select status from ustaad_jobs where id = $1`, [j6])).rows[0].status === 'cancelled', 'waiting job cancelled on deletion');
  const kept = (await db.query(`select customer_id, address_text, status from ustaad_jobs where id = $1`, [j1])).rows[0];
  ok(kept.customer_id === null && kept.address_text === 'Deleted account' && kept.status === 'completed', 'finished job kept without personal details');

  await db.exec(`set role anon;`);
  await expectErr(`select * from ustaad_jobs`, 'anon cannot read jobs');
  await expectErr(`select my_job_offer()`, 'anon cannot check offers');
  await db.exec(`reset role;`);
  await db.exec(`update partners set is_online = false`);
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
  await checkOrders(db);
  await checkSaudaLive(db);
  await checkUstaad(db);
}

// --- B. SQL editor scripts, each run twice ------------------------------------------------
console.log('\n== B. SETUP_01..06 (each run twice, with an earlier signup)');
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
  await checkOrders(db);
  await checkSaudaLive(db);
  await checkUstaad(db);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
