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
  // the trip is being planned for it.
  const dropsRes = await db.query(
    `select d.route_id,
            count(*)::int                                                        as scheduled_drops,
            count(*) filter (where d.status = 'delivered')::int                   as delivered_drops,
            count(*) filter (where o.delivery_minor = 0)::int                     as free_drops,
            coalesce(sum(o.delivery_minor), 0)::bigint                            as delivery_gross_minor
       from deliveries d
       join orders o on o.id = d.order_id
      where d.scheduled_date = $1::date
        and d.status in ('pending','assigned','out_for_delivery','delivered')
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
      where d.scheduled_date = $1::date
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
