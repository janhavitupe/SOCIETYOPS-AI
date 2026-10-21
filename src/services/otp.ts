import { logger } from '../logger';

/**
 * Delivery of one-time sign-in codes.
 *
 * Only a simulated sender exists for now: the code is written to the server
 * log instead of being texted. That keeps development and pilots working
 * without an SMS contract; a real sender (Twilio, MSG91, Gupshup) slots in
 * behind the same interface once one is chosen.
 */
export interface OtpSender {
  readonly name: string;
  send(phone: string, code: string, purpose: 'sign-in' | 'password-reset'): Promise<void>;
}

export class SimulatedOtpSender implements OtpSender {
  readonly name = 'simulated';

  async send(phone: string, code: string, purpose: 'sign-in' | 'password-reset'): Promise<void> {
    if (process.env.NODE_ENV === 'production') {
      logger.warn('OTP sender is simulated: codes are not delivered to users', { purpose });
      return;
    }
    // The code itself is only logged outside production.
    logger.info(`OTP for ${phone} (${purpose}): ${code}`, { simulated: true });
  }
}

let sender: OtpSender = new SimulatedOtpSender();

export const getOtpSender = (): OtpSender => sender;

/** Test seam: lets a suite capture codes instead of reading logs. */
export function setOtpSender(next: OtpSender | null): void {
  sender = next ?? new SimulatedOtpSender();
}
