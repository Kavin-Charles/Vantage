import { Router, type Router as ExpressRouter } from 'express';
import Stripe from 'stripe';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';

export function createBillingRouter(db: Kysely<Database>, stripe: Stripe): ExpressRouter {
  const router = Router();

  router.get('/usage', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const meter = await db
        .selectFrom('usage_meters')
        .where('workspace_id', '=', workspace.id)
        .orderBy('created_at', 'desc')
        .selectAll()
        .executeTakeFirst();

      res.json({ data: { workspace, current_meter: meter ?? null }, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.get('/invoices', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;
      const meters = await db
        .selectFrom('usage_meters')
        .where('workspace_id', '=', workspace.id)
        .where('status', '!=', 'pending')
        .orderBy('created_at', 'desc')
        .selectAll()
        .execute();

      res.json({ data: meters, error: null });
    } catch (err) {
      next(err);
    }
  });

  router.post('/portal', async (req, res, next) => {
    try {
      const { workspace } = req as unknown as AuthenticatedRequest;

      if (!workspace.stripe_customer_id) {
        res.status(400).json({ data: null, error: { code: 'NO_STRIPE_CUSTOMER', message: 'No billing account found' } });
        return;
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: workspace.stripe_customer_id,
        return_url: `${process.env['NEXT_PUBLIC_APP_URL']}/settings/billing`,
      });

      res.json({ data: { url: session.url }, error: null });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
