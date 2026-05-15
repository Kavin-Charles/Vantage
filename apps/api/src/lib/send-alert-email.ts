import type { SmtpConfig } from '@vantage/config';
import { logger } from './logger';

interface AlertInfo {
  severity: 'critical' | 'warning' | 'info';
  message: string;
  resource_type: string;
}

/**
 * Send an alert notification email to workspace admins.
 * Swallows errors — must never crash the parent request.
 */
export async function sendAlertEmail(
  smtp: SmtpConfig | null | undefined,
  adminEmails: string[],
  alert: AlertInfo,
): Promise<void> {
  if (!smtp || adminEmails.length === 0) return;

  try {
    const nodemailer = await import('nodemailer');
    const transporter = nodemailer.default.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.password },
    });

    await transporter.sendMail({
      from: smtp.from,
      to: adminEmails.join(', '),
      subject: `[Vantage ${alert.severity}] ${alert.resource_type} alert`,
      text: [
        `A ${alert.severity} alert was triggered:`,
        '',
        alert.message,
        '',
        'Log in to Vantage to acknowledge or resolve this alert.',
      ].join('\n'),
    });
  } catch (err) {
    logger.error({ err }, 'sendAlertEmail: failed to send');
  }
}
