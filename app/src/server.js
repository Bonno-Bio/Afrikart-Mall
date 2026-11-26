/**
 * The API for B2 — The Till and The Shelf.
 *
 * Auth is a stand-in until M0-03 (phone OTP) lands: `x-user-id` is trusted in
 * development only, and the server refuses to start without an explicit
 * `ALLOW_DEV_AUTH=1` when there is no real auth configured. Shipping a header
 * that grants identity is the kind of shortcut that survives into production,
 * so it is fenced here and named in the response headers.
 */
import crypto from 'node:crypto';
import express from 'express';
import { AppError } from './errors.js';
import { quote, placeOrder } from './orders.js';
import { capturePayment, loadOrder } from './payments.js';
import { recordDelivery } from './delivery.js';
import { refundLine, completeRefund } from './refunds.js';
import { issueInvoice, renderInvoice } from './invoice.js';
import { trialBalance } from './ledger.js';
import {
  receivePurchaseOrder,
  publishProduct,
  shelfReport,
  publicCatalogue,
  marginByOrder,
} from './catalogue.js';
import { payoutRun, payoutStatement, payoutsFor } from './payouts.js';
import { importCatalogue, runStocktake } from './import.js';
import { requestOtp, verifyOtp, userFromToken, revokeSession, listSessions } from './auth.js';
import { createSmsSender, productionReadiness } from './sms.js';

export function verifyWebhookSignature(rawBody, signature, secret) {
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(String(signature ?? ''), 'utf8');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function createApp({
  db,
  webhookSecret = process.env.PSP_WEBHOOK_SECRET,
  // Off unless someone says so explicitly. A header that grants identity must
  // never be the default, because defaults are what production ends up running.
  devAuth = process.env.ALLOW_DEV_AUTH === '1',
  // Separate switch: a test suite needs the code back without turning the
  // header shortcut on. Both are off in production.
  exposeOtpCodes = devAuth,
  // A sender is injected so the suite never dials a real gateway, and so a
  // deployment chooses one in exactly one place.
  sms = createSmsSender(),
} = {}) {
  const app = express();
  app.disable('x-powered-by');
  app.set('trust proxy', true);

  // Raw body is needed for the webhook signature; everything else gets JSON.
  app.use(
    express.json({
      limit: '256kb',
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  const requestId = (req) => req.get('x-request-id') ?? crypto.randomUUID();

  // Identity resolution runs once, before any route. A bearer token is the only
  // real credential; `x-user-id` survives for local development and only when
  // ALLOW_DEV_AUTH=1, and it is looked up so the role is the database's, not the
  // caller's.
  app.use(async (req, _res, next) => {
    try {
      const header = req.get('authorization') ?? '';
      if (header.startsWith('Bearer ')) {
        req.user = await userFromToken(db, header.slice(7).trim());
        if (!req.user) throw new AppError(401, 'SESSION_INVALID', 'That session has ended. Sign in again.');
        return next();
      }
      if (devAuth) {
        const id = req.get('x-user-id');
        if (id) {
          const res = await db.query('select id, email, full_name, role from users where id = $1', [id]);
          req.user = res.rows[0] ?? null;
          req.authMode = 'dev-header';
        }
      }
      return next();
    } catch (err) {
      return next(err);
    }
  });

  const currentUser = (req) => req.user ?? null;
  const requireUser = (req) => {
    if (!req.user) throw new AppError(401, 'UNAUTHORISED', 'Sign in first.');
    return req.user;
  };
  const requireAdmin = (req) => {
    const user = requireUser(req);
    if (user.role !== 'admin') {
      throw new AppError(403, 'FORBIDDEN', 'That action is for staff.');
    }
    return user;
  };

  app.get('/api/health', async (_req, res) => {
    try {
      await db.query('select 1');
      res.json({ status: 'ok', engine: db.engine, at: new Date().toISOString() });
    } catch (err) {
      res.status(503).json({ status: 'degraded', error: err.message });
    }
  });

  // -------------------------------------------------------------------------
  // Authentication (AFR-41). Phone OTP in, session token out.
  // -------------------------------------------------------------------------
  app.post('/api/auth/otp', async (req, res, next) => {
    try {
      const { phone, purpose } = req.body ?? {};
      const exposeCode = exposeOtpCodes && process.env.NODE_ENV !== 'production';

      // Without a gateway and without a dev exposure there is no way to receive
      // the code, so refuse rather than accept a login that cannot complete.
      if (!sms.configured && !exposeCode) {
        throw new AppError(503, 'SMS_UNCONFIGURED', 'Login is not available right now: no SMS gateway is configured.');
      }

      const result = await requestOtp(db, {
        phone,
        purpose: purpose ?? 'login',
        ip: req.ip ?? null,
        sender: sms.configured ? sms : null,
        exposeCode,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/verify', async (req, res, next) => {
    try {
      const { phone, code } = req.body ?? {};
      const session = await verifyOtp(db, {
        phone,
        code,
        userAgent: req.get('user-agent') ?? null,
        ip: req.ip ?? null,
      });
      res.status(201).json(session);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/auth/me', async (req, res, next) => {
    try {
      const user = requireUser(req);
      res.json({ user, sessions: await listSessions(db, { userId: user.id }) });
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/auth/logout', async (req, res, next) => {
    try {
      const header = req.get('authorization') ?? '';
      const result = await revokeSession(db, { token: header.replace('Bearer ', '').trim() });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/checkout/quote', async (req, res, next) => {
    try {
      const { items, addressId, deliveryMethod, paymentMethod } = req.body ?? {};
      const result = await quote(db, {
        userId: currentUser(req)?.id ?? null,
        items,
        addressId,
        deliveryMethod,
        paymentMethod,
      });
      delete result._internal;
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/orders', async (req, res, next) => {
    try {
      const key = req.get('Idempotency-Key');
      const { items, addressId, deliveryMethod, paymentMethod, scheduledDate } = req.body ?? {};
      const order = await placeOrder(db, {
        userId: requireUser(req).id,
        items,
        addressId,
        deliveryMethod,
        paymentMethod,
        scheduledDate,
        idempotencyKey: key,
      });
      res.status(201).json(order);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/orders/:number', async (req, res, next) => {
    try {
      const user = requireUser(req);
      const order = await loadOrder(db, req.params.number);
      // An order number is guessable. Only its owner, or staff, may read it.
      if (order.user_id && order.user_id !== user.id && user.role !== 'admin') {
        throw new AppError(403, 'FORBIDDEN', 'That order is not yours.');
      }
      const lines = await db.query(
        `select id, title_snapshot as title, quantity, unit_price_minor, line_subtotal_minor, status
           from order_items where order_id = $1 order by title_snapshot`,
        [order.id],
      );
      const events = await db.query(
        `select event, detail, created_at from order_events where order_id = $1 order by created_at`,
        [order.id],
      );
      res.json({ order, lines: lines.rows, events: events.rows });
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/orders/:number/invoice', async (req, res, next) => {
    try {
      const user = requireUser(req);
      const order = await loadOrder(db, req.params.number);
      if (order.user_id && order.user_id !== user.id && user.role !== 'admin') {
        throw new AppError(403, 'FORBIDDEN', 'That invoice is not yours.');
      }
      const invoice = await issueInvoice(db, order.id);
      const lines = await db.query(
        `select title_snapshot, quantity, line_subtotal_minor from order_items where order_id = $1`,
        [order.id],
      );
      const seller = await db.query(
        `select s.trading_name from sellers s
           join order_items i on i.seller_id = s.id where i.order_id = $1 limit 1`,
        [order.id],
      );
      res.type('text/plain').send(
        renderInvoice({ order, lines: lines.rows, invoice, seller: seller.rows[0]?.trading_name }),
      );
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/webhooks/psp', async (req, res, next) => {
    try {
      const signature = req.get('x-psp-signature');
      if (webhookSecret && !verifyWebhookSignature(req.rawBody, signature, webhookSecret)) {
        throw new AppError(401, 'BAD_SIGNATURE', 'Webhook signature did not verify.');
      }

      const { event, data } = req.body ?? {};
      if (event !== 'payment.captured') {
        // Acknowledge everything we do not handle, so the provider stops retrying.
        return res.status(202).json({ received: true, ignored: event ?? null });
      }

      const picked = await db.query(`select id from payments where id = $1`, [data.paymentId]);
      if (picked.rows.length === 0) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Unknown payment.');

      const result = await capturePayment(db, {
        paymentId: data.paymentId,
        providerRef: data.providerRef,
        providerFeeMinor: data.providerFeeMinor ?? 0,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  // Ops surface. Real auth arrives with M0-03; these are staff actions and are
  // deliberately behind the same role check in both environments.
  app.post('/api/ops/orders/:number/deliver', async (req, res, next) => {
    try {
      requireAdmin(req);
      const result = await recordDelivery(db, {
        orderNumber: req.params.number,
        cashCollectedMinor: req.body?.cashCollectedMinor ?? null,
        riderId: req.body?.riderId ?? null,
      });
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/ops/orders/:number/refund', async (req, res, next) => {
    try {
      requireAdmin(req);
      const { orderItemId, channel, reason } = req.body ?? {};
      const refund = await refundLine(db, {
        orderItemId,
        channel,
        reason,
        requestedBy: requireAdmin(req).id,
      });
      res.status(201).json(refund);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/ops/refunds/:id/complete', async (req, res, next) => {
    try {
      requireAdmin(req);
      res.json(await completeRefund(db, { refundId: req.params.id, providerRef: req.body?.providerRef }));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/ops/ledger', async (req, res, next) => {
    try {
      requireAdmin(req);
      res.json(await trialBalance(db));
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------------------
  // B2 — The Shelf. Public catalogue is a different shape from the ops shelf on
  // purpose: a public endpoint that leaks landed cost hands away the margin.
  // -------------------------------------------------------------------------
  app.get('/api/catalogue', async (req, res, next) => {
    try {
      res.json(await publicCatalogue(db, { sellerSlug: req.query.seller ?? null }));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/ops/shelf', async (req, res, next) => {
    try {
      requireAdmin(req);
      res.json(await shelfReport(db));
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/ops/products/:id/publish', async (req, res, next) => {
    try {
      requireAdmin(req);
      res.json(await publishProduct(db, { productId: req.params.id, actorId: requireAdmin(req).id }));
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/ops/purchase-orders/:poNumber/receive', async (req, res, next) => {
    try {
      requireAdmin(req);
      const result = await receivePurchaseOrder(db, {
        poNumber: req.params.poNumber,
        note: req.body?.note ?? null,
        receivedBy: requireAdmin(req).id,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/ops/catalogue/import', async (req, res, next) => {
    try {
      const actor = requireAdmin(req);
      const result = await importCatalogue(db, {
        csv: req.body?.csv ?? '',
        sellerSlug: req.body?.sellerSlug ?? null,
        dryRun: req.body?.dryRun === true,
        actorId: actor.id,
      });
      res.status(result.dryRun ? 200 : 201).json(result);
    } catch (err) {
      next(err);
    }
  });

  app.post('/api/ops/stocktake', async (req, res, next) => {
    try {
      const actor = requireAdmin(req);
      const result = await runStocktake(db, {
        counts: req.body?.counts ?? [],
        note: req.body?.note ?? null,
        dryRun: req.body?.dryRun === true,
        actorId: actor.id,
      });
      res.status(result.dryRun ? 200 : 201).json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/ops/margin', async (req, res, next) => {
    try {
      requireAdmin(req);
      const limit = Math.min(Number(req.query.limit ?? 50) || 50, 500);
      res.json(await marginByOrder(db, { limit }));
    } catch (err) {
      next(err);
    }
  });

  // -------------------------------------------------------------------------
  // Seller payouts (AFR-42). The marketplace either pays or it is a shop with
  // extra steps.
  // -------------------------------------------------------------------------
  app.post('/api/ops/payouts/run', async (req, res, next) => {
    try {
      requireAdmin(req);
      const { sellerId, periodStart, periodEnd, bankReference } = req.body ?? {};
      const result = await payoutRun(db, {
        sellerId: sellerId ?? null,
        periodStart: periodStart ?? null,
        periodEnd: periodEnd ?? null,
        bankReference: bankReference ?? null,
        actorId: requireAdmin(req).id,
      });
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/ops/payouts/:id', async (req, res, next) => {
    try {
      requireAdmin(req);
      res.json(await payoutStatement(db, { payoutId: req.params.id }));
    } catch (err) {
      next(err);
    }
  });

  app.get('/api/sellers/:sellerId/payouts', async (req, res, next) => {
    try {
      requireAdmin(req);
      res.json({ payouts: await payoutsFor(db, { sellerId: req.params.sellerId }) });
    } catch (err) {
      next(err);
    }
  });

  app.use((req, _res, next) => next(new AppError(404, 'NOT_FOUND', `No route for ${req.method} ${req.path}.`)));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, _next) => {
    const id = requestId(req);
    const known = err instanceof AppError;
    if (!known) console.error(`[${id}]`, err);
    res.status(known ? err.status : 500).json(
      known
        ? err.toJSON(id)
        : { error: { code: 'INTERNAL', message: 'Something broke on our side.', request_id: id } },
    );
  });

  return app;
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('server.js');
if (isDirectRun) {
  const { createClient, ensureSchema } = await import('./db.js');
  const db = await createClient();

  if (process.env.MIGRATE_ON_BOOT === '1') await ensureSchema(db, { log: console.log });
  if (process.env.SEED_ON_BOOT === '1') {
    const { seed } = await import('../db/seed.js');
    const existing = await db.query('select count(*)::int as n from users');
    if (Number(existing.rows[0].n) === 0) await seed(db);
  }

  // Refuse to serve customers from a process that cannot deliver a login code,
  // or that would trust an identity header. Loud at boot beats quiet in support.
  const problems = productionReadiness();
  if (problems.length > 0) {
    console.error('refusing to start in production:');
    for (const problem of problems) console.error(`  - ${problem}`);
    process.exit(1);
  }

  const port = Number(process.env.PORT ?? 4000);
  const app = createApp({ db });
  app.listen(port, '0.0.0.0', () => {
    console.log(`Afrikart platform API on 0.0.0.0:${port} (${db.engine})`);
  });
}
