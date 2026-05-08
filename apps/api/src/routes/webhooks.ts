import { Router, type Router as ExpressRouter, raw } from 'express';
import { Webhook } from 'svix';
import Stripe from 'stripe';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import { logger } from '../lib/logger';

export function createWebhooksRouter(db: Kysely<Database>, stripe: Stripe): ExpressRouter {
  const router = Router();

  router.post('/clerk', raw({ type: 'application/json' }), async (req, res) => {
    const secret = process.env['CLERK_WEBHOOK_SECRET'];
    if (!secret) {
      logger.error('CLERK_WEBHOOK_SECRET not set');
      res.status(500).json({ error: 'Webhook secret not configured' });
      return;
    }

    const wh = new Webhook(secret);
    let evt: {
      type: string;
      data: {
        id: string;
        email_addresses: Array<{ email_address: string }>;
        first_name: string | null;
        last_name: string | null;
        organization_memberships?: Array<{
          organization: { id: string; name: string };
          role: string;
        }>;
      };
    };

    try {
      evt = wh.verify(req.body as Buffer, {
        'svix-id': req.headers['svix-id'] as string,
        'svix-timestamp': req.headers['svix-timestamp'] as string,
        'svix-signature': req.headers['svix-signature'] as string,
      }) as typeof evt;
    } catch (err) {
      logger.warn({ err }, 'Invalid Clerk webhook signature');
      res.status(400).json({ error: 'Invalid webhook signature' });
      return;
    }

    try {
      if (evt.type === 'user.created') {
        const { id, email_addresses, first_name, last_name } = evt.data;
        const email = email_addresses[0]?.email_address ?? '';
        const domain = email.split('@')[1] ?? 'workspace';
        const name = [first_name, last_name].filter(Boolean).join(' ') || email;

        // Create Stripe customer
        const customer = await stripe.customers.create({ email, name });

        // Create workspace
        const workspace = await db
          .insertInto('workspaces')
          .values({
            name,
            domain,
            plan: 'trial',
            stripe_customer_id: customer.id,
            trial_ends_at: new Date(Date.now() + 14 * 86400 * 1000),
          })
          .returningAll()
          .executeTakeFirstOrThrow();

        // Create user as admin
        await db
          .insertInto('users')
          .values({
            workspace_id: workspace.id,
            clerk_user_id: id,
            name,
            email,
            role: 'admin',
          })
          .execute();

        logger.info({ workspaceId: workspace.id, clerkUserId: id }, 'Workspace + user created');
      }

      res.json({ received: true });
    } catch (err) {
      logger.error({ err }, 'Webhook handler error');
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });

  return router;
}
