import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { logActivity } from '../lib/log-activity';
import { logger } from '../lib/logger';

// 1. Define our incoming payload requirements
const sendMessageSchema = z.object({
  contactId: z.string().uuid(),
  type: z.enum(['sms', 'whatsapp']),
  message: z.string().min(1),
});

export function createMessagesRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
  const router = Router();

  // POST /api/messages/send
  router.post('/send', requirePermission('contacts:edit'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      
      // 2. Safely parse data from the frontend request body
      const { contactId, type, message } = sendMessageSchema.parse(req.body);

      // 3. Find the contact inside the database to retrieve their number
      const contact = await db
        .selectFrom('contacts')
        .where('id', '=', contactId)
        .where('workspace_id', '=', workspace.id)
        .where('deleted_at', 'is', null)
        .select(['id', 'name', 'phone'])
        .executeTakeFirst();

      if (!contact) {
        res.status(404).json({ data: null, error: { code: 'NOT_FOUND', message: 'Contact not found' } });
        return;
      }

      if (!contact.phone) {
        res.status(400).json({ data: null, error: { code: 'MISSING_PHONE', message: 'Contact does not have a saved phone number' } });
        return;
      }

      // TODO: Hook up the formal Twilio API Client here to dispatch the transmission!
      logger.info({ contactId, type }, 'Message routed successfully to staging dispatch');

      // 4. Log the interaction to the contact's activity feed history
      void logActivity(db, {
        workspace_id: workspace.id,
        user_id: user.id,
        type: 'note',
        body: `Sent ${type.toUpperCase()} to ${contact.name}: "${message}"`,
        contact_id: contact.id,
      });

      res.status(200).json({ data: { success: true, channel: type }, error: null });
    } catch (err) { 
      next(err); 
    }
  });

  return router;
}