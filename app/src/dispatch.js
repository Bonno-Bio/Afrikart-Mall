/**
 * Should this route go out today? (AFR-54)
 *
 * `docs/019` ended with an arithmetic comparison a person had to do by hand: a
 * P370 run over three drops is P123 a drop, the same run over the route's
 * twenty-two is P16.82. This module is that comparison as a report, so the
 * question stops being instinct and starts being a number.
 *
 * Two figures decide it:
 *
 *   plannedCostMinor   what the trip costs — the rate card for the route's
 *                      vehicle class, or the actual cost of a run already opened
 *                      for that date, because a real number beats an estimate.
 *   netFeeMinor        the delivery fees the trip would collect, VAT excluded,
 *                      because VAT was never ours.
 *
 * `breakEvenDrops` is the smallest number of drops at which the fees cover the
 * trip. Below it the route is a subsidy; the report says so by name rather than
 * leaving it to be discovered at month end.
 */
import { AppError } from './errors.js';
import { vatFromInclusive } from './money.js';

const num = (v) => Number(v ?? 0);

/** Rates used when no run has been opened for the day yet. */
export async function rateCard(db) {
  const res = await db.query(`select vehicle_class, rider_pay_minor, fuel_minor from run_rate_card order by vehicle_class`);
  return res.rows.map((r) => ({
    vehicleClass: r.vehicle_class,
    riderPayMinor: num(r.rider_pay_minor),
    fuelMinor: num(r.fuel_minor),
    costMinor: num(r.rider_pay_minor) + num(r.fuel_minor),
  }));
}

/**
 * The dispatch plan for a day: every active route that has work on it, priced.
 *
 * `verdict`:
 * A drop belongs to the day it happened: the day it was delivered, else the day
 * it was first attempted, else the day it is scheduled for. Planning and closing
 * therefore use one rule, and a parcel delivered a day early moves out of
 * tomorrow's plan instead of being counted twice.
 *
 *   `go`    — the fees cover the trip and the route is within capacity
 *   `thin`  — it can go out, but the fees do not cover it yet
 *   `hold`  — over capacity, or nothing scheduled to carry
 */
export async function dispatchPlan(db, { runDate, routeId = null } = {}) {
  if (!runDate) throw new AppError(422, 'RUN_DATE_REQUIRED', 'A plan needs a date.', { field: 'runDate' });

  const routesRes = await db.query(
    `select id, name, city, vehicle_class, daily_capacity, max_weight_grams, max_volume_ml
       from routes
      where is_active
        and ($1::uuid is null or id = $1)
      order by name`,
    [routeId],
  );

  // Drops and fees per route. A delivery that has not gone out yet still counts:
  // the trip is being planned for it. So does a failed one — the parcel has not
  // arrived, so it is still work, and dropping it from the plan would make a bad
  // day look smaller than it was.
  const dropsRes = await db.query(
    `select d.route_id,
            count(*)::int                                                        as scheduled_drops,
            count(*) filter (where d.status = 'delivered')::int                   as delivered_drops,
            count(*) filter (where o.delivery_minor = 0)::int                     as free_drops,
            coalesce(sum(o.delivery_minor), 0)::bigint                            as delivery_gross_minor
       from deliveries d
       join orders o on o.id = d.order_id
      where coalesce(d.delivered_at::date, d.first_attempt_at::date, d.scheduled_date) = $1::date
        and d.status in ('pending','assigned','out_for_delivery','delivered','failed')
        and ($2::uuid is null or d.route_id = $2)
      group by d.route_id`,
    [runDate, routeId],
  );
  const dropsByRoute = new Map(dropsRes.rows.map((r) => [r.route_id, r]));

  // Load, computed with a lateral so a three-line order does not multiply its
  // own weight by three. Fan-out in an aggregate is a silent lie.
  const loadRes = await db.query(
    `select d.route_id,
            coalesce(sum(x.weight_grams), 0)::bigint as weight_grams,
            coalesce(sum(x.volume_ml), 0)::bigint    as volume_ml
       from deliveries d
       join lateral (
         select sum(pv.weight_grams * oi.quantity) as weight_grams,
                sum(pv.volume_ml * oi.quantity)    as volume_ml
           from order_items oi
           join product_variants pv on pv.id = oi.variant_id
          where oi.order_id = d.order_id and oi.status = 'active'
       ) x on true
      where coalesce(d.delivered_at::date, d.first_attempt_at::date, d.scheduled_date) = $1::date
        and d.status in ('pending','assigned','out_for_delivery','delivered')
        and ($2::uuid is null or d.route_id = $2)
      group by d.route_id`,
    [runDate, routeId],
  );
  const loadByRoute = new Map(loadRes.rows.map((r) => [r.route_id, r]));

  // A run already opened for the day is the real cost of that trip.
  const runsRes = await db.query(
    `select route_id, sum(rider_pay_minor + fuel_minor)::bigint as cost_minor, count(*)::int as runs
       from last_mile_runs
      where run_date = $1::date
        and ($2::uuid is null or route_id = $2)
      group by route_id`,
    [runDate, routeId],
  );
  const runsByRoute = new Map(runsRes.rows.map((r) => [r.route_id, r]));

  const rates = new Map((await rateCard(db)).map((r) => [r.vehicleClass, r]));
  const classTotals = new Map();

  const routes = routesRes.rows.map((route) => {
    const drops = dropsByRoute.get(route.id);
    const load = loadByRoute.get(route.id);
    const run = runsByRoute.get(route.id);
    const rate = rates.get(route.vehicle_class);

    const scheduledDrops = drops ? num(drops.scheduled_drops) : 0;
    const freeDrops = drops ? num(drops.free_drops) : 0;
    const deliveryGrossMinor = drops ? num(drops.delivery_gross_minor) : 0;
    const netFeeMinor = vatFromInclusive(deliveryGrossMinor).netMinor;

    const plannedCostMinor = run
      ? num(run.cost_minor)
      : rate
        ? rate.costMinor
        : 0;
    const costSource = run ? 'actual_run' : rate ? 'rate_card' : 'unknown';

    const weightGrams = load ? num(load.weight_grams) : 0;
    const volumeMl = load ? num(load.volume_ml) : 0;
    const overCapacity =
      scheduledDrops > num(route.daily_capacity) ||
      weightGrams > num(route.max_weight_grams) ||
      volumeMl > num(route.max_volume_ml);

    const perDropMinor = scheduledDrops > 0 ? Math.floor(plannedCostMinor / scheduledDrops) : null;
    // A drop that pays nothing cannot help cover a trip: count only the drops
    // that carry a fee when asking how many are needed.
    const payingDrops = scheduledDrops - freeDrops;
    const averageNetFeeMinor =
      payingDrops > 0 ? Math.round(netFeeMinor / payingDrops) : 0;
    const breakEvenDrops =
      averageNetFeeMinor > 0 ? Math.ceil(plannedCostMinor / averageNetFeeMinor) : null;

    const marginMinor = netFeeMinor - plannedCostMinor;
    let verdict;
    if (scheduledDrops === 0) verdict = 'hold';
    else if (overCapacity) verdict = 'hold';
    else if (marginMinor >= 0) verdict = 'go';
    else verdict = 'thin';

    const entry = {
      routeId: route.id,
      routeName: route.name,
      city: route.city,
      vehicleClass: route.vehicle_class,
      capacity: num(route.daily_capacity),
      scheduledDrops,
      payingDrops,
      freeDrops,
      residualCapacity: num(route.daily_capacity) - scheduledDrops,
      utilisationBps:
        num(route.daily_capacity) > 0
          ? Math.round((scheduledDrops * 10000) / num(route.daily_capacity))
          : null,
      weightGrams,
      volumeMl,
      overCapacity,
      plannedCostMinor,
      costSource,
      deliveryGrossMinor,
      netFeeMinor,
      perDropMinor,
      averageNetFeeMinor,
      breakEvenDrops,
      marginMinor,
      // What the same trip would cost per drop if it filled up: the number that
      // makes the difference between "delivery is unprofitable" and "this route
      // is empty".
      perDropAtCapacityMinor:
        num(route.daily_capacity) > 0 ? Math.floor(plannedCostMinor / num(route.daily_capacity)) : null,
      verdict,
    };

    const bucket = classTotals.get(route.vehicle_class) ?? {
      vehicleClass: route.vehicle_class,
      routes: 0,
      scheduledDrops: 0,
      plannedCostMinor: 0,
      netFeeMinor: 0,
    };
    bucket.routes += 1;
    bucket.scheduledDrops += scheduledDrops;
    bucket.plannedCostMinor += plannedCostMinor;
    bucket.netFeeMinor += netFeeMinor;
    classTotals.set(route.vehicle_class, bucket);

    return entry;
  });

  // Worst first: the plan should open on the trips that lose money.
  routes.sort((a, b) => a.marginMinor - b.marginMinor || a.routeName.localeCompare(b.routeName));

  const plannedCostMinor = routes.reduce((a, r) => a + r.plannedCostMinor, 0);
  const netFeeMinor = routes.reduce((a, r) => a + r.netFeeMinor, 0);
  const scheduledDrops = routes.reduce((a, r) => a + r.scheduledDrops, 0);

  return {
    runDate,
    routes,
    summary: {
      routes: routes.length,
      scheduledDrops,
      plannedCostMinor,
      netFeeMinor,
      marginMinor: netFeeMinor - plannedCostMinor,
      perDropMinor: scheduledDrops > 0 ? Math.floor(plannedCostMinor / scheduledDrops) : null,
      perDropAtCapacityMinor: routes.reduce((a, r) => a + (r.perDropAtCapacityMinor ?? 0), 0),
      dispatchable: routes.filter((r) => r.verdict !== 'hold').length,
      thin: routes.filter((r) => r.verdict === 'thin').map((r) => r.routeName),
      hold: routes.filter((r) => r.verdict === 'hold').map((r) => r.routeName),
      overCapacity: routes.filter((r) => r.overCapacity).map((r) => r.routeName),
      byVehicleClass: [...classTotals.values()].map((b) => ({
        ...b,
        perDropMinor: b.scheduledDrops > 0 ? Math.floor(b.plannedCostMinor / b.scheduledDrops) : null,
        marginMinor: b.netFeeMinor - b.plannedCostMinor,
      })),
    },
  };
}

/**
 * Day close: what was planned against what actually happened (AFR-55).
 *
 * The dispatch plan prices a morning. Nothing yet compares that morning to the
 * evening — which is how a route can be "planned at fifteen drops" and quietly
 * deliver nine, with the difference appearing nowhere except in a bank balance
 * three weeks later. This is the reconciliation, per route:
 *
 *   planned drops vs delivered + failed + still open
 *   planned cost  vs what was actually costed, and what could not be
 *   runs opened   vs runs closed — an open run is cost the books cannot see yet
 */
export async function dayClose(db, { runDate, routeId = null } = {}) {
  if (!runDate) throw new AppError(422, 'RUN_DATE_REQUIRED', 'A day close needs a date.', { field: 'runDate' });

  const plan = await dispatchPlan(db, { runDate, routeId });
  const plannedByRoute = new Map(plan.routes.map((r) => [r.routeId, r]));

  const actualRes = await db.query(
    `select d.route_id,
            count(*)::int                                                     as scheduled,
            count(*) filter (where d.status = 'delivered')::int                as delivered,
            count(*) filter (where d.status = 'failed')::int                   as failed,
            count(*) filter (where d.status in ('pending','assigned','out_for_delivery'))::int as still_open,
            count(*) filter (where d.status = 'delivered' and d.attempt_count <= 1)::int as delivered_first,
            coalesce(sum(d.attempt_count), 0)::int                             as attempts,
            count(*) filter (
              where d.status = 'delivered'
                and not exists (select 1 from last_mile_allocations a where a.order_id = d.order_id)
            )::int                                                            as uncosted
       from deliveries d
      where coalesce(d.delivered_at::date, d.first_attempt_at::date, d.scheduled_date) = $1::date
        and ($2::uuid is null or d.route_id = $2)
      group by d.route_id`,
    [runDate, routeId],
  );
  const actualByRoute = new Map(actualRes.rows.map((r) => [r.route_id, r]));

  // Runs are read one by one rather than aggregated, because a run opened for a
  // rider and no route still belongs to whichever route that rider actually
  // carried — and a run whose route cannot be worked out must be said out loud
  // instead of quietly disappearing from the day.
  const runsRes = await db.query(
    `select r.id, r.route_id, r.status, r.planned_drops, r.cost_minor, r.unattributed_minor, r.rider_id,
            (select d.route_id
               from deliveries d
              where d.rider_id = r.rider_id
                and coalesce(d.delivered_at::date, d.first_attempt_at::date, d.scheduled_date) = r.run_date
              group by d.route_id
              order by count(*) desc, d.route_id
              limit 1) as derived_route_id
       from last_mile_runs r
      where r.run_date = $1::date`,
    [runDate],
  );

  const runsByRoute = new Map();
  const unroutedRuns = [];
  for (const run of runsRes.rows) {
    const effectiveRoute = run.route_id ?? run.derived_route_id ?? null;
    if (routeId && effectiveRoute !== routeId) continue;
    if (!effectiveRoute) {
      unroutedRuns.push({ runId: run.id, riderId: run.rider_id, status: run.status, costMinor: num(run.cost_minor) });
      continue;
    }
    const acc = runsByRoute.get(effectiveRoute) ?? { runs: 0, planned: 0, closed_runs: 0, costed: 0, unattributed: 0 };
    acc.runs += 1;
    acc.planned += num(run.planned_drops);
    if (run.status === 'closed') {
      acc.closed_runs += 1;
      acc.costed += num(run.cost_minor);
      acc.unattributed += num(run.unattributed_minor);
    }
    runsByRoute.set(effectiveRoute, acc);
  }

  const routeIds = new Set([
    ...plannedByRoute.keys(),
    ...[...actualByRoute.keys()].filter((id) => id !== null),
    ...runsByRoute.keys(),
  ]);

  const routes = [];
  for (const id of routeIds) {
    const planned = plannedByRoute.get(id);
    const actual = actualByRoute.get(id);
    const runs = runsByRoute.get(id);

    const delivered = actual ? num(actual.delivered) : 0;
    const deliveredFirst = actual ? num(actual.delivered_first) : 0;
    const failed = actual ? num(actual.failed) : 0;
    const stillOpen = actual ? num(actual.still_open) : 0;
    // What dispatching said, captured when the run was opened. Kept separate
    // from the work that belongs to the day now, because those are two different
    // questions: "did we do what we planned?" and "what is left to do?".
    // A run that was opened with nothing on it still made a statement: the plan
    // said zero. Only a day with no run at all has no plan to be held to.
    const plannedFromRuns = runs ? num(runs.planned) : null;
    const currentWorkDrops = planned ? planned.scheduledDrops : 0;
    const uncostedDeliveries = actual ? num(actual.uncosted) : 0;
    const runsOpened = runs ? num(runs.runs) : 0;
    const runsClosed = runs ? num(runs.closed_runs) : 0;

    const unclosedRuns = runsOpened - runsClosed;
    const discrepancies = [];
    if (plannedFromRuns !== null && delivered + failed + stillOpen < plannedFromRuns) {
      discrepancies.push(`${plannedFromRuns - delivered - failed - stillOpen} planned drops did not arrive`);
    }
    if (delivered > 0 && uncostedDeliveries > 0) {
      discrepancies.push(`${uncostedDeliveries} delivered orders carry no last-mile cost`);
    }
    if (unclosedRuns > 0) {
      discrepancies.push(`${unclosedRuns} run(s) still open, so the cost is not in the books`);
    }
    if (failed > 0 && runsClosed === 0) {
      discrepancies.push(`${failed} failed attempts with no closed run to carry their cost`);
    }

    routes.push({
      routeId: id,
      routeName: planned?.routeName ?? null,
      plannedDrops: plannedFromRuns ?? 0,
      plannedSource: plannedFromRuns === null ? 'none' : 'run_at_open',
      currentWorkDrops,
      deliveredDrops: delivered,
      deliveredFirstAttempt: deliveredFirst,
      failedDrops: failed,
      stillOpenDrops: stillOpen,
      attempts: actual ? num(actual.attempts) : 0,
      plannedCostMinor: planned?.plannedCostMinor ?? 0,
      costedMinor: runs ? num(runs.costed) : 0,
      unattributedMinor: runs ? num(runs.unattributed) : 0,
      runsOpened,
      runsClosed,
      uncostedDeliveries,
      // Only meaningful against a plan that was captured before the day ran.
      varianceDrops: plannedFromRuns === null ? null : delivered + failed + stillOpen - plannedFromRuns,
      // Close is a fact, not a feeling: something happened, every run is shut,
      // nothing is left on the road, and nothing was delivered without a cost.
      // An empty route is not closed — it is empty, which is a different thing
      // and should not be counted as a successful day.
      closed:
        delivered + failed + runsOpened > 0 &&
        discrepancies.length === 0 &&
        unclosedRuns === 0 &&
        stillOpen === 0 &&
        uncostedDeliveries === 0,
      discrepancies,
    });
  }

  routes.sort((a, b) => b.discrepancies.length - a.discrepancies.length || String(a.routeName).localeCompare(String(b.routeName)));

  const totals = {
    routes: routes.length,
    plannedDrops: routes.reduce((a, r) => a + r.plannedDrops, 0),
    deliveredDrops: routes.reduce((a, r) => a + r.deliveredDrops, 0),
    deliveredFirstAttempt: routes.reduce((a, r) => a + r.deliveredFirstAttempt, 0),
    failedDrops: routes.reduce((a, r) => a + r.failedDrops, 0),
    stillOpenDrops: routes.reduce((a, r) => a + r.stillOpenDrops, 0),
    plannedCostMinor: routes.reduce((a, r) => a + r.plannedCostMinor, 0),
    costedMinor: routes.reduce((a, r) => a + r.costedMinor, 0),
    unattributedMinor: routes.reduce((a, r) => a + r.unattributedMinor, 0),
    uncostedDeliveries: routes.reduce((a, r) => a + r.uncostedDeliveries, 0),
    runsOpened: routes.reduce((a, r) => a + r.runsOpened, 0),
    runsClosed: routes.reduce((a, r) => a + r.runsClosed, 0),
  };

  return {
    runDate,
    routes,
    summary: {
      ...totals,
      // A parcel that arrived is not the same as a parcel that arrived first
      // time. This is the fraction of deliveries that did not need a second trip.
      firstAttemptSuccessBps:
        totals.deliveredDrops > 0
          ? Math.round((totals.deliveredFirstAttempt * 10000) / totals.deliveredDrops)
          : null,
      open: routes.filter((r) => !r.closed).map((r) => r.routeName),
      // A run that cannot be tied to a route is money with no home.
      unroutedRuns,
      discrepancies: routes.reduce((a, r) => a + r.discrepancies.length, 0) + unroutedRuns.length,
      closed: routes.length > 0 && unroutedRuns.length === 0 && routes.every((r) => r.closed),
    },
  };
}
