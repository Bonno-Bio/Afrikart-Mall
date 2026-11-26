-- ============================================================================
--  Afrikart Mall — production database schema (PostgreSQL 15+)
--  v1.0 · stack-independent: this is correct whether the app is Next.js,
--  Remix, Laravel or Go. The framework is a preference; this is not.
--
--  FIVE RULES IN THIS FILE. Read them before changing anything.
--
--  1. MONEY IS ALWAYS AN INTEGER, IN THEBE (1/100 Pula). Never numeric,
--     never float, never a string. 1 Pula = 100.
--  2. ORDERS ARE IMMUTABLE FACTS. Order lines snapshot title, price, tax rate
--     and commission rate at the moment of sale. A seller editing a listing
--     tomorrow must not alter yesterday's accounting.
--  3. THE LEDGER IS DOUBLE-ENTRY AND APPEND-ONLY. Nothing is ever updated or
--     deleted. If it is wrong, you post a reversing entry with a reason.
--     A deferred constraint enforces that every transaction balances to zero.
--  4. INVENTORY IS DERIVED FROM MOVEMENTS. There is a cached on_hand column
--     for speed, but inventory_movements is the truth and they must reconcile.
--  5. EVERY MONEY-MOVING REQUEST CARRIES AN IDEMPOTENCY KEY. Charging a
--     customer twice is the one mistake no amount of support can undo.
-- ============================================================================

create extension if not exists "pgcrypto";   -- gen_random_uuid()
create extension if not exists "citext";     -- case-insensitive email

-- ---------------------------------------------------------------------------
-- Shared: updated_at maintenance and an append-only guard
-- ---------------------------------------------------------------------------
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

create or replace function forbid_mutation() returns trigger as $$
begin
  raise exception 'Table % is append-only; post a reversing entry instead', tg_table_name;
end $$ language plpgsql;

-- ---------------------------------------------------------------------------
-- IDENTITY
-- ---------------------------------------------------------------------------
create table users (
  id              uuid primary key default gen_random_uuid(),
  email           citext unique not null,
  phone           text unique,                      -- +2677XXXXXXXX, the real login key in this market
  full_name       text not null,
  password_hash   text,                             -- null = passwordless / OTP only
  role            text not null default 'customer'
                    check (role in ('customer','seller','rider','support','admin')),
  phone_verified_at timestamptz,
  marketing_opt_in boolean not null default false,
  status          text not null default 'active'
                    check (status in ('active','suspended','closed')),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index on users (phone) where phone is not null;
create trigger users_touch before update on users for each row execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- AUTHENTICATION (AFR-41)
-- ---------------------------------------------------------------------------
-- Phone OTP, because a Botswana customer's phone number is a better identity
-- than an email address and a password they will reuse. Two tables, and one
-- rule each: a code is single-use, a session is revocable.
create table otp_challenges (
  id           uuid primary key default gen_random_uuid(),
  phone        text not null,
  -- The code itself is never stored. A six-digit secret in a table is a
  -- six-digit secret in every backup, dump and support screenshot.
  code_hash    text not null,
  purpose      text not null default 'login'
                 check (purpose in ('login','seller_onboarding','payout_change')),
  attempts     integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 5 check (max_attempts between 1 and 10),
  consumed_at  timestamptz,
  expires_at   timestamptz not null,
  requested_ip inet,
  created_at   timestamptz not null default now()
);
create index on otp_challenges (phone, created_at desc);
create index on otp_challenges (expires_at) where consumed_at is null;

create table sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references users(id) on delete cascade,
  -- Also a hash: a stolen session table must not be a set of usable tokens.
  token_hash   text unique not null,
  user_agent   text,
  ip           inet,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '30 days',
  revoked_at   timestamptz
);
create index on sessions (user_id) where revoked_at is null;

create table addresses (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references users(id) on delete cascade,
  label         text not null default 'Home',
  recipient     text not null,
  line1         text not null,                      -- plot number
  line2         text,                               -- extension / ward / landmark
  city          text not null,
  district      text,
  phone         text not null,
  -- No reliable address system in this market. Coordinates and a landmark
  -- string are worth more than a postcode.
  lat           numeric(9,6),
  lng           numeric(9,6),
  landmark      text,
  suburb        text,
  -- There is no postal addressing here. What we have instead is a plot number,
  -- a landmark, and sometimes a pin. How much of that we actually trust is a
  -- property of the address, and it decides whether it can be routed at all.
  address_confidence text not null default 'unverified'
                       check (address_confidence in ('verified','pin_and_landmark','pin_only','landmark_only','unverified')),
  access_notes  text,                                  -- 'gate code 4417', 'behind the filling station'
  verified_at   timestamptz,
  verified_by   uuid,                     -- FK added after `riders` exists (see below)
  failed_attempts integer not null default 0,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now()
);
create index on addresses (city, suburb);

-- The landmark dictionary. Every failed delivery teaches the city something;
-- this table is where it is kept instead of in a rider's head.
create table landmarks (
  id         uuid primary key default gen_random_uuid(),
  city       text not null,
  suburb     text,
  name       text not null,                 -- 'Broadhurst Industrial Total filling station'
  kind       text check (kind in ('filling_station','school','church','mall','clinic','roundabout','other')),
  lat        numeric(9,6),
  lng        numeric(9,6),
  aliases    text[] not null default '{}',
  is_verified boolean not null default false,
  created_at timestamptz not null default now(),
  unique (city, name)
);
create index on addresses (user_id);
create unique index one_default_address on addresses (user_id) where is_default;

-- ---------------------------------------------------------------------------
-- SUPPLY SIDE
-- ---------------------------------------------------------------------------
create table sellers (
  id                  uuid primary key default gen_random_uuid(),
  owner_user_id       uuid references users(id),
  legal_name          text not null,
  trading_name        text not null,
  slug                citext unique not null,
  company_reg_no      text,                          -- CIPA
  tax_number          text,                          -- BURS
  vat_registered      boolean not null default false,
  city                text not null,
  fulfilment_mode     text not null default 'seller'
                        check (fulfilment_mode in ('seller','afrikart')),
  -- Rates are stored on the seller AND snapshotted onto each order line,
  -- so that changing a rate never rewrites history.
  -- Express tier is a badge, not a gate. Only sellers who can hold stock and
  -- meet the delivery standard may carry it; everyone else sells in the
  -- marketplace tier with no Express promise. This separates QUALITY from
  -- BREADTH, so selection can grow without diluting the promise.
  can_list_express    boolean not null default false,
  commission_bps      integer not null default 1200 check (commission_bps between 0 and 5000),
  fulfilment_bps      integer not null default 0    check (fulfilment_bps between 0 and 2000),
  status              text not null default 'pending'
                        check (status in ('pending','in_review','approved','suspended','closed')),
  approved_at         timestamptz,
  approved_by         uuid references users(id),
  rating_avg          numeric(3,2) not null default 0,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);
create trigger sellers_touch before update on sellers for each row execute function set_updated_at();

-- Bank details live alone, encrypted at the application layer before insert.
-- Never in the sellers table, never in backups in the clear.
create table seller_bank_accounts (
  id               uuid primary key default gen_random_uuid(),
  seller_id        uuid not null references sellers(id) on delete cascade,
  bank_name        text not null,
  account_name     text not null,
  account_number_enc bytea not null,
  branch_code      text,
  is_primary       boolean not null default true,
  verified_at      timestamptz,
  created_at       timestamptz not null default now()
);

create table seller_documents (
  id           uuid primary key default gen_random_uuid(),
  seller_id    uuid not null references sellers(id) on delete cascade,
  kind         text not null check (kind in ('company_reg','tax_certificate','id','bank_letter','other')),
  file_url     text not null,
  expires_at   date,
  reviewed_by  uuid references users(id),
  reviewed_at  timestamptz,
  created_at   timestamptz not null default now()
);

create table categories (
  id        uuid primary key default gen_random_uuid(),
  slug      citext unique not null,
  name      text not null,
  parent_id uuid references categories(id),
  position  integer not null default 0,
  is_active boolean not null default true,
  -- Some categories cannot be sold casually. Infant formula, cosmetics and
  -- anything with a health claim carry registration and labelling duties, and
  -- a restricted-ingredient screen is cheaper than a recall.
  licence_required     boolean not null default false,
  licence_authority    text,                        -- 'BOBS' | 'MRA' | 'BURS'
  restricted_ingredients text[] not null default '{}',
  -- Commission is a category decision, not one rate for the whole shop.
  -- Baby staples are thin and price-sensitive; cosmetics carry more. A single
  -- rate either kills the seller in one aisle or leaves money in another.
  -- Null means "use the seller's rate", so the seller remains the fallback.
  commission_bps  integer check (commission_bps between 0 and 5000),
  fulfilment_bps  integer check (fulfilment_bps between 0 and 5000),
  note      text
);

create table products (
  id           uuid primary key default gen_random_uuid(),
  seller_id    uuid not null references sellers(id),
  category_id  uuid not null references categories(id),
  title        text not null,
  brand        text,
  description  text,
  bullets      text[] not null default '{}',
  attributes   jsonb not null default '{}'::jsonb,   -- size, colour, capacity...
  status       text not null default 'draft'
                 check (status in ('draft','in_review','live','paused','rejected','archived')),
  -- Two tiers: 'express' carries the next-day promise and the badge;
  -- 'marketplace' is long-tail selection that never promises Express.
  catalog_tier text not null default 'marketplace'
                 check (catalog_tier in ('express','marketplace')),
  -- A product without a real photograph must not go live. Enforced, not hoped for.
  primary_image_url text,
  search_tsv   tsvector generated always as
                 (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(brand,'') || ' ' || coalesce(description,''))) stored,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint live_product_needs_image check (status <> 'live' or primary_image_url is not null),
  -- Nothing in a regulated category goes live without its paperwork on file.
  compliance_status text not null default 'unchecked'
                      check (compliance_status in ('unchecked','verified','blocked')),
  compliance_doc_url text,
  -- The badge is earned: an Express listing must have a photograph and a
  -- declared parcel weight, because Express pricing and route capacity depend on both.
  constraint express_needs_photo check (catalog_tier <> 'express' or primary_image_url is not null)
);
create index on products (seller_id);
create index on products (category_id) where status = 'live';
create index on products using gin (search_tsv);
create trigger products_touch before update on products for each row execute function set_updated_at();

create table product_variants (
  id             uuid primary key default gen_random_uuid(),
  product_id     uuid not null references products(id) on delete cascade,
  sku            text not null,
  option_values  jsonb not null default '{}'::jsonb,
  price_minor    bigint not null check (price_minor >= 0),
  list_price_minor bigint check (list_price_minor >= 0),
  weight_grams   integer check (weight_grams > 0),
  -- Bulk, not just weight, decides whether a parcel fits on a route.
  -- A case of formula is 6 kg and 14 litres; 22 of them do not go on a scooter.
  volume_ml      integer check (volume_ml > 0),
  parcel_class   text not null default 'small'
                   check (parcel_class in ('small','bulky','fragile','cold')),
  is_active      boolean not null default true,
  -- Who owns these units while they sit on our shelf? In the pilot the seller
  -- does: we hold consignment stock, we do not buy it. That single word decides
  -- whether the goods are an asset on our balance sheet and whether a sale has
  -- a cost of goods at all. Getting it wrong is how a marketplace reports a
  -- negative margin on every sale it makes.
  ownership      text not null default 'seller'
                   check (ownership in ('seller','afrikart')),
  unique (product_id, sku)
);
create unique index on product_variants (sku);

-- Gallery images. primary_image_url on products is a denormalised convenience;
-- this table is the truth, and the photography standard (docs/ops) says how many.
create table product_media (
  id           uuid primary key default gen_random_uuid(),
  product_id   uuid not null references products(id) on delete cascade,
  url          text not null,
  alt_text     text,
  position     smallint not null default 0,
  width_px     integer,
  height_px    integer,
  -- A photo that fails the standard must not be publishable.
  status       text not null default 'pending'
                 check (status in ('pending','approved','rejected')),
  reviewed_by  uuid references users(id),
  created_at   timestamptz not null default now()
);
create index on product_media (product_id, position);

-- ---------------------------------------------------------------------------
-- INVENTORY: movements are the truth, on_hand is a cache
-- ---------------------------------------------------------------------------
create table inventory_movements (
  id          bigserial primary key,
  variant_id  uuid not null references product_variants(id),
  delta       integer not null check (delta <> 0),   -- +received, -sold, +returned
  reason      text not null check (reason in
                ('received','sold','returned','damaged','lost','adjusted','transfer_in','transfer_out')),
  ref_type    text,                                   -- 'order', 'grn', 'stocktake'
  ref_id      uuid,
  note        text,
  created_by  uuid references users(id),
  created_at  timestamptz not null default now()
);
create index on inventory_movements (variant_id, created_at desc);
create trigger inventory_movements_immutable
  before update or delete on inventory_movements
  for each row execute function forbid_mutation();

create table inventory_levels (
  variant_id      uuid primary key references product_variants(id) on delete cascade,
  on_hand         integer not null default 0 check (on_hand >= 0),
  reserved        integer not null default 0 check (reserved >= 0),
  reorder_point   integer not null default 12,
  -- Without a bin location a pick takes four minutes and gets the wrong size.
  -- With one, the pick list sorts the walk.
  bin_code        text,                              -- 'B3-04'
  pick_sequence   integer,
  updated_at      timestamptz not null default now(),
  -- Selling the same unit to two customers is worse than a stockout.
  constraint not_oversold check (on_hand >= reserved)
);

-- ---------------------------------------------------------------------------
-- ORDERS
-- ---------------------------------------------------------------------------
-- Human-facing order numbers. A sequence, not a count(): two customers
-- checking out in the same second must never receive the same number.
create sequence order_number_seq start 26001;

create table orders (
  id                  uuid primary key default gen_random_uuid(),
  order_number        text unique not null            -- AK-26001, human-facing
                        default ('AK-' || nextval('order_number_seq')::text),
  user_id             uuid not null references users(id),
  status              text not null default 'pending_payment'
                        check (status in ('pending_payment','placed','packed','dispatched',
                                          'delivered','cancelled','returned','refunded')),
  currency            char(3) not null default 'BWP',
  subtotal_minor      bigint not null check (subtotal_minor >= 0),
  delivery_minor      bigint not null default 0 check (delivery_minor >= 0),
  cod_fee_minor       bigint not null default 0 check (cod_fee_minor >= 0),
  discount_minor      bigint not null default 0 check (discount_minor >= 0),
  vat_minor           bigint not null default 0 check (vat_minor >= 0),
  total_minor         bigint not null check (total_minor >= 0),
  -- Snapshot, not a foreign key. A customer moving house must not rewrite
  -- the delivery record of a past order.
  shipping_address    jsonb not null,
  delivery_method     text not null,
  placed_at           timestamptz,
  cancelled_at        timestamptz,
  cancellation_reason text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint totals_add_up check (
    total_minor = subtotal_minor + delivery_minor + cod_fee_minor - discount_minor
  )
);
create index on orders (user_id, created_at desc);
create index on orders (status) where status not in ('delivered','cancelled','refunded');
create trigger orders_touch before update on orders for each row execute function set_updated_at();

create table order_items (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references orders(id) on delete restrict,
  variant_id            uuid references product_variants(id),   -- may be null if delisted
  seller_id             uuid not null references sellers(id),
  -- Snapshots: the sale is a fact, including the words used to sell it.
  title_snapshot        text not null,
  sku_snapshot          text,
  unit_price_minor      bigint not null check (unit_price_minor >= 0),
  quantity              integer not null check (quantity > 0),
  line_subtotal_minor   bigint not null check (line_subtotal_minor >= 0),
  vat_rate_bps          integer not null default 1400,
  vat_minor             bigint not null default 0,
  commission_bps        integer not null,
  fulfilment_bps        integer not null default 0,
  commission_minor      bigint not null default 0,
  fulfilment_minor      bigint not null default 0,
  seller_payable_minor  bigint not null default 0,
  status                text not null default 'active'
                          check (status in ('active','cancelled','returned')),
  constraint line_math check (line_subtotal_minor = unit_price_minor * quantity)
);
create index on order_items (order_id);
create index on order_items (seller_id, status);

-- Append-only event trail. This becomes the training data for exception
-- handling, and the only defensible record in a dispute.
create table order_events (
  id          bigserial primary key,
  order_id    uuid not null references orders(id) on delete cascade,
  event       text not null,
  detail      text,
  actor_type  text not null default 'system' check (actor_type in ('system','customer','seller','rider','staff')),
  actor_id    uuid,
  created_at  timestamptz not null default now()
);
create index on order_events (order_id, created_at);
create trigger order_events_immutable before update or delete on order_events
  for each row execute function forbid_mutation();

-- ---------------------------------------------------------------------------
-- PAYMENTS
-- ---------------------------------------------------------------------------
create table payments (
  id                 uuid primary key default gen_random_uuid(),
  order_id           uuid not null references orders(id),
  provider           text not null,                  -- 'dpo','flutterwave','orange','myzaka'
  provider_ref       text,
  method             text not null check (method in
                       ('card','orange_money','myzaka','smega','cod','bank_transfer')),
  amount_minor       bigint not null check (amount_minor > 0),
  currency           char(3) not null default 'BWP',
  -- Our state is the truth; the provider's webhook is how we learn it changed.
  status             text not null default 'initiated'
                       check (status in ('initiated','authorised','captured','failed','refunded','partially_refunded')),
  provider_fee_minor bigint not null default 0,
  failure_code       text,
  authorised_at      timestamptz,
  captured_at        timestamptz,
  created_at         timestamptz not null default now()
);
create index on payments (order_id);
create unique index payments_provider_ref on payments (provider, provider_ref) where provider_ref is not null;

create table refunds (
  id             uuid primary key default gen_random_uuid(),
  payment_id     uuid not null references payments(id),
  order_id       uuid not null references orders(id),
  amount_minor   bigint not null check (amount_minor > 0),
  reason         text not null,
  status         text not null default 'pending'
                   check (status in ('pending','processing','completed','failed')),
  -- A mobile-money reversal is manual and slow; a store credit is instant.
  -- Offering both, and paying the difference, is cheaper than a bad review.
  channel        text not null default 'original_method'
                   check (channel in ('original_method','store_credit','bank_transfer')),
  credited_minor  bigint not null default 0,        -- instant, always
  sla_due_at     timestamptz,
  provider_ref   text,
  requested_by   uuid references users(id),
  completed_at   timestamptz,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- SUBSCRIPTIONS — and why mobile money makes them a reminder, not a debit
-- Orange Money and MyZaka are push payments: the customer authorises each
-- one. There is no mandate to pull. A subscription here is a scheduled
-- request, not an automatic charge, and the schema has to admit that.
-- ---------------------------------------------------------------------------
create table subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references users(id) on delete cascade,
  address_id      uuid references addresses(id),
  plan_name       text not null,
  items           jsonb not null,                   -- [{variant_id, quantity}]
  interval_days   integer not null default 30 check (interval_days between 7 and 90),
  payment_mode    text not null default 'push_request'
                    check (payment_mode in ('card_token','push_request')),
  next_charge_at  date not null,
  status          text not null default 'active'
                    check (status in ('active','paused','cancelled','churned')),
  discount_bps    integer not null default 500,
  consecutive_paid integer not null default 0,
  last_request_at timestamptz,
  created_at      timestamptz not null default now()
);
create index on subscriptions (status, next_charge_at);

create table subscription_charges (
  id               uuid primary key default gen_random_uuid(),
  subscription_id  uuid not null references subscriptions(id) on delete cascade,
  period_start     date not null,
  order_id         uuid references orders(id),
  amount_minor     bigint not null default 0,
  status           text not null default 'requested'
                     check (status in ('requested','paid','skipped','failed','expired')),
  requested_at     timestamptz not null default now(),
  resolved_at      timestamptz,
  unique (subscription_id, period_start)
);

-- ---------------------------------------------------------------------------
-- ANALYTICS — eight events, not a data lake
-- Amazon's flywheel turns on measurement. Ours needs to know five things:
-- what was viewed, what was searched for and not found, what went in a cart,
-- what was abandoned, and what was delivered. Anything else can wait.
-- ---------------------------------------------------------------------------
create table analytics_events (
  id          bigserial primary key,
  name        text not null check (name in (
                'product_view','search','search_zero_results','add_to_cart',
                'checkout_start','order_placed','order_delivered','order_failed')),
  session_id  text,
  user_id     uuid references users(id),
  props       jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index on analytics_events (name, occurred_at desc);
create index on analytics_events (occurred_at desc);

-- ---------------------------------------------------------------------------
-- PROCUREMENT — where the cash cycle is won or lost
-- Every 30 days of supplier terms is free working capital. It is a negotiated
-- asset and it gets tracked like one.
-- ---------------------------------------------------------------------------
create table suppliers (
  id                 uuid primary key default gen_random_uuid(),
  name               text not null,
  country            char(2) not null default 'BW',   -- 'ZA' for SACU sourcing
  currency           char(3) not null default 'BWP',
  payment_terms_days integer not null default 0 check (payment_terms_days between 0 and 120),
  lead_time_days     integer not null default 7,
  min_order_minor    bigint not null default 0,
  contact_name       text,
  contact_phone      text,
  contact_email      citext,
  is_active          boolean not null default true,
  notes              text,
  created_at         timestamptz not null default now()
);

create table purchase_orders (
  id                 uuid primary key default gen_random_uuid(),
  po_number          text unique not null,             -- PO-2026-0001
  supplier_id        uuid not null references suppliers(id),
  status             text not null default 'draft'
                       check (status in ('draft','ordered','in_transit','received','cancelled')),
  ordered_at         timestamptz,
  received_at        timestamptz,
  expected_at        date,
  currency           char(3) not null default 'BWP',
  exchange_rate      numeric(12,6) not null default 1,
  subtotal_minor     bigint not null default 0,
  freight_minor      bigint not null default 0,
  duty_minor         bigint not null default 0,
  total_minor        bigint not null default 0,
  -- Snapshotted from the supplier at order time: terms change, history must not.
  payment_terms_days integer not null default 0,
  due_at             date,
  paid_at            timestamptz,
  -- 'afrikart' = we bought it (inventory asset, COGS on sale).
  -- 'seller'   = consignment: the seller's goods on our shelf, the seller's cost.
  inventory_owner    text not null default 'afrikart'
                       check (inventory_owner in ('afrikart','seller')),
  created_by         uuid references users(id),
  created_at         timestamptz not null default now()
);
create index on purchase_orders (supplier_id, status);
create index on purchase_orders (due_at) where paid_at is null;

create table purchase_order_lines (
  id             uuid primary key default gen_random_uuid(),
  purchase_order_id uuid not null references purchase_orders(id) on delete cascade,
  variant_id     uuid references product_variants(id),
  description    text,
  quantity       integer not null check (quantity > 0),
  unit_cost_minor bigint not null check (unit_cost_minor >= 0)
);

-- Stock we hold but do not own. This is deliberately NOT on the balance sheet:
-- counting a seller's goods as our asset inflates the company and makes every
-- ratio a lie. It is here because the warehouse still has to count it.
create view consignment_stock_value as
select v.id as variant_id, v.sku, p.title, s.trading_name as seller,
       coalesce(l.on_hand, 0) as on_hand,
       coalesce(avg_cost.unit_cost_minor, 0) as seller_unit_cost_minor,
       coalesce(l.on_hand, 0) * coalesce(avg_cost.unit_cost_minor, 0) as seller_value_minor
from product_variants v
join products p on p.id = v.product_id
join sellers s on s.id = p.seller_id
left join inventory_levels l on l.variant_id = v.id
left join lateral (
  select round(sum(pol.quantity * pol.unit_cost_minor)::numeric / nullif(sum(pol.quantity), 0))::bigint
           as unit_cost_minor
    from purchase_order_lines pol
    join purchase_orders po on po.id = pol.purchase_order_id
   where pol.variant_id = v.id and po.status = 'received'
) avg_cost on true
where v.ownership = 'seller';

-- What we owe suppliers right now, and when. The mirror of seller payouts.
create view supplier_payables as
select
  s.id                                    as supplier_id,
  s.name,
  s.payment_terms_days,
  coalesce(sum(po.total_minor) filter (where po.paid_at is null), 0) as outstanding_minor,
  min(po.due_at) filter (where po.paid_at is null)                    as next_due
from suppliers s
left join purchase_orders po on po.supplier_id = s.id and po.status in ('ordered','in_transit','received')
group by s.id, s.name, s.payment_terms_days;

-- ---------------------------------------------------------------------------
-- THE LEDGER  (rule 3: append-only, double-entry, balances to zero)
-- ---------------------------------------------------------------------------
create table chart_of_accounts (
  code  text primary key,
  name  text not null,
  type  text not null check (type in ('asset','liability','equity','revenue','expense'))
);
insert into chart_of_accounts (code, name, type) values
  ('1000','Cash on hand (rider floats)','asset'),
  ('1010','Bank','asset'),
  ('1020','PSP receivable','asset'),
  ('1100','Inventory','asset'),
  ('1110','Packaging stock','asset'),
  ('2000','Customer prepayments','liability'),
  ('2010','Seller payable','liability'),
  ('2020','VAT payable','liability'),
  -- Packaging used before it was reordered: a real debt to a real supplier, not
  -- a negative stock figure pretending the box was free.
  ('2030','Packaging accrual','liability'),
  -- What a rider has earned and not yet been paid for the run they just did.
  ('2040','Rider payable','liability'),
  ('3000','Retained earnings','equity'),
  ('4000','Commission revenue','revenue'),
  ('4010','Fulfilment revenue','revenue'),
  ('4020','Delivery revenue','revenue'),
  ('4030','Cod handling revenue','revenue'),
  ('5000','Cost of goods sold','expense'),
  ('5010','Courier and last mile','expense'),
  ('5020','Payment processing fees','expense'),
  ('5030','Packaging','expense'),
  ('5040','Refunds and claims','expense'),
  ('5050','Marketing','expense'),
  ('5060','Payroll','expense'),
  ('5070','Occupancy and utilities','expense'),
  ('5080','Inventory shrinkage','expense');

create table ledger_transactions (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,              -- 'sale','capture','refund','payout','adjustment'
  ref_type    text,                       -- 'order','payout','refund'
  ref_id      uuid,
  occurred_at timestamptz not null default now(),
  memo        text,
  created_by  uuid references users(id)
);

create table ledger_entries (
  id             bigserial primary key,
  transaction_id uuid not null references ledger_transactions(id) on delete restrict,
  account_code   text not null references chart_of_accounts(code),
  -- Optional dimension. Without this, seller payable cannot be derived and we
  -- would be back to maintaining a balance column that drifts.
  seller_id      uuid references sellers(id),
  debit_minor    bigint not null default 0 check (debit_minor  >= 0),
  credit_minor   bigint not null default 0 check (credit_minor >= 0),
  currency       char(3) not null default 'BWP',
  created_at     timestamptz not null default now(),
  -- Exactly one side of every entry is populated.
  constraint one_side check (
    (debit_minor > 0 and credit_minor = 0) or (credit_minor > 0 and debit_minor = 0)
  )
);
create index on ledger_entries (account_code, created_at);
create index on ledger_entries (transaction_id);
create index on ledger_entries (seller_id, account_code) where seller_id is not null;
create trigger ledger_entries_immutable before update or delete on ledger_entries
  for each row execute function forbid_mutation();

-- The constraint that makes it a real ledger. Deferred, so a transaction can
-- be posted in pieces inside one database transaction.
create or replace function assert_ledger_balances() returns trigger as $$
declare
  d bigint; c bigint;
begin
  select coalesce(sum(debit_minor),0), coalesce(sum(credit_minor),0) into d, c
  from ledger_entries where transaction_id = new.transaction_id;
  if d <> c then
    raise exception 'Unbalanced ledger transaction %: debits % credits %',
      new.transaction_id, d, c;
  end if;
  return null;
end $$ language plpgsql;

create constraint trigger ledger_must_balance
  after insert on ledger_entries
  deferrable initially deferred
  for each row execute function assert_ledger_balances();

-- Everything we owe a seller, right now, derived — never stored as a column.
create view seller_balances as
select
  s.id                                as seller_id,
  s.trading_name,
  coalesce(sum(e.credit_minor - e.debit_minor), 0) as payable_minor
from sellers s
left join ledger_entries e
  on e.seller_id = s.id and e.account_code = '2010'
group by s.id, s.trading_name;

-- ---------------------------------------------------------------------------
-- SELLER PAYOUTS
-- ---------------------------------------------------------------------------
create table seller_payouts (
  id                 uuid primary key default gen_random_uuid(),
  seller_id          uuid not null references sellers(id),
  period_start       date not null,
  period_end         date not null,
  gross_minor        bigint not null default 0,
  commission_minor   bigint not null default 0,
  fulfilment_minor   bigint not null default 0,
  refunds_minor      bigint not null default 0,
  -- Consigned stock that vanished on our shelf and that we chose to make good.
  -- It adds to what the seller receives, and it is not a sale, so it cannot sit
  -- inside gross without making the statement a fiction.
  compensation_minor bigint not null default 0,
  net_minor          bigint not null,
  status             text not null default 'draft'
                       check (status in ('draft','approved','paid','failed')),
  bank_reference     text,
  paid_at            timestamptz,
  approved_by        uuid references users(id),
  created_at         timestamptz not null default now(),
  constraint payout_math check
    (net_minor = gross_minor - commission_minor - fulfilment_minor - refunds_minor + compensation_minor),
  unique (seller_id, period_start, period_end)
);

-- Which order lines make up which payout. Without this the statement is a
-- number we assert rather than a set of facts the seller can check.
create table payout_items (
  payout_id     uuid not null references seller_payouts(id) on delete cascade,
  order_item_id uuid not null references order_items(id),
  amount_minor  bigint not null,
  primary key (payout_id, order_item_id),
  -- An order line can only ever be paid once.
  unique (order_item_id)
);

-- A stocktake is a session, not a single payload.
--
-- A warehouse counts over two hours with two people and a coffee break, and a
-- count that only exists inside one HTTP request cannot survive that. The
-- session also makes the count auditable afterwards: who opened it, who counted
-- each line, what the system believed at the time, and what a second counter
-- said when the first number looked wrong.
create sequence stocktake_number_seq start 1;

create table stocktake_sessions (
  id              uuid primary key default gen_random_uuid(),
  reference       text not null unique,          -- 'ST-2026-0001'
  status          text not null default 'open'
                    check (status in ('open','applied','abandoned')),
  opened_by       uuid references users(id),
  opened_at       timestamptz not null default now(),
  closed_by       uuid references users(id),
  closed_at       timestamptz,
  note            text,
  -- What applying it actually did, kept so the session is a record and not a form.
  lines_counted   integer,
  lines_adjusted  integer,
  shrinkage_minor bigint,
  constraint closed_session_has_a_time check ((status = 'open') = (closed_at is null))
);
create index on stocktake_sessions (status, opened_at desc);

create table stocktake_entries (
  id               uuid primary key default gen_random_uuid(),
  session_id       uuid not null references stocktake_sessions(id) on delete cascade,
  variant_id       uuid not null references product_variants(id),
  sku              text not null,
  -- Frozen when the line was first counted: the number the person was comparing
  -- against. If stock moves while the count is open, that difference is a fact
  -- about the count, not something to overwrite.
  system_quantity  integer not null check (system_quantity >= 0),
  counted_quantity integer not null check (counted_quantity >= 0),
  counted_by       uuid references users(id),
  counted_at       timestamptz not null default now(),
  -- A second look at the same shelf, because the first number disagreed with the
  -- system. Both are kept; applying uses the recount and reports the gap.
  recount_quantity integer check (recount_quantity >= 0),
  recount_by       uuid references users(id),
  recount_at       timestamptz,
  unique (session_id, variant_id)
);

-- PACKAGING: a box is a cost per parcel, and the fulfilment fee has to cover it
--
-- 5030 existed from the first chart of accounts and nothing ever posted to it,
-- which meant every "fulfilment margin" in this system was a margin with the box
-- left out. Packaging is bought in bulk (Dr 1110 / Cr Bank), consumed per parcel
-- (Dr 5030 / Cr 1110), and — when we run out and pack anyway, because the
-- customer is at the door — the shortfall is a liability (Cr 2030) rather than
-- negative stock.
create table packaging_materials (
  code            text primary key,               -- 'BOX-M', 'MAILER-S', 'GEL-ICE'
  name            text not null,
  kind            text not null check (kind in ('box','mailer','filler','wrap','label','cold')),
  -- Pilot quotes, not a rate card. Replace with the supplier's invoice lines.
  unit_cost_minor bigint not null check (unit_cost_minor >= 0),
  on_hand         integer not null default 0 check (on_hand >= 0),
  is_active       boolean not null default true
);

-- What goes into a parcel, by the parcel class the warehouse already assigns.
create table packaging_recipe (
  parcel_class  text not null check (parcel_class in ('small','bulky','fragile','cold')),
  material_code text not null references packaging_materials(code),
  quantity      integer not null check (quantity > 0),
  primary key (parcel_class, material_code)
);

create table packaging_purchases (
  id              uuid primary key default gen_random_uuid(),
  material_code   text not null references packaging_materials(code),
  quantity        integer not null check (quantity > 0),
  unit_cost_minor bigint not null check (unit_cost_minor >= 0),
  total_minor     bigint not null check (total_minor >= 0),
  purchased_by    uuid references users(id),
  purchased_at    timestamptz not null default now(),
  note            text
);

create table packaging_consumptions (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null unique references orders(id),
  parcel_class   text not null,
  parcels        integer not null check (parcels > 0),
  cost_minor     bigint not null check (cost_minor >= 0),
  -- The part of the cost we could not cover from stock: boxes used before they
  -- were reordered. Posted to 2030, because we owe the supplier.
  shortfall_minor bigint not null default 0 check (shortfall_minor >= 0),
  pieces         jsonb not null default '[]'::jsonb,
  packed_by      uuid references users(id),
  packed_at      timestamptz not null default now()
);

-- Consigned stock that a count could not find.
--
-- The goods were never our asset, so a loss is not automatically our expense —
-- and it is not automatically the seller's cash either. Somebody has to decide,
-- and the decision has to be recorded next to the evidence rather than implied
-- by a missing number. `seller_absorbs` posts nothing: we are not their insurer,
-- and inventing an entry for stock we never carried would put a loss in our
-- books that we never suffered. `afrikart_compensates` does post: Dr 5080 /
-- Cr 2010, because then we chose to take the loss onto our own P&L.
create table stocktake_incidents (
  id              uuid primary key default gen_random_uuid(),
  movement_id     bigint not null unique references inventory_movements(id),
  seller_id       uuid not null references sellers(id),
  variant_id      uuid not null references product_variants(id),
  sku             text not null,
  quantity_lost   integer not null check (quantity_lost > 0),
  -- Null only where no purchase has ever landed; the incident is still recorded
  -- and flagged, because an uncosted loss is still a loss.
  unit_cost_minor bigint check (unit_cost_minor >= 0),
  value_minor     bigint check (value_minor >= 0),
  decision        text not null default 'open'
                    check (decision in ('open','seller_absorbs','afrikart_compensates')),
  decided_by      uuid references users(id),
  decided_at      timestamptz,
  -- Which payout made it good. One incident is compensated once.
  payout_id       uuid references seller_payouts(id),
  note            text,
  created_at      timestamptz not null default now(),
  constraint incident_decision_needs_a_time check ((decision = 'open') = (decided_at is null)),
  constraint compensated_incident_needs_evidence
    check (decision <> 'afrikart_compensates' or (value_minor is not null and value_minor > 0))
);
create index on stocktake_incidents (seller_id, decision);
create index on stocktake_incidents (payout_id) where payout_id is not null;

-- ---------------------------------------------------------------------------
-- DELIVERY — the moat lives in these tables, not in the storefront
-- ---------------------------------------------------------------------------
create table riders (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid unique not null references users(id),
  vehicle            text not null check (vehicle in ('scooter','bike','car','van')),
  plate              text,
  -- A rider can only hold so much cash before the risk is unacceptable.
  cash_float_limit_minor bigint not null default 300000,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now()
);

-- `addresses` is defined before `riders`, so its verifier FK is attached here
-- rather than inline. A forward reference inside CREATE TABLE would make the
-- schema unloadable in file order — which is exactly how it should be tested.
alter table addresses
  add constraint addresses_verified_by_fk
  foreign key (verified_by) references riders(id);

create table routes (
  id              uuid primary key default gen_random_uuid(),
  name            text not null,               -- 'Gaborone West 1'
  city            text not null,
  suburbs         text[] not null default '{}',
  weekday         smallint check (weekday between 0 and 6),
  -- Capacity is a hard number, not a feeling. Above this, first-attempt
  -- success falls and the route runs past eleven hours.
  daily_capacity  integer not null default 22 check (daily_capacity between 4 and 40),
  -- Drops are only one constraint. The other two are how much it weighs and
  -- how much it takes up, which is why a route has a vehicle class.
  vehicle_class   text not null default 'scooter'
                    check (vehicle_class in ('scooter','car','bakkie','van')),
  max_weight_grams bigint not null default 40000,      -- ~40 kg on a scooter
  max_volume_ml    bigint not null default 80000,      -- ~80 litres of panniers
  serves_express  boolean not null default true,
  is_active       boolean not null default true,
  unique (name, city)
);

-- The order-capture guard. When a route is full the storefront must offer the
-- NEXT AVAILABLE DAY rather than accepting an order it cannot deliver. This
-- function is what the checkout quote calls.
create table delivery_failure_reasons (
  code     text primary key,              -- 'NO_ANSWER','WRONG_ADDRESS','REFUSED','NOT_HOME'
  label    text not null,
  category text not null check (category in ('customer','address','cash','damage','operational'))
);
insert into delivery_failure_reasons (code,label,category) values
  ('NO_ANSWER','Customer did not answer','customer'),
  ('NOT_HOME','Nobody at the address','customer'),
  ('WRONG_ADDRESS','Address could not be found','address'),
  ('NO_LANDMARK','No landmark or gate number','address'),
  ('REFUSED','Customer refused the item','customer'),
  ('NO_CASH','Customer could not pay on delivery','cash'),
  ('DAMAGED','Item damaged in transit','damage'),
  ('WRONG_ITEM','Wrong item packed','operational'),
  ('WEATHER','Weather blocked the route','operational');

create table deliveries (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null references orders(id),
  route_id              uuid references routes(id),
  rider_id              uuid references riders(id),
  sequence              integer,
  status                text not null default 'pending'
                          check (status in ('pending','assigned','out_for_delivery',
                                            'delivered','failed','rescheduled','returned')),
  attempt_count         integer not null default 0,
  scheduled_date        date,
  first_attempt_at      timestamptz,
  delivered_at          timestamptz,
  failure_reason_code   text references delivery_failure_reasons(code),
  failure_note          text,
  proof_photo_url       text,
  signature_url         text,
  -- Cash on delivery is the riskiest thing this company does. Every Pula is
  -- recorded against a delivery, a rider and a reconciliation.
  cash_collected_minor  bigint not null default 0 check (cash_collected_minor >= 0),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  constraint failed_needs_reason check (status <> 'failed' or failure_reason_code is not null)
);
create index on deliveries (order_id);
create index on deliveries (rider_id, scheduled_date);
create index on deliveries (status) where status in ('pending','assigned','out_for_delivery');
create trigger deliveries_touch before update on deliveries for each row execute function set_updated_at();

-- A run: one rider, one route, one day. The unit of cost is the trip, not the
-- order — a rider is paid for the day whether the eleventh drop happens or not.
create table last_mile_runs (
  id              uuid primary key default gen_random_uuid(),
  route_id        uuid references routes(id),
  rider_id        uuid references riders(id),
  run_date        date not null,
  -- What dispatch expected this run to carry, captured when it was opened. A
  -- plan compared against a plan recomputed at midnight is not a plan.
  planned_drops   integer check (planned_drops >= 0),
  rider_pay_minor bigint not null default 0 check (rider_pay_minor >= 0),
  fuel_minor      bigint not null default 0 check (fuel_minor >= 0),
  status          text not null default 'open' check (status in ('open','closed')),
  -- Delivered drops, and every drop attempted (delivered + failed). A failed
  -- attempt burns the same fuel as a successful one, so it is in the divisor;
  -- it just cannot be charged to a customer who did not receive anything.
  drops           integer not null default 0 check (drops >= 0),
  attempts        integer not null default 0 check (attempts >= 0),
  failed_drops    integer not null default 0 check (failed_drops >= 0),
  cost_minor      bigint not null default 0 check (cost_minor >= 0),
  -- The share of the trip that no order can carry: failed attempts and idle
  -- capacity. Kept as its own number so it never hides inside a per-drop figure.
  unattributed_minor bigint not null default 0 check (unattributed_minor >= 0),
  note            text,
  opened_at       timestamptz not null default now(),
  closed_at       timestamptz,
  closed_by       uuid references users(id)
);
create index on last_mile_runs (run_date, route_id);
create index on last_mile_runs (status) where status = 'open';

-- Cost lands on the orders that rode on the run, once each. The unique
-- constraint is the idempotency: an order cannot be charged for two runs, and
-- closing a run twice cannot double the cost of a drop.
create table last_mile_allocations (
  id             uuid primary key default gen_random_uuid(),
  run_id         uuid not null references last_mile_runs(id) on delete restrict,
  order_id       uuid not null unique references orders(id),
  amount_minor   bigint not null check (amount_minor >= 0),
  created_at     timestamptz not null default now()
);
create index on last_mile_allocations (run_id);

-- What a run costs before anyone knows what it will carry. Per vehicle class,
-- because a scooter and a bakkie are not paid the same and do not burn the same
-- fuel. The dispatch plan uses this to price a trip before it happens; a closed
-- run records what it actually cost.
create table run_rate_card (
  vehicle_class   text primary key check (vehicle_class in ('scooter','car','bakkie','van')),
  rider_pay_minor bigint not null check (rider_pay_minor >= 0),
  fuel_minor      bigint not null check (fuel_minor >= 0)
);
insert into run_rate_card (vehicle_class, rider_pay_minor, fuel_minor) values
  ('scooter', 25000, 12000),
  ('car',     32000, 18000),
  ('bakkie',  38000, 26000),
  ('van',     45000, 32000);

-- What is already promised to a route on a given day, in drops, grams and millilitres.
create or replace view route_load as
select
  d.route_id,
  d.scheduled_date,
  count(*)                                                    as drops,
  coalesce(sum(pv.weight_grams * ol.quantity), 0)             as weight_grams,
  coalesce(sum(pv.volume_ml * ol.quantity), 0)                as volume_ml
from deliveries d
join orders o             on o.id = d.order_id
join order_items ol       on ol.order_id = o.id and ol.status = 'active'
join product_variants pv  on pv.id = ol.variant_id
where d.status <> 'cancelled'
group by d.route_id, d.scheduled_date;

create or replace function route_capacity_remaining(p_route uuid, p_date date)
returns integer as $$
  select r.daily_capacity - count(d.id)
  from routes r
  left join deliveries d on d.route_id = r.id and d.scheduled_date = p_date
                          and d.status <> 'cancelled'
  where r.id = p_route
  group by r.daily_capacity;
$$ language sql stable;

-- Rider float reconciliation, daily. Rule: any variance is investigated the
-- same day, and a variance over the limit suspends the rider until resolved.
create table cash_reconciliations (
  id               uuid primary key default gen_random_uuid(),
  rider_id         uuid not null references riders(id),
  business_date    date not null,
  expected_minor   bigint not null check (expected_minor >= 0),
  counted_minor    bigint not null check (counted_minor >= 0),
  variance_minor   bigint generated always as (counted_minor - expected_minor) stored,
  deposited_at     timestamptz,
  bank_reference   text,
  reconciled_by    uuid references users(id),
  note             text,
  created_at       timestamptz not null default now(),
  unique (rider_id, business_date)
);

-- ---------------------------------------------------------------------------
-- REVIEWS, SAVED ITEMS
-- ---------------------------------------------------------------------------
create table reviews (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products(id) on delete cascade,
  user_id       uuid not null references users(id),
  order_item_id uuid references order_items(id),
  rating        smallint not null check (rating between 1 and 5),
  title         text,
  body          text,
  -- Derived from a delivered order_item, never trusted from the client.
  is_verified   boolean not null default false,
  status        text not null default 'published'
                  check (status in ('published','pending','hidden')),
  created_at    timestamptz not null default now(),
  unique (user_id, product_id)
);
create index on reviews (product_id) where status = 'published';

create table saved_items (
  user_id    uuid not null references users(id) on delete cascade,
  variant_id uuid not null references product_variants(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, variant_id)
);

-- ---------------------------------------------------------------------------
-- COMPLIANCE & PLUMBING
-- ---------------------------------------------------------------------------
-- BURS requires sequential, unbroken invoice numbering.
create sequence invoice_number_seq start 1;

create table invoices (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null unique references orders(id),
  invoice_number text not null unique default ('INV-' || lpad(nextval('invoice_number_seq')::text, 8, '0')),
  issued_at      timestamptz not null default now(),
  subtotal_minor bigint not null,
  vat_minor      bigint not null,
  total_minor    bigint not null,
  vat_rate_bps   integer not null default 1400
);
create trigger invoices_immutable before update or delete on invoices
  for each row execute function forbid_mutation();

create table idempotency_keys (
  key          text primary key,
  request_hash text not null,
  response     jsonb,
  status_code  integer,
  created_at   timestamptz not null default now(),
  expires_at   timestamptz not null default now() + interval '24 hours'
);

create table audit_log (
  id          bigserial primary key,
  actor_id    uuid references users(id),
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  before      jsonb,
  after       jsonb,
  ip          inet,
  created_at  timestamptz not null default now()
);
create index on audit_log (entity_type, entity_id, created_at desc);
create trigger audit_log_immutable before update or delete on audit_log
  for each row execute function forbid_mutation();

-- Outbox: every fact worth broadcasting is written here first, in the same
-- transaction as the change. Notifications, analytics and forecasting all
-- consume from it. One event per fact; never an event that could be derived.
create table outbox_events (
  id           bigserial primary key,
  event_type   text not null,     -- 'order.placed','delivery.failed','refund.issued'
  payload      jsonb not null,
  published_at timestamptz,
  attempts     integer not null default 0,
  created_at   timestamptz not null default now()
);
create index on outbox_events (created_at) where published_at is null;

-- ---------------------------------------------------------------------------
-- CASH: the risk we carry in riders' pockets, and the cycle we are running
-- ---------------------------------------------------------------------------
-- Physical cash that is currently with a rider and not yet deposited.
-- This is the only number in the company that can simply go missing.
create view cod_cash_in_transit as
select
  r.id                                as rider_id,
  u.full_name                         as rider_name,
  coalesce(sum(d.cash_collected_minor), 0) as cash_held_minor,
  r.cash_float_limit_minor,
  max(d.delivered_at)                 as last_delivery_at
from riders r
join users u on u.id = r.user_id
left join deliveries d
  on d.rider_id = r.id
 and d.status = 'delivered'
 and d.cash_collected_minor > 0
 and not exists (
   select 1 from cash_reconciliations cr
   where cr.rider_id = r.id and cr.business_date >= d.scheduled_date
 )
group by r.id, u.full_name, r.cash_float_limit_minor;

-- The three components of the cash conversion cycle, computed from actuals.
-- Positive = we fund growth ourselves. Negative = suppliers fund it.
create view cash_cycle as
with cogs as (
  select coalesce(sum(oi.quantity * oi.unit_price_minor), 0) as cogs_90d
  from order_items oi
  join orders o on o.id = oi.order_id
  where o.placed_at > now() - interval '90 days' and oi.status = 'active'
),
inv as (
  select coalesce(sum(il.on_hand * pv.price_minor), 0) as inventory_minor
  from inventory_levels il
  join product_variants pv on pv.id = il.variant_id
),
dpo as (
  select coalesce(avg(payment_terms_days), 0)::numeric as dpo_days
  from purchase_orders where status in ('ordered','in_transit','received')
)
select
  round(cogs.cogs_90d / 90.0, 0)                                              as daily_cogs_minor,
  round(inv.inventory_minor / nullif(cogs.cogs_90d / 90.0, 0), 1)             as dio_days,
  dpo.dpo_days                                                                 as dpo_days,
  round(inv.inventory_minor / nullif(cogs.cogs_90d / 90.0, 0) - dpo.dpo_days, 1) as cash_cycle_days
from cogs, inv, dpo;

-- ---------------------------------------------------------------------------
-- THE ONE QUERY THAT MATTERS
-- Contribution per route per week. If this is healthy, the business is healthy.
-- ---------------------------------------------------------------------------
create view route_weekly_pnl as
with base as (
  select
    d.route_id,
    date_trunc('week', coalesce(d.delivered_at, d.first_attempt_at, d.created_at)) as week,
    d.order_id,
    d.status,
    d.cash_collected_minor
  from deliveries d
  where d.route_id is not null and d.status in ('delivered', 'failed')
),
agg as (
  select
    route_id,
    week,
    count(*) filter (where status = 'delivered')                       as drops,
    count(*) filter (where status = 'failed')                          as failed_drops,
    round(100.0 * count(*) filter (where status = 'delivered')
          / nullif(count(*), 0), 1)                                    as first_attempt_pct,
    coalesce(sum(cash_collected_minor), 0)                             as cash_collected_minor,
    array_agg(distinct order_id)                                       as order_ids
  from base
  group by route_id, week
)
select
  a.route_id,
  r.name                                                            as route_name,
  a.week,
  a.drops,
  a.failed_drops,
  a.first_attempt_pct,
  -- summed separately: order-level and line-level money must never be joined
  -- to each other, or every total is multiplied by the number of line items.
  coalesce((select sum(o.subtotal_minor)  from orders o      where o.id  = any(a.order_ids)), 0) as gmv_minor,
  coalesce((select sum(o.delivery_minor)  from orders o      where o.id  = any(a.order_ids)), 0) as delivery_revenue_minor,
  coalesce((select sum(oi.commission_minor)  from order_items oi where oi.order_id = any(a.order_ids)), 0) as commission_minor,
  coalesce((select sum(oi.fulfilment_minor)  from order_items oi where oi.order_id = any(a.order_ids)), 0) as fulfilment_minor,
  a.cash_collected_minor
from agg a
join routes r on r.id = a.route_id;

-- ---------------------------------------------------------------------------
-- MARGIN PER ORDER
-- ---------------------------------------------------------------------------
-- The P&L of a single order, derived — never stored. Every figure is a ledger
-- posting made against that order, so this view cannot disagree with the books
-- in the way a second calculation would. VAT-excluded throughout, because that
-- is how the ledger holds it.
--
-- `delivery_margin_minor` is null when a delivery fee has no last-mile cost
-- posted against it: nothing posts rider cost per order yet, and a margin with
-- half its costs missing is not a margin.
create view order_margins as
select
  t.ref_id                                                            as order_id,
  o.order_number,
  o.status,
  coalesce(sum(case when e.account_code = '4000' then e.credit_minor - e.debit_minor end), 0) as commission_minor,
  coalesce(sum(case when e.account_code = '4010' then e.credit_minor - e.debit_minor end), 0) as fulfilment_minor,
  coalesce(sum(case when e.account_code = '4020' then e.credit_minor - e.debit_minor end), 0) as delivery_minor,
  coalesce(sum(case when e.account_code = '4030' then e.credit_minor - e.debit_minor end), 0) as cod_minor,
  coalesce(sum(case when e.account_code = '5000' then e.debit_minor - e.credit_minor end), 0) as cogs_minor,
  coalesce(sum(case when e.account_code = '5010' then e.debit_minor - e.credit_minor end), 0) as last_mile_minor,
  coalesce(sum(case when e.account_code = '5020' then e.debit_minor - e.credit_minor end), 0) as psp_fee_minor,
  coalesce(sum(case when e.account_code = '5030' then e.debit_minor - e.credit_minor end), 0) as packaging_minor,
  coalesce(sum(case when e.account_code = '5040' then e.debit_minor - e.credit_minor end), 0) as refund_write_off_minor,
  -- Our fees, before the delivery fee: the number an order has to clear on its
  -- own merits.
  coalesce(sum(case when e.account_code in ('4000','4010','4030') then e.credit_minor - e.debit_minor end), 0)
    - coalesce(sum(case when e.account_code in ('5000','5010','5020','5030','5040') then e.debit_minor - e.credit_minor end), 0)
                                                                      as goods_margin_minor,
  coalesce(sum(case when e.account_code in ('4000','4010','4020','4030') then e.credit_minor - e.debit_minor end), 0)
    - coalesce(sum(case when e.account_code in ('5000','5010','5020','5030','5040') then e.debit_minor - e.credit_minor end), 0)
                                                                      as net_margin_minor
from ledger_transactions t
join ledger_entries e on e.transaction_id = t.id
left join orders o on o.id = t.ref_id
where t.ref_type = 'order'
  and t.ref_id is not null
  and e.account_code in ('4000','4010','4020','4030','5000','5010','5020','5030','5040')
group by t.ref_id, o.order_number, o.status;

-- Grants are revoked in the Supabase migration, not here: `anon` and
-- `authenticated` are Supabase's roles, and the test database does not have
-- them. The migration is where row-level security lives, so the revoke lives
-- beside it.
