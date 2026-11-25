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
  is_default    boolean not null default false,
  created_at    timestamptz not null default now()
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
  is_active boolean not null default true
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
  -- A product without a real photograph must not go live. Enforced, not hoped for.
  primary_image_url text,
  search_tsv   tsvector generated always as
                 (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(brand,'') || ' ' || coalesce(description,''))) stored,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint live_product_needs_image check (status <> 'live' or primary_image_url is not null)
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
  weight_grams   integer,
  is_active      boolean not null default true,
  unique (product_id, sku)
);
create unique index on product_variants (sku);

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
  updated_at      timestamptz not null default now(),
  -- Selling the same unit to two customers is worse than a stockout.
  constraint not_oversold check (on_hand >= reserved)
);

-- ---------------------------------------------------------------------------
-- ORDERS
-- ---------------------------------------------------------------------------
create table orders (
  id                  uuid primary key default gen_random_uuid(),
  order_number        text unique not null,           -- AK-24001, human-facing
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
  provider_ref   text,
  requested_by   uuid references users(id),
  completed_at   timestamptz,
  created_at     timestamptz not null default now()
);

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
  ('2000','Customer prepayments','liability'),
  ('2010','Seller payable','liability'),
  ('2020','VAT payable','liability'),
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
  ('5070','Occupancy and utilities','expense');

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

-- Everything we owe a seller, right now, derived — never stored.
create view seller_balances as
select
  s.id as seller_id,
  s.trading_name,
  coalesce(sum(e.credit_minor - e.debit_minor) filter (where e.account_code = '2010'), 0) as payable_minor
from sellers s
left join order_items oi on oi.seller_id = s.id
left join ledger_transactions lt on lt.ref_id = oi.order_id and lt.ref_type = 'order'
left join ledger_entries e on e.transaction_id = lt.id
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
  net_minor          bigint not null,
  status             text not null default 'draft'
                       check (status in ('draft','approved','paid','failed')),
  bank_reference     text,
  paid_at            timestamptz,
  approved_by        uuid references users(id),
  created_at         timestamptz not null default now(),
  constraint payout_math check (net_minor = gross_minor - commission_minor - fulfilment_minor - refunds_minor),
  unique (seller_id, period_start, period_end)
);

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

create table routes (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,               -- 'Gaborone West 1'
  city       text not null,
  suburbs    text[] not null default '{}',
  weekday    smallint check (weekday between 0 and 6),
  is_active  boolean not null default true,
  unique (name, city)
);

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
-- THE ONE QUERY THAT MATTERS
-- Contribution per route per week. If this is healthy, the business is healthy.
-- ---------------------------------------------------------------------------
create view route_weekly_pnl as
select
  r.id                                as route_id,
  r.name                              as route_name,
  date_trunc('week', d.delivered_at)  as week,
  count(*) filter (where d.status = 'delivered')            as drops,
  count(*) filter (where d.status = 'failed')               as failed_drops,
  round(100.0 * count(*) filter (where d.status = 'delivered')
        / nullif(count(*), 0), 1)                           as first_attempt_pct,
  coalesce(sum(o.subtotal_minor), 0)                        as gmv_minor,
  coalesce(sum(o.delivery_minor), 0)                        as delivery_revenue_minor,
  coalesce(sum(oi.commission_minor), 0)                     as commission_minor,
  coalesce(sum(oi.fulfilment_minor), 0)                     as fulfilment_minor,
  coalesce(sum(d.cash_collected_minor), 0)                  as cash_collected_minor
from routes r
join deliveries d on d.route_id = r.id
join orders o     on o.id = d.order_id
left join order_items oi on oi.order_id = o.id
where d.delivered_at is not null
group by r.id, r.name, date_trunc('week', d.delivered_at);
