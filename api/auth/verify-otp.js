import { readJsonBody, requireMethod, sendJson, supabaseFetch, upsertProfile } from '../_shared.js';

export default async function handler(req, res) {
  if (!requireMethod(req, res, 'POST')) return;

  try {
    const { email, phone, channel = 'email', otp, profile = {} } = await readJsonBody(req);
    const authChannel = channel === 'sms' ? 'sms' : 'email';
    const payload = authChannel === 'sms'
      ? { phone: String(phone || '').trim(), token: String(otp || '').trim(), type: 'sms' }
      : { email: String(email || '').trim().toLowerCase(), token: String(otp || '').trim(), type: 'email' };

    const data = await supabaseFetch('/auth/v1/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const user = data.user;
    const savedProfile = user?.id ? await upsertProfile(user.id, profile) : null;

    sendJson(res, 200, {
      token: data.access_token,
      user: {
        userId: user?.id,
        email: user?.email,
        phone: user?.phone,
        authChannel,
      },
      profile: savedProfile,
    });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Verification failed.' });
  }
}
