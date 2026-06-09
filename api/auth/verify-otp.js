import { isValidContact, normalizeContact, readJsonBody, requireMethod, sendJson, supabaseFetch, upsertProfile } from '../_shared.js';

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

    const payload = authChannel === 'sms'
      ? { phone: contact, token, type: 'sms' }
      : { email: contact, token, type: 'email' };

    const data = await supabaseFetch('/auth/v1/verify', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    const user = data.user;
    const sessionToken = data.access_token || data.session?.access_token;
    const savedProfile = user?.id ? await upsertProfile(user.id, profile).catch(() => profile) : profile;

    if (!sessionToken || !user?.id) {
      sendJson(res, 502, { error: 'Supabase verified the code but did not return a session. Check Auth OTP settings.' });
      return;
    }

    sendJson(res, 200, {
      token: sessionToken,
      user: {
        userId: user?.id,
        email: user?.email || (authChannel === 'email' ? contact : undefined),
        phone: user?.phone || (authChannel === 'sms' ? contact : undefined),
        authChannel,
      },
      profile: savedProfile,
    });
  } catch (error) {
    sendJson(res, 500, { error: error instanceof Error ? error.message : 'Verification failed.' });
  }
}
