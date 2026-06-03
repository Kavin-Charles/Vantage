import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import type { Kysely } from 'kysely';
import type { Database } from '@vantage/db';
import type { AuthenticatedRequest } from '../middleware/auth';
import { logActivity } from '../lib/log-activity';
import { logger } from '../lib/logger';
import twilio from 'twilio';

const sendMessageSchema = z.object({
  contactId: z.string().uuid(),
  type: z.enum(['sms', 'whatsapp']),
  message: z.string().min(1),
});

export function createMessagesRouter(db: Kysely<Database>, requirePermission: (p: string) => import('express').RequestHandler): ExpressRouter {
  const router = Router();

  router.post('/send', requirePermission('contacts:edit'), async (req, res, next) => {
    try {
      const { workspace, user } = req as unknown as AuthenticatedRequest;
      const { contactId, type, message } = sendMessageSchema.parse(req.body);

      // 1. Grab credentials out of process.env
      const accountSid = process.env.TWILIO_ACCOUNT_SID;
      const authToken = process.env.TWILIO_AUTH_TOKEN;
      const fromNumber = process.env.TWILIO_PHONE_NUMBER;

      if (!accountSid || !authToken || !fromNumber) {
        res.status(500).json({
          data: null,
          error: { code: 'TWILIO_NOT_CONFIGURED', message: 'Twilio integration credentials are missing on the server' }
        });
        return;
      }

      // 2. Fetch the target contact profile
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

      // 3. Initialize Twilio client runtime
      const client = twilio(accountSid, authToken);

      // Format sender/receiver handles dynamically based on message medium type
      const from = type === 'whatsapp' ? `whatsapp:${fromNumber}` : fromNumber;
      const to = type === 'whatsapp' ? `whatsapp:${contact.phone}` : contact.phone;

      // 4. Fire the message down the wire
      logger.info({ contactId, type, to }, 'Initiating outbound API request to Twilio gateway');
      
      const twilioResponse = await client.messages.create({
        body: message,
        from,
        to,
      });

      logger.info({ messageSid: twilioResponse.sid }, 'Twilio dispatch successful');

      // 5. Append the message audit string directly inside the contact activity timeline view
      void logActivity(db, {
        workspace_id: workspace.id,
        user_id: user.id,
        type: 'note',
        body: `Sent ${type.toUpperCase()} via Twilio: "${message}"`,
        contact_id: contact.id,
      });

      res.status(200).json({
        data: { success: true, messageSid: twilioResponse.sid, channel: type },
        error: null
      });
    } catch (err) {
      logger.error({ err }, 'Twilio gateway transmission exception occurred');
      next(err);
    }
  });

  return router;
}