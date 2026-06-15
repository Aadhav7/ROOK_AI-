import { createHash, createHmac, randomInt, timingSafeEqual } from 'node:crypto';

function envValue(...names) {
  for (const name of names) {
    const value = String(process.env[name] || '').trim();
    if (value && value !== '""' && value !== "''") return value;
  }
  return '';
}

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-1.5-flash';
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const ANYTHINGLLM_BASE_URL = (process.env.ANYTHINGLLM_BASE_URL || '').replace(/\/$/, '');
const ANYTHINGLLM_API_KEY = process.env.ANYTHINGLLM_API_KEY || '';
const WORKSPACE_SLUG = process.env.ANYTHINGLLM_WORKSPACE_SLUG || 'my-workspace';
const EMAIL_WEBHOOK_URL = process.env.EMAIL_WEBHOOK_URL || '';
const SMS_WEBHOOK_URL = process.env.SMS_WEBHOOK_URL || '';
const MONGODB_URI = process.env.MONGODB_URI || '';
const DATA_API_URL = process.env.MONGODB_DATA_API_URL || '';
const DATA_API_KEY = process.env.MONGODB_DATA_API_KEY || '';
const DATA_SOURCE = process.env.MONGODB_DATA_SOURCE || 'Cluster0';
const DATABASE = process.env.MONGODB_DATABASE || 'rook_ai';
const USERS_COLLECTION = process.env.MONGODB_USERS_COLLECTION || 'users';
const PROFILES_COLLECTION = process.env.MONGODB_PROFILES_COLLECTION || 'profiles';
const OTP_COLLECTION = process.env.MONGODB_OTP_COLLECTION || 'otp_events';
const CHAT_COLLECTION = process.env.MONGODB_CHAT_COLLECTION || process.env.MONGODB_EVENTS_COLLECTION || 'user_events';
const SESSION_SECRET = envValue('SESSION_SECRET', 'JWT_SECRET') || GEMINI_API_KEY || 'rook-ai-dev-session-secret';
const IS_DEPLOYED = Boolean(process.env.VERCEL || process.env.VERCEL_ENV);

export const config = {
  GEMINI_API_KEY,
  GEMINI_TEXT_MODEL,
  GEMINI_IMAGE_MODEL,
  ANYTHINGLLM_BASE_URL,
  ANYTHINGLLM_API_KEY,
  WORKSPACE_SLUG,
  EMAIL_WEBHOOK_URL,
  SMS_WEBHOOK_URL,
  MONGODB_URI,
  DATA_API_URL,
  DATA_API_KEY,
};

const memoryStore = globalThis.__rookAiMemoryStore ||= {
  otps: new Map(),
  profiles: new Map(),
  chats: [],
};
let mongoClientPromise;

function hasDatabase() {
  return Boolean(MONGODB_URI || (DATA_API_URL && DATA_API_KEY));
}

export function sendJson(res, statusCode, payload) {
  res.status(statusCode).json(payload);
}

export function requireMethod(req, res, method) {
  if (req.method === method) return true;
  sendJson(res, 405, { error: `Method ${req.method} is not allowed.` });
  return false;
}

export function getBearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

export async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') return JSON.parse(req.body || '{}');
  return {};
}

export function normalizeContact(channel, value = '') {
  const contact = String(value || '').trim();
  if (channel !== 'sms') return contact.toLowerCase();

  let phone = contact.replace(/[^\d+]/g, '');
  if (phone.startsWith('00')) phone = `+${phone.slice(2)}`;
  if (!phone.startsWith('+')) {
    const localDigits = phone.replace(/\D/g, '');
    if (/^0?7\d{8}$/.test(localDigits)) {
      phone = `+94${localDigits.replace(/^0/, '')}`;
    } else {
      phone = `+${localDigits}`;
    }
  }
  return phone;
}

export function isValidContact(channel, value = '') {
  if (channel === 'sms') {
    const phone = normalizeContact('sms', value);
    return /^\+[1-9]\d{7,14}$/.test(phone) && (!phone.startsWith('+94') || /^\+947\d{8}$/.test(phone));
  }
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function hash(value) {
  return createHash('sha256').update(String(value)).digest('hex');
}

function otpKey(channel, contact) {
  return `${channel}:${normalizeContact(channel, contact)}`;
}

function userIdFor(channel, contact) {
  return hash(otpKey(channel, contact)).slice(0, 32);
}

function cleanProfile(profile = {}) {
  return {
    name: String(profile.name || '').trim().slice(0, 80),
    age: String(profile.age || '').trim().slice(0, 20),
    role: String(profile.role || '').trim().slice(0, 80),
    goal: String(profile.goal || '').trim().slice(0, 180),
  };
}

function base64url(input) {
  return Buffer.from(input).toString('base64url');
}

function signSession(payload) {
  const encoded = base64url(JSON.stringify(payload));
  const signature = createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  return `${encoded}.${signature}`;
}

function verifySessionToken(token) {
  const [encoded, signature] = String(token || '').split('.');
  if (!encoded || !signature) return null;

  const expected = createHmac('sha256', SESSION_SECRET).update(encoded).digest('base64url');
  const actualBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expected);
  if (actualBuffer.length !== expectedBuffer.length || !timingSafeEqual(actualBuffer, expectedBuffer)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (!payload?.userId || Number(payload.expiresAt) < Date.now()) return null;
    return payload;
  } catch {
    return null;
  }
}

async function mongoCollection(collection) {
  if (!MONGODB_URI) return null;
  const { MongoClient, ServerApiVersion } = await import('mongodb');
  mongoClientPromise ||= new MongoClient(MONGODB_URI, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  }).connect();
  const client = await mongoClientPromise;
  return client.db(DATABASE).collection(collection);
}

async function dataApi(action, collection, payload) {
  if (!DATA_API_URL || !DATA_API_KEY) return null;
  const response = await fetch(`${DATA_API_URL.replace(/\/$/, '')}/action/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'api-key': DATA_API_KEY,
    },
    body: JSON.stringify({
      dataSource: DATA_SOURCE,
      database: DATABASE,
      collection,
      ...payload,
    }),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) throw new Error(data.error || data.message || `MongoDB Data API failed: ${response.status}`);
  return data;
}

async function dbFindOne(collectionName, filter) {
  const collection = await mongoCollection(collectionName);
  if (collection) return collection.findOne(filter);

  const data = await dataApi('findOne', collectionName, { filter });
  return data?.document || null;
}

async function dbInsertOne(collectionName, document) {
  const collection = await mongoCollection(collectionName);
  if (collection) return collection.insertOne(document);

  return dataApi('insertOne', collectionName, { document });
}

async function dbUpsertOne(collectionName, filter, document) {
  const collection = await mongoCollection(collectionName);
  if (collection) return collection.updateOne(filter, { $set: document }, { upsert: true });

  return dataApi('updateOne', collectionName, {
    filter,
    update: { $set: document },
    upsert: true,
  });
}

async function sendOtpEmail(email, otp) {
  if (!EMAIL_WEBHOOK_URL) {
    if (IS_DEPLOYED) throw new Error('Email OTP is not configured. Add EMAIL_WEBHOOK_URL in Vercel.');
    return;
  }
  const response = await fetch(EMAIL_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: email,
      subject: 'Your Rook AI verification code',
      text: `Your Rook AI verification code is ${otp}. It expires in 10 minutes.`,
    }),
  });
  if (!response.ok) throw new Error(`Email webhook returned ${response.status}`);
}

async function sendOtpSms(phone, otp) {
  if (!SMS_WEBHOOK_URL) {
    if (IS_DEPLOYED) throw new Error('SMS OTP is not configured. Add SMS_WEBHOOK_URL in Vercel.');
    return;
  }
  const response = await fetch(SMS_WEBHOOK_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: phone,
      text: `Your Rook AI verification code is ${otp}. It expires in 10 minutes.`,
    }),
  });
  if (!response.ok) throw new Error(`SMS webhook returned ${response.status}`);
}

export async function createOtp({ channel, contact, profile }) {
  const otp = String(randomInt(100000, 999999));
  const key = otpKey(channel, contact);
  const record = {
    key,
    channel,
    contact,
    otpHash: hash(otp),
    attempts: 0,
    profile: cleanProfile(profile),
    expiresAt: Date.now() + 10 * 60 * 1000,
    createdAt: new Date().toISOString(),
  };

  if (IS_DEPLOYED && !hasDatabase()) {
    throw new Error('OTP storage is not configured. Add MONGODB_URI or MongoDB Data API variables in Vercel.');
  }

  if (hasDatabase()) {
    await dbUpsertOne(OTP_COLLECTION, { key }, record);
  } else {
    memoryStore.otps.set(key, record);
  }

  if (channel === 'sms') await sendOtpSms(contact, otp);
  else await sendOtpEmail(contact, otp);

  return {
    contact,
    devOtp: (channel === 'sms' ? SMS_WEBHOOK_URL : EMAIL_WEBHOOK_URL) ? undefined : otp,
    message: channel === 'sms'
      ? 'Verification code sent to your mobile number.'
      : 'Verification code sent to your email.',
  };
}

export async function verifyOtp({ channel, contact, otp, profile }) {
  const key = otpKey(channel, contact);
  let record;

  if (hasDatabase()) {
    record = await dbFindOne(OTP_COLLECTION, { key });
  } else {
    record = memoryStore.otps.get(key);
  }

  if (!record) throw new Error('No verification code was found. Request a new one.');
  if (Number(record.expiresAt) < Date.now()) {
    if (!hasDatabase()) memoryStore.otps.delete(key);
    throw new Error('The verification code expired. Request a new one.');
  }
  if (Number(record.attempts || 0) >= 5) throw new Error('Too many attempts. Request a new verification code.');
  if (record.otpHash !== hash(String(otp || '').trim())) {
    const attempts = Number(record.attempts || 0) + 1;
    if (hasDatabase()) {
      await dbUpsertOne(OTP_COLLECTION, { key }, { ...record, attempts });
    } else {
      memoryStore.otps.set(key, { ...record, attempts });
    }
    throw new Error('Incorrect verification code.');
  }

  if (!hasDatabase()) memoryStore.otps.delete(key);

  const userId = userIdFor(channel, contact);
  const savedProfile = await upsertProfile(userId, profile || record.profile || {});
  const user = {
    id: userId,
    userId,
    email: channel === 'email' ? contact : undefined,
    phone: channel === 'sms' ? contact : undefined,
    authChannel: channel,
  };
  const token = signSession({ ...user, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000 });

  await dbInsertOne(USERS_COLLECTION, {
    ...user,
    provider: `${channel}-otp`,
    verifiedAt: new Date().toISOString(),
  }).catch(() => null);

  return { token, user, profile: savedProfile };
}

export async function getSessionUser(req) {
  const token = getBearerToken(req);
  const user = verifySessionToken(token);
  return user ? { token, user } : null;
}

export async function requireSession(req, res) {
  const session = await getSessionUser(req);
  if (!session?.user?.id) {
    sendJson(res, 401, { error: 'Please verify your email or mobile number before using Rook AI.' });
    return null;
  }
  return session;
}

export async function upsertProfile(userId, profile = {}) {
  const document = {
    id: userId,
    userId,
    ...cleanProfile(profile),
    updatedAt: new Date().toISOString(),
  };

  if (hasDatabase()) {
    await dbUpsertOne(PROFILES_COLLECTION, { userId }, document);
  } else {
    memoryStore.profiles.set(userId, document);
  }
  return cleanProfile(document);
}

export async function getProfile(userId) {
  if (hasDatabase()) {
    return dbFindOne(PROFILES_COLLECTION, { userId });
  }
  return memoryStore.profiles.get(userId) || null;
}

export async function saveChatMessage({ userId, role, mode, content, provider, imageUrl }) {
  const document = {
    userId,
    type: 'chat_message',
    role,
    mode,
    content,
    provider,
    imageUrl,
    createdAt: new Date().toISOString(),
  };

  if (hasDatabase()) {
    await dbInsertOne(CHAT_COLLECTION, document).catch(() => null);
  } else {
    memoryStore.chats.push(document);
  }
}

export function buildPersonaPrompt(message, profile = {}, mode = 'general') {
  const name = profile?.name || 'friend';
  const role = profile?.role ? ` They are a ${profile.role}.` : '';
  const age = profile?.age ? ` Age: ${profile.age}.` : '';
  const goal = profile?.goal ? ` Their goal is: ${profile.goal}.` : '';
  return [
    'You are Rook AI, a warm, friendly AI chat assistant.',
    'Be clear, useful, natural, and concise. Use the user name only when it feels right.',
    'For normal questions, answer from broad general knowledge. For document mode, use uploaded workspace context when available.',
    `User profile: name=${name}.${role}${age}${goal}`,
    `Current mode: ${mode}.`,
    `User message: ${message}`,
  ].join('\n');
}

export async function generateGeminiText(message, profile, mode = 'general') {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini is not configured. Add GEMINI_API_KEY in Vercel.');
  }
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_TEXT_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildPersonaPrompt(message, profile, mode) }] }],
      }),
    }
  );
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Gemini returned ${response.status}`);
  }
  const text = data.candidates?.[0]?.content?.parts?.map(part => part.text).filter(Boolean).join('\n').trim();
  if (!text) throw new Error('Gemini did not return an answer.');
  return { text, provider: GEMINI_TEXT_MODEL };
}

export async function proxyAnythingLLM(message, profile) {
  if (!ANYTHINGLLM_BASE_URL || !ANYTHINGLLM_API_KEY) {
    throw new Error('AnythingLLM is not configured for document chat.');
  }
  const response = await fetch(`${ANYTHINGLLM_BASE_URL}/v1/workspace/${WORKSPACE_SLUG}/chat`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${ANYTHINGLLM_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: buildPersonaPrompt(message, profile, 'documents'),
      mode: 'query',
    }),
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || data.message || `AnythingLLM returned ${response.status}`);
  }
  return {
    text: data.textResponse || data.response || data.message || 'No answer returned by AnythingLLM.',
    provider: 'anythingllm',
    raw: data,
  };
}
