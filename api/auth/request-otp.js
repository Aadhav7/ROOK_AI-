import { createOtp, isValidContact, normalizeContact, readJsonBody, requireMethod, sendJson } from '../_shared.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    const { email, phone, channel = 'email', profile = {} } = await readJsonBody(req);
    const authChannel = channel === 'sms' ? 'sms' : 'email';
    const contact = normalizeContact(authChannel, authChannel === 'sms' ? phone : email);
    if (!isValidContact(authChannel, contact)) {
      sendJson(res, 400, {
        error: authChannel === 'sms'
          ? 'Enter a mobile number in international format, for example +94771234567.'
          : 'Enter a valid email address.',
      });
      return;
    }

    const result = await createOtp({ channel: authChannel, contact, profile });
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Could not send verification code.' });
  }
}
