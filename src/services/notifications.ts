import { notificationRepo } from '../database/repositories';

/**
 * What actually happened to a message.
 *
 * 'Simulated' is the honest default when no provider is configured. Every
 * notification used to be written with status 'Sent' regardless, so the
 * dispatch log asserted that residents and vendors had been contacted when
 * nothing had left the process.
 */
export type DispatchStatus = 'Sent' | 'Simulated' | 'Failed';

export type Channel = 'WhatsApp' | 'SMS';

export interface OutboundMessage {
  to: string;
  body: string;
  channel: Channel;
}

export interface DispatchResult {
  status: DispatchStatus;
  provider: string;
  providerMessageId?: string;
  failureReason?: string;
}

export interface NotificationProvider {
  readonly name: string;
  send(message: OutboundMessage): Promise<DispatchResult>;
}

/**
 * Twilio wants E.164. The seed and the UI carry numbers like
 * "+91 98201 44321", which Twilio rejects.
 */
export function toE164(raw: string): string {
  const digits = (raw || '').replace(/[^0-9]/g, '');
  if (!digits) return '';
  // Indian numbers are stored both with and without the country code.
  if (digits.length === 10) return `+91${digits}`;
  return `+${digits}`;
}

/**
 * Used when no provider is configured: records the message and says plainly
 * that it was not delivered.
 */
export class ConsoleNotificationProvider implements NotificationProvider {
  readonly name = 'console';

  async send(message: OutboundMessage): Promise<DispatchResult> {
    console.info(
      `[notification:simulated] ${message.channel} -> ${message.to}: ${message.body.slice(0, 120)}`
    );
    return { status: 'Simulated', provider: this.name };
  }
}

/** Real delivery through Twilio's Messages API. */
export class TwilioNotificationProvider implements NotificationProvider {
  readonly name = 'twilio';

  constructor(
    private accountSid: string,
    private authToken: string,
    private fromNumber: string
  ) {}

  async send(message: OutboundMessage): Promise<DispatchResult> {
    const to = toE164(message.to);
    if (!to) {
      return { status: 'Failed', provider: this.name, failureReason: 'Recipient has no usable phone number' };
    }

    // WhatsApp and SMS are the same endpoint; the channel is carried by the
    // "whatsapp:" prefix on both ends.
    const prefix = message.channel === 'WhatsApp' ? 'whatsapp:' : '';

    const form = new URLSearchParams({
      To: `${prefix}${to}`,
      From: `${prefix}${toE164(this.fromNumber)}`,
      Body: message.body,
    });

    try {
      const response = await fetch(
        `https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`,
        {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form,
        }
      );

      const payload: any = await response.json().catch(() => ({}));

      if (!response.ok) {
        return {
          status: 'Failed',
          provider: this.name,
          failureReason: payload?.message || `Twilio responded ${response.status}`,
        };
      }

      return { status: 'Sent', provider: this.name, providerMessageId: payload?.sid };
    } catch (err) {
      return { status: 'Failed', provider: this.name, failureReason: (err as Error).message };
    }
  }
}

let provider: NotificationProvider | null = null;

export function getNotificationProvider(): NotificationProvider {
  if (!provider) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_FROM_NUMBER;

    provider = sid && token && from
      ? new TwilioNotificationProvider(sid, token, from)
      : new ConsoleNotificationProvider();
  }
  return provider;
}

/** Test seam: lets a suite substitute a provider without env juggling. */
export function setNotificationProvider(next: NotificationProvider | null): void {
  provider = next;
}

export interface SendRequest {
  ticketId: string;
  recipientType: 'resident' | 'vendor';
  recipientName: string;
  phone: string;
  message: string;
  channel?: Channel;
  language?: string;
}

/**
 * Dispatches a message and records what happened.
 *
 * Delivery is attempted first so the stored status reflects the real outcome
 * rather than an assumption. A failed dispatch is still logged -- the record
 * of the attempt is what makes an undelivered message visible.
 */
export async function sendNotification(request: SendRequest): Promise<any> {
  const channel: Channel = request.channel || 'WhatsApp';

  const result = await getNotificationProvider().send({
    to: request.phone,
    body: request.message,
    channel,
  });

  return notificationRepo.create({
    ticketId: request.ticketId,
    recipientType: request.recipientType,
    recipientName: request.recipientName,
    phone: request.phone,
    message: request.message,
    channel,
    language: request.language,
    status: result.status,
    provider: result.provider,
    providerMessageId: result.providerMessageId,
    failureReason: result.failureReason,
  });
}
