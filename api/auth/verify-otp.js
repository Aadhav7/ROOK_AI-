import { isValidContact, normalizeContact, readJsonBody, requireMethod, sendJson, verifyOtp } from '../_shared.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    const { email, phone, channel = 'email', otp, profile = {} } = await readJsonBody(req);
    const authChannel = channel === 'sms' ? 'sms' : 'email';
    const contact = normalizeContact(authChannel, authChannel === 'sms' ? phone : email);
    const token = String(otp || '').trim();
    if (!isValidContact(authChannel, contact)) {
      sendJson(res, 400, {
        error: authChannel === 'sms'
          ? 'Enter a mobile number in international format, for example +94771234567.'
          : 'Enter a valid email address.',
      });
      return;
    }
    if (!/^\d{6}$/.test(token)) {
      sendJson(res, 400, { error: 'Enter the 6-digit verification code.' });
      return;
    }

    const result = await verifyOtp({ channel: authChannel, contact, otp: token, profile });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Verification failed.' });
  }
}
