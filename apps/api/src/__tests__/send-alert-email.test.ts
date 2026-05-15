import { describe, it, expect, vi } from 'vitest';

const mockSendMail = vi.fn().mockResolvedValue({ messageId: 'test-id' });
const mockCreateTransport = vi.fn().mockReturnValue({ sendMail: mockSendMail });

vi.mock('nodemailer', () => ({
  default: { createTransport: mockCreateTransport },
}));

const mockSmtp = {
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  user: 'noreply@example.com',
  password: 'secret',
  from: 'Vantage <noreply@example.com>',
};

describe('sendAlertEmail', () => {
  it('creates transport and sends email to admin addresses', async () => {
    const { sendAlertEmail } = await import('../lib/send-alert-email');
    await sendAlertEmail(mockSmtp, ['admin@example.com'], {
      severity: 'critical',
      message: 'CPU usage at 97% on "prod-server" (threshold: 85%)',
      resource_type: 'server',
    });
    expect(mockCreateTransport).toHaveBeenCalledWith(expect.objectContaining({ host: 'smtp.example.com' }));
    expect(mockSendMail).toHaveBeenCalledWith(expect.objectContaining({
      to: expect.stringContaining('admin@example.com'),
      subject: expect.stringContaining('critical'),
    }));
  });

  it('does not throw when smtp is null', async () => {
    const { sendAlertEmail } = await import('../lib/send-alert-email');
    await expect(sendAlertEmail(null, [], {
      severity: 'warning', message: 'test', resource_type: 'server',
    })).resolves.not.toThrow();
  });

  it('does not throw when adminEmails is empty', async () => {
    const { sendAlertEmail } = await import('../lib/send-alert-email');
    await expect(sendAlertEmail(mockSmtp, [], {
      severity: 'info', message: 'test', resource_type: 'server',
    })).resolves.not.toThrow();
  });
});
