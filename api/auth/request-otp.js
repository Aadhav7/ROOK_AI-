import { readJsonBody, requireMethod, sendJson, supabaseFetch } from '../_shared.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    const { email, phone, channel = 'email', profile = {} } = await readJsonBody(req);
    const authChannel = channel === 'sms' ? 'sms' : 'email';
    const payload = authChannel === 'sms'
      ? { phone: String(phone || '').trim(), data: { profile } }
      : { email: String(email || '').trim().toLowerCase(), data: { profile } };

    await supabaseFetch('/auth/v1/otp', {
      method: 'POST',
      body: JSON.stringify({
        ...payload,
        create_user: true,
      }),
    });

    sendJson(res, 200, {
      message: authChannel === 'sms'
        ? 'Verification code sent to your mobile number.'
        : 'Verification code sent to your email.',
    });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Could not send verification code.' });
  }
}
