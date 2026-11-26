/**
 * Last mile: what it actually cost to deliver (AFR-53).
 *
 * The gap this closes was visible in `docs/018`: the delivery fee was posted as
 * revenue and no cost ever followed it, so every order's `netMarginMinor` was an
 * upper bound. The report said so rather than flattering the business.
 *
 * The unit of cost is a **run** — one rider, one route, one day. A rider is paid
 * for the day whether the eleventh drop happens or not, and fuel is bought by the
 * litre, not by the parcel. So cost is captured per run, then divided across the
 * drops that actually rode on it. Dividing per drop is the honest default: it is
 * the only basis a route plan can be judged on, and it makes a long route look
 * expensive in exactly the way it is.
 *
 * Everything posts at close, inside one transaction:
 *
 *     Dr 5010 Courier and last mile   (this order's share)
 *     Cr 2040 Rider payable           (earned, not yet paid)
 *
 * A run that delivered nothing cannot be closed: dividing by zero drops is how a
 * cost disappears, and a cost that disappears is worse than one that is late.
 */
import { AppError } from './errors.js';
import { post, ACCOUNTS, balance } from './ledger.js';

const num = (v) => Number(v ?? 0);

/** Split `totalMinor` across `n` drops so the parts add up exactly. */
export function splitPerDrop(totalMinor, drops) {
  if (!Number.isSafeInteger(totalMinor) || totalMinor < 0) {
    throw new AppError(422, 'BAD_RUN_COST', 'A run cost must be a non-negative whole number of thebe.', {
      field: 'riderPayMinor',
    });
  }
  if (!Number.isSafeInteger(drops) || drops < 1) {
    throw new AppError(422, 'NO_DROPS', 'A run with no drops cannot be costed.', { field: 'drops' });
  }
  const base = Math.floor(totalMinor / drops);
  const remainder = totalMinor - base * drops;
  // The remainder is thebe, so it is distributed one at a time and the earliest
  // drops carry it. Rounding that leaves a stray 3 thebe unallocated is how a
  // ledger slowly stops tying out.
  return Array.from({ length: drops }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** Open a run. Nothing is posted until it closes, because nothing is known. */
export async function openRun(db, { routeId = null, riderId = null, runDate, riderPayMinor = 0, fuelMinor = 0, note = null } = {}) {
  if (!runDate) throw new AppError(422, 'RUN_DATE_REQUIRED', 'A run needs a date.', { field: 'runDate' });
  const res = await db.query(
    `insert into last_mile_runs (route_id, rider_id, run_date, rider_pay_minor, fuel_minor, note)
     values ($1, $2, $3, $4, $5, $6)
     returning id, run_date, status, rider_pay_minor, fuel_minor, cost_minor`,
    [routeId, riderId, runDate, riderPayMinor, fuelMinor, note],
  );
  const run = res.rows[0];
  return {
    runId: run.id,
    runDate: run.run_date,
    status: run.status,
    costMinor: num(run.rider_pay_minor) + num(run.fuel_minor),
    drops: 0,
    perDropMinor: null,
  };
}

/**
 * Close a run: find the drops that rode on it, divide the cost, post each
 * order's share, and mark the run done. Idempotent by refusal — a closed run
 * cannot be closed again, because a second close would charge every customer
 * twice for one trip.
 */
export async function closeRun(db, { runId, actorId = null } = {}) {
  return db.transaction(async (tx) => {
    const runRes = await tx.query(
      `select id, route_id, rider_id, run_date, rider_pay_minor, fuel_minor, status
         from last_mile_runs where id = $1 for update`,
      [runId],
    );
    const run = runRes.rows[0];
    if (!run) throw new AppError(404, 'RUN_NOT_FOUND', 'That run does not exist.');
    if (run.status === 'closed') {
      throw new AppError(409, 'RUN_CLOSED', 'That run has already been closed and costed.');
    }

    const totalMinor = num(run.rider_pay_minor) + num(run.fuel_minor);
    if (totalMinor === 0) {
      throw new AppError(422, 'RUN_HAS_NO_COST', 'A run with no rider pay and no fuel has nothing to allocate.');
    }

    // The drops that actually rode: delivered, on this route and rider if the
    // run names them, and on the run's date by the day the parcel arrived (or
    // the day it was scheduled for, when the two disagree).
    const dropsRes = await tx.query(
      `select d.order_id, o.order_number, d.delivered_at
         from deliveries d
         join orders o on o.id = d.order_id
        where d.status = 'delivered'
          and ($1::uuid is null or d.route_id = $1)
          and ($2::uuid is null or d.rider_id = $2)
          and coalesce(d.delivered_at::date, d.scheduled_date) = $3
          and not exists (select 1 from last_mile_allocations a where a.order_id = d.order_id)
        order by d.delivered_at nulls last, o.order_number`,
      [run.route_id, run.rider_id, run.run_date],
    );

    const drops = dropsRes.rows.length;
    if (drops === 0) {
      throw new AppError(
        422,
        'NO_DROPS',
        'No delivered orders rode on this run on that date, so there is nothing to cost.',
        { field: 'runDate' },
      );
    }

    const shares = splitPerDrop(totalMinor, drops);
    const allocations = [];
    for (let i = 0; i < drops; i += 1) {
      const drop = dropsRes.rows[i];
      const amountMinor = shares[i];
      await tx.query(
        `insert into last_mile_allocations (run_id, order_id, amount_minor) values ($1, $2, $3)`,
        [run.id, drop.order_id, amountMinor],
      );
      if (amountMinor > 0) {
        await post(tx, {
          kind: 'last_mile',
          refType: 'order',
          refId: drop.order_id,
          memo: `last mile ${run.run_date}`,
          entries: [
            { accountCode: ACCOUNTS.LAST_MILE, debit: amountMinor },
            { accountCode: ACCOUNTS.RIDER_PAYABLE, credit: amountMinor },
          ],
        });
      }
      allocations.push({ orderNumber: drop.order_number, amountMinor });
    }

    await tx.query(
      `update last_mile_runs
          set status = 'closed', drops = $2, cost_minor = $3, closed_at = now(), closed_by = $4
        where id = $1`,
      [run.id, drops, totalMinor, actorId],
    );

    return {
      runId: run.id,
      runDate: run.run_date,
      status: 'closed',
      drops,
      totalMinor,
      perDropMinor: shares[0],
      allocatedMinor: shares.reduce((a, v) => a + v, 0),
      allocations,
    };
  });
}

/**
 * The last-mile ledger: what the runs cost, what the delivery fees earned, and
 * how many delivered orders are still carrying no cost at all.
 */
export async function lastMileReport(db, { from = null, to = null } = {}) {
  const args = [];
  const where = [];
  if (from) {
    args.push(from);
    where.push(`run_date >= $${args.length}::date`);
  }
  if (to) {
    args.push(to);
    where.push(`run_date <= $${args.length}::date`);
  }

  const runsRes = await db.query(
    `select r.id, r.run_date, r.status, r.drops, r.cost_minor, r.rider_pay_minor, r.fuel_minor,
            rt.name as route_name, u.full_name as rider_name
       from last_mile_runs r
       left join routes rt on rt.id = r.route_id
       left join riders rd on rd.id = r.rider_id
       left join users u on u.id = rd.user_id
      ${where.length ? `where ${where.join(' and ')}` : ''}
      order by r.run_date desc, r.opened_at desc`,
    args,
  );

  const runs = runsRes.rows.map((r) => ({
    runId: r.id,
    runDate: r.run_date,
    status: r.status,
    routeName: r.route_name,
    riderName: r.rider_name,
    drops: Number(r.drops),
    costMinor: num(r.cost_minor),
    riderPayMinor: num(r.rider_pay_minor),
    fuelMinor: num(r.fuel_minor),
    perDropMinor: Number(r.drops) > 0 ? Math.floor(num(r.cost_minor) / Number(r.drops)) : null,
  }));

  const closed = runs.filter((r) => r.status === 'closed');
  const costMinor = closed.reduce((a, r) => a + r.costMinor, 0);
  const drops = closed.reduce((a, r) => a + r.drops, 0);

  const uncostedRes = await db.query(
    `select o.order_number, coalesce(d.delivered_at::date, d.scheduled_date) as run_date
       from deliveries d
       join orders o on o.id = d.order_id
      where d.status = 'delivered'
        and not exists (select 1 from last_mile_allocations a where a.order_id = d.order_id)
      order by run_date, o.order_number`,
  );

  // Does the delivery fee actually pay for the drop? Read from the ledger, both
  // sides VAT-excluded, so the two numbers are comparable.
  const deliveryRevenueMinor = -(await balance(db, ACCOUNTS.DELIVERY_REVENUE));
  const postedLastMileMinor = await balance(db, ACCOUNTS.LAST_MILE);

  return {
    totals: {
      runs: runs.length,
      openRuns: runs.filter((r) => r.status === 'open').length,
      closedRuns: closed.length,
      drops,
      costMinor,
      perDropMinor: drops > 0 ? Math.floor(costMinor / drops) : null,
      // The question the whole increment exists to answer.
      deliveryRevenueMinor,
      lastMileCostMinor: postedLastMileMinor,
      deliveryMarginMinor: deliveryRevenueMinor - postedLastMileMinor,
      feeCoversDrop: postedLastMileMinor === 0 ? null : deliveryRevenueMinor >= postedLastMileMinor,
      uncostedDeliveries: uncostedRes.rows.length,
    },
    runs,
    uncostedDeliveries: uncostedRes.rows.map((r) => ({ orderNumber: r.order_number, runDate: r.run_date })),
  };
}

/**
 * Record a payment provider's fee against the order it belongs to. Called by
 * capture, and callable on its own when a settlement file arrives late with a
 * fee that the capture call did not know about.
 */
export async function recordPspFee(db, { orderId, feeMinor, memo = null } = {}) {
  const amount = Number(feeMinor);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new AppError(422, 'BAD_PSP_FEE', 'A payment fee must be a positive whole number of thebe.', {
      field: 'feeMinor',
    });
  }
  return db.transaction(async (tx) => {
    const res = await tx.query(`select id, order_number from orders where id = $1`, [orderId]);
    const order = res.rows[0];
    if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'That order does not exist.');

    const transactionId = await post(tx, {
      kind: 'psp_fee',
      refType: 'order',
      refId: order.id,
      memo: memo ?? `payment fee ${order.order_number}`,
      entries: [
        { accountCode: ACCOUNTS.PSP_FEES, debit: amount },
        { accountCode: ACCOUNTS.PSP_RECEIVABLE, credit: amount },
      ],
    });

    return { orderNumber: order.order_number, feeMinor: amount, transactionId };
  });
}

/** What the shop still owes riders for runs it has costed. */
export async function riderPayable(db) {
  const owed = -(await balance(db, ACCOUNTS.RIDER_PAYABLE));
  const res = await db.query(
    `select r.rider_id, u.full_name, count(*)::int as runs, sum(r.cost_minor)::bigint as cost_minor
       from last_mile_runs r
       join riders rd on rd.id = r.rider_id
       join users u on u.id = rd.user_id
      where r.status = 'closed'
      group by r.rider_id, u.full_name
      order by sum(r.cost_minor) desc`,
  );
  return {
    owedMinor: owed,
    riders: res.rows.map((r) => ({
      riderId: r.rider_id,
      riderName: r.full_name,
      runs: Number(r.runs),
      costMinor: num(r.cost_minor),
    })),
  };
}
