import type { SmtpConfig } from '@vencore/config'
import { logger } from './logger'

interface ApprovalEmailInfo {
  projectName: string
  approveToken: string
  rejectToken: string
}

/**
 * Email a client two pre-signed links (approve/reject) for an approval request.
 * Swallows errors — must never crash the parent request.
 */
export async function sendApprovalEmail(
  smtp: SmtpConfig | null | undefined,
  recipientEmail: string,
  info: ApprovalEmailInfo,
): Promise<void> {
  if (!smtp) return

  try {
    const nodemailer = await import('nodemailer')
    const transporter = nodemailer.default.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: { user: smtp.user, pass: smtp.password },
    })

    const appUrl = process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'

    await transporter.sendMail({
      from: smtp.from,
      to: recipientEmail,
      subject: `Approval requested: ${info.projectName}`,
      text: [
        `You have been asked to review and approve a deliverable for "${info.projectName}".`,
        '',
        `Approve: ${appUrl}/portal/approve/${info.approveToken}`,
        `Reject: ${appUrl}/portal/approve/${info.rejectToken}`,
        '',
        'This link expires in 7 days.',
      ].join('\n'),
    })
  } catch (err) {
    logger.error({ err }, 'sendApprovalEmail: failed to send')
  }
}
