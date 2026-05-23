import { createHash, randomBytes, randomInt } from 'node:crypto';
import { createReadStream, existsSync, readFileSync } from 'node:fs';
import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';

function loadDotEnv() {
  const envPath = resolve('.env');
  if (!existsSync(envPath)) return;

  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const separator = trimmed.indexOf('=');
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    const value = trimmed.slice(separator + 1).trim().replace(/^["']|["']$/g, '');
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

loadDotEnv();

const PORT = Number(process.env.PORT || 8787);
const ANYTHINGLLM_BASE_URL = (process.env.ANYTHINGLLM_BASE_URL || 'http://localhost:3001/api').replace(/\/$/, '');
const ANYTHINGLLM_API_KEY = process.env.ANYTHINGLLM_API_KEY || '7ZCNN63-MD44TTE-K3QJJYW-0NJVHYE';
const WORKSPACE_SLUG = process.env.ANYTHINGLLM_WORKSPACE_SLUG || 'my-workspace';
const APP_ORIGIN = process.env.APP_ORIGIN || '*';
const MONGODB_URI = process.env.MONGODB_URI;
const DATA_API_URL = process.env.MONGODB_DATA_API_URL;
const DATA_API_KEY = process.env.MONGODB_DATA_API_KEY;
const DATA_SOURCE = process.env.MONGODB_DATA_SOURCE || 'Cluster0';
const DATABASE = process.env.MONGODB_DATABASE || 'rook_ai';
const USERS_COLLECTION = process.env.MONGODB_USERS_COLLECTION || 'users';
const PROFILES_COLLECTION = process.env.MONGODB_PROFILES_COLLECTION || 'profiles';
const OTP_COLLECTION = process.env.MONGODB_OTP_COLLECTION || 'otp_events';
const EVENTS_COLLECTION = process.env.MONGODB_EVENTS_COLLECTION || 'user_events';
const EMAIL_WEBHOOK_URL = process.env.EMAIL_WEBHOOK_URL;
const SMS_WEBHOOK_URL = process.env.SMS_WEBHOOK_URL;
const GOOGLE_AUTH_URL = process.env.GOOGLE_AUTH_URL;
const GITHUB_AUTH_URL = process.env.GITHUB_AUTH_URL;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_TEXT_MODEL = process.env.GEMINI_TEXT_MODEL || 'gemini-1.5-flash';
const GEMINI_IMAGE_MODEL = process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image';
const OLLAMA_BASE_URL = (process.env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '');
const OLLAMA_GENERAL_MODEL = process.env.OLLAMA_GENERAL_MODEL || 'qwen2.5:0.5b';
const DIST_DIR = resolve('dist');
const STATE_FILE = resolve('.rook-ai-state.json');

const otpStore = new Map();
const sessionStore = new Map();
const profileStore = new Map();
let mongoClientPromise;

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

async function loadState() {
  try {
    const state = JSON.parse(await readFile(STATE_FILE, 'utf8'));
    for (const [token, session] of Object.entries(state.sessions || {})) {
      if (session.expiresAt > Date.now()) sessionStore.set(token, session);
    }
    for (const [email, profile] of Object.entries(state.profiles || {})) {
      profileStore.set(email, profile);
    }
  } catch {
    // First run: no state file yet.
  }
}

async function saveState() {
  await mkdir(dirname(STATE_FILE), { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify({
    sessions: Object.fromEntries(sessionStore),
    profiles: Object.fromEntries(profileStore),
  }, null, 2));
}

function sendJson(res, statusCode, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': APP_ORIGIN,
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function hash(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizeContact(channel, contact) {
  const value = String(contact || '').trim();
  if (channel === 'sms') return value.replace(/[^\d+]/g, '');
  return value.toLowerCase();
}

function getOtpKey(channel, contact) {
  return `${channel}:${normalizeContact(channel, contact)}`;
}

function isValidContact(channel, contact) {
  if (channel === 'sms') return /^\+?[1-9]\d{7,14}$/.test(contact);
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contact);
}

function getBearerToken(req) {
  const header = req.headers.authorization || '';
  return header.startsWith('Bearer ') ? header.slice(7) : '';
}

function getSession(req) {
  const token = getBearerToken(req);
  const session = sessionStore.get(token);

  if (!session || session.expiresAt < Date.now()) {
    if (token) sessionStore.delete(token);
    void saveState();
    return null;
  }

  return session;
}

function requireSession(req, res) {
  const session = getSession(req);
  if (!session) {
    sendJson(res, 401, { error: 'Please verify your email or mobile number before using Rook AI.' });
  }
  return session;
}

async function mongoAction(action, collection, document) {
  if (MONGODB_URI) {
    if (action !== 'insertOne') return null;
    const { MongoClient, ServerApiVersion } = await import('mongodb');
    mongoClientPromise ||= new MongoClient(MONGODB_URI, {
      serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
      },
    }).connect();
    const client = await mongoClientPromise;
    return client.db(DATABASE).collection(collection).insertOne(document);
  }

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
      document,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`MongoDB Data API failed: ${text}`);
  }

  return response.json();
}

async function saveUserLogin(sessionIdentity) {
  const document = {
    ...sessionIdentity,
    verifiedAt: new Date().toISOString(),
    provider: `${sessionIdentity.authChannel}-otp`,
  };

  await mongoAction('insertOne', USERS_COLLECTION, document);
  return document;
}

async function saveUserEvent(sessionIdentity, type, details = {}) {
  await mongoAction('insertOne', EVENTS_COLLECTION, {
    ...sessionIdentity,
    type,
    details,
    createdAt: new Date().toISOString(),
  });
}

async function saveUserProfile(sessionIdentity, profile) {
  const cleanProfile = {
    name: String(profile.name || '').trim().slice(0, 80),
    age: String(profile.age || '').trim().slice(0, 20),
    role: String(profile.role || '').trim().slice(0, 80),
    goal: String(profile.goal || '').trim().slice(0, 180),
  };

  profileStore.set(sessionIdentity.userId, cleanProfile);
  await saveState();
  await mongoAction('insertOne', PROFILES_COLLECTION, {
    ...sessionIdentity,
    ...cleanProfile,
    updatedAt: new Date().toISOString(),
  });
  return cleanProfile;
}

async function sendOtpEmail(email, otp) {
  if (EMAIL_WEBHOOK_URL) {
    await fetch(EMAIL_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: email,
        subject: 'Your Rook AI verification code',
        text: `Your Rook AI verification code is ${otp}. It expires in 10 minutes.`,
      }),
    });
    return;
  }

  console.log(`Rook AI OTP for ${email}: ${otp}`);
}

async function sendOtpSms(phone, otp) {
  if (SMS_WEBHOOK_URL) {
    await fetch(SMS_WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        to: phone,
        text: `Your Rook AI verification code is ${otp}. It expires in 10 minutes.`,
      }),
    });
    return;
  }

  console.log(`Rook AI SMS OTP for ${phone}: ${otp}`);
}

async function proxyAnythingLLM(path, init) {
  const response = await fetch(`${ANYTHINGLLM_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ANYTHINGLLM_API_KEY}`,
      ...init.headers,
    },
  });

  const text = await response.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { message: text };
  }

  if (!response.ok) {
    const message = data.error || data.message || `AnythingLLM returned ${response.status}`;
    throw new Error(message);
  }

  return data;
}

function parseDataUrl(dataUrl) {
  const match = /^data:(.+);base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  return { mimeType: match[1], data: match[2] };
}

function escapeSvg(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function splitWordsIntoLines(text, maxLineLength = 34, maxLines = 3) {
  const words = String(text || '').replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  const lines = [];

  for (const word of words) {
    const current = lines[lines.length - 1] || '';
    if (!current) {
      lines.push(word);
    } else if (`${current} ${word}`.length <= maxLineLength) {
      lines[lines.length - 1] = `${current} ${word}`;
    } else if (lines.length < maxLines) {
      lines.push(word);
    }
  }

  return lines.length ? lines : ['Study visual'];
}

function createLocalStudyVisual(prompt, reason = '') {
  const title = splitWordsIntoLines(prompt, 42, 2);
  const topic = title.join(' ');
  const isArchitecture = /\b(architecture|tier|layer|client|server|database|frontend|backend|api)\b/i.test(prompt);
  const isTree = /\b(tree|hierarchy|diagram|mind\s*map|flow)\b/i.test(prompt);
  const nodes = isTree
    ? ['Root idea', 'Branch 1', 'Branch 2', 'Branch 3', 'Detail A', 'Detail B']
    : ['Key point', 'Example', 'Connection', 'Result', 'Review'];
  const warning = reason
    ? 'Nano Banana quota is unavailable, so Rook generated this local study visual.'
    : 'Generated as a local study visual.';

  const nodeText = nodes.map((node, index) => escapeSvg(node || `Point ${index + 1}`));
  const svg = isArchitecture ? `
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#0f172a"/>
          <stop offset="0.5" stop-color="#1e1b4b"/>
          <stop offset="1" stop-color="#0f766e"/>
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity="0.35"/>
        </filter>
        <marker id="arrow" markerWidth="14" markerHeight="14" refX="10" refY="5" orient="auto">
          <path d="M0,0 L10,5 L0,10 Z" fill="#67e8f9"/>
        </marker>
      </defs>
      <rect width="1280" height="720" rx="32" fill="url(#bg)"/>
      <text x="640" y="72" text-anchor="middle" fill="#f8fafc" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="850">${escapeSvg(title[0])}</text>
      ${title[1] ? `<text x="640" y="112" text-anchor="middle" fill="#99f6e4" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="650">${escapeSvg(title[1])}</text>` : ''}
      <g stroke="#67e8f9" stroke-width="6" marker-end="url(#arrow)" opacity="0.9">
        <path d="M370 335 H500"/>
        <path d="M780 335 H910"/>
      </g>
      <g filter="url(#shadow)" font-family="Inter, Arial, sans-serif" text-anchor="middle">
        <rect x="110" y="230" width="260" height="210" rx="28" fill="#e0f2fe"/>
        <text x="240" y="290" fill="#075985" font-size="26" font-weight="850">Presentation Tier</text>
        <text x="240" y="335" fill="#334155" font-size="19">UI, browser, mobile app</text>
        <text x="240" y="372" fill="#334155" font-size="19">Collects user requests</text>
        <rect x="510" y="230" width="260" height="210" rx="28" fill="#ede9fe"/>
        <text x="640" y="290" fill="#4c1d95" font-size="26" font-weight="850">Application Tier</text>
        <text x="640" y="335" fill="#334155" font-size="19">Business logic and APIs</text>
        <text x="640" y="372" fill="#334155" font-size="19">Processes syllabus tasks</text>
        <rect x="910" y="230" width="260" height="210" rx="28" fill="#dcfce7"/>
        <text x="1040" y="290" fill="#166534" font-size="26" font-weight="850">Data Tier</text>
        <text x="1040" y="335" fill="#334155" font-size="19">Database and files</text>
        <text x="1040" y="372" fill="#334155" font-size="19">Stores documents/results</text>
      </g>
      <rect x="150" y="520" width="980" height="74" rx="22" fill="#020617" opacity="0.45"/>
      <text x="640" y="565" text-anchor="middle" fill="#cffafe" font-family="Inter, Arial, sans-serif" font-size="22" font-weight="700">Request flows from user interface to logic, then to stored data and back as a response.</text>
      <text x="640" y="670" text-anchor="middle" fill="#ccfbf1" font-family="Inter, Arial, sans-serif" font-size="18">${escapeSvg(warning)}</text>
    </svg>`
    : isTree ? `
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#111827"/>
          <stop offset="0.55" stop-color="#312e81"/>
          <stop offset="1" stop-color="#581c87"/>
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="12" stdDeviation="14" flood-color="#000" flood-opacity="0.35"/>
        </filter>
      </defs>
      <rect width="1280" height="720" rx="32" fill="url(#bg)"/>
      <text x="640" y="70" text-anchor="middle" fill="#f8fafc" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="800">${escapeSvg(title[0])}</text>
      ${title[1] ? `<text x="640" y="112" text-anchor="middle" fill="#c4b5fd" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="600">${escapeSvg(title[1])}</text>` : ''}
      <g stroke="#a78bfa" stroke-width="5" stroke-linecap="round" opacity="0.85">
        <path d="M640 196 L390 330"/>
        <path d="M640 196 L640 330"/>
        <path d="M640 196 L890 330"/>
        <path d="M390 410 L310 520"/>
        <path d="M390 410 L470 520"/>
      </g>
      <g filter="url(#shadow)" font-family="Inter, Arial, sans-serif" text-anchor="middle">
        <rect x="500" y="145" width="280" height="90" rx="24" fill="#ffffff" opacity="0.98"/>
        <text x="640" y="200" fill="#312e81" font-size="24" font-weight="800">${nodeText[0]}</text>
        <rect x="260" y="325" width="260" height="86" rx="22" fill="#ede9fe"/>
        <text x="390" y="378" fill="#4c1d95" font-size="22" font-weight="800">${nodeText[1]}</text>
        <rect x="510" y="325" width="260" height="86" rx="22" fill="#e0f2fe"/>
        <text x="640" y="378" fill="#075985" font-size="22" font-weight="800">${nodeText[2]}</text>
        <rect x="760" y="325" width="260" height="86" rx="22" fill="#dcfce7"/>
        <text x="890" y="378" fill="#166534" font-size="22" font-weight="800">${nodeText[3]}</text>
        <rect x="185" y="520" width="250" height="78" rx="20" fill="#fef3c7"/>
        <text x="310" y="568" fill="#92400e" font-size="20" font-weight="800">${nodeText[4]}</text>
        <rect x="445" y="520" width="250" height="78" rx="20" fill="#ffe4e6"/>
        <text x="570" y="568" fill="#9f1239" font-size="20" font-weight="800">${nodeText[5]}</text>
      </g>
      <text x="640" y="670" text-anchor="middle" fill="#ddd6fe" font-family="Inter, Arial, sans-serif" font-size="18">${escapeSvg(warning)}</text>
    </svg>`
    : `
    <svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#0f172a"/>
          <stop offset="0.5" stop-color="#155e75"/>
          <stop offset="1" stop-color="#14532d"/>
        </linearGradient>
        <filter id="shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.3"/>
        </filter>
      </defs>
      <rect width="1280" height="720" rx="32" fill="url(#bg)"/>
      <text x="90" y="94" fill="#f8fafc" font-family="Inter, Arial, sans-serif" font-size="34" font-weight="850">${escapeSvg(title[0])}</text>
      ${title[1] ? `<text x="90" y="136" fill="#bae6fd" font-family="Inter, Arial, sans-serif" font-size="24" font-weight="650">${escapeSvg(title[1])}</text>` : ''}
      <g filter="url(#shadow)" font-family="Inter, Arial, sans-serif">
        ${nodeText.map((node, index) => {
          const x = 110 + (index % 3) * 360;
          const y = index < 3 ? 220 : 430;
          return `<rect x="${x}" y="${y}" width="300" height="128" rx="24" fill="${index % 2 ? '#ecfeff' : '#f0fdf4'}"/>
            <text x="${x + 28}" y="${y + 58}" fill="#0f172a" font-size="24" font-weight="800">${node}</text>
            <text x="${x + 28}" y="${y + 92}" fill="#475569" font-size="17">Connected to ${escapeSvg(topic.slice(0, 28) || 'the topic')}</text>`;
        }).join('')}
      </g>
      <text x="640" y="670" text-anchor="middle" fill="#ccfbf1" font-family="Inter, Arial, sans-serif" font-size="18">${escapeSvg(warning)}</text>
    </svg>`;

  return {
    imageUrl: `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`,
    text: warning,
    model: 'rook-local-study-visual',
    fallback: true,
  };
}

function isQuotaError(error) {
  return error instanceof Error && /quota|rate.?limit|429|free_tier/i.test(error.message);
}

async function getWorkspaceVisualContext(prompt, session, profile) {
  try {
    const data = await proxyAnythingLLM(`/v1/workspace/${WORKSPACE_SLUG}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: [
          'Use the uploaded syllabus, PPT files, and documents only.',
          'Extract the most relevant facts, terms, structure, relationships, and examples needed to draw a useful study diagram.',
          'Return concise visual design notes. Do not answer conversationally.',
          buildPersonaPrompt(prompt, profileStore.get(session.userId) || profileStore.get(session.email) || profile || {}, 'documents'),
        ].join('\n'),
        mode: 'query',
      }),
    });

    return String(data.textResponse || data.response || data.message || '').trim().slice(0, 1800);
  } catch {
    return '';
  }
}

function buildStudyVisualPrompt(prompt, workspaceContext, profile) {
  const learner = profile?.role || 'student';
  return [
    'Create a clean syllabus-oriented educational visual for a learner.',
    'Prefer diagrams, charts, architecture layers, timelines, flowcharts, mind maps, labeled examples, and study-friendly layouts when useful.',
    'Use clear labels, high contrast, and concise text. Do not include fake URLs or markdown image placeholders.',
    `Learner type: ${learner}.`,
    workspaceContext ? `Relevant syllabus/PPT/document context:\n${workspaceContext}` : 'No document context was available; use the user request directly.',
    `User request: ${prompt}`,
  ].join('\n\n');
}

async function generateGeminiImage({ prompt, referenceImage }) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini image generation is not configured. Add GEMINI_API_KEY to your environment.');
  }

  const parts = [{ text: prompt }];
  const parsedImage = parseDataUrl(referenceImage);
  if (parsedImage) {
    parts.unshift({
      inlineData: {
        mimeType: parsedImage.mimeType,
        data: parsedImage.data,
      },
    });
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_IMAGE_MODEL}:generateContent`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': GEMINI_API_KEY,
      },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: {
          responseModalities: ['Image'],
        },
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Gemini image generation returned ${response.status}`);
  }

  const responseParts = data.candidates?.[0]?.content?.parts || [];
  const imagePart = responseParts.find(part => part.inlineData || part.inline_data);
  const textPart = responseParts.find(part => part.text);
  const inlineData = imagePart?.inlineData || imagePart?.inline_data;

  if (!inlineData?.data) {
    throw new Error(textPart?.text || 'Gemini did not return an image.');
  }

  return {
    imageUrl: `data:${inlineData.mimeType || 'image/png'};base64,${inlineData.data}`,
    text: textPart?.text || 'Image generated successfully.',
    model: GEMINI_IMAGE_MODEL,
  };
}

function getProfileName(profile, fallbackEmail) {
  return profile?.name || fallbackEmail.split('@')[0] || 'friend';
}

function buildPersonaPrompt(message, profile, mode) {
  const name = getProfileName(profile, 'friend@example.com');
  const role = profile?.role ? ` They are a ${profile.role}.` : '';
  const age = profile?.age ? ` Age: ${profile.age}.` : '';
  const goal = profile?.goal ? ` Their goal is: ${profile.goal}.` : '';

  return [
    'You are Rook AI, a warm, humanoid, friendly AI companion.',
    'Talk naturally, use the user name when it feels right, and use a few helpful emojis.',
    'If you make a mistake or need to correct yourself, say casual things like "sorry", "oh I forgot", or "my bad".',
    'Answer from general knowledge for random questions. Do not limit yourself to uploaded documents unless the user asks document-specific questions.',
    'Be concise, clear, supportive, and useful.',
    `User profile: name=${name}.${role}${age}${goal}`,
    `Current mode: ${mode}.`,
    `User message: ${message}`,
  ].join('\n');
}

function localFriendlyReply(message, profile) {
  const name = getProfileName(profile, 'friend@example.com');
  const normalized = message.trim().toLowerCase();

  if (/^(hi|hello|hey|yo|sup)\b/.test(normalized)) {
    return `Hey ${name}! 😊 I'm here with you. You can ask me random questions, study questions, or upload files and I’ll help from those too.`;
  }

  if (normalized.includes('who are you')) {
    return `I’m Rook AI, ${name} — your study and creative chat assistant 😊 I can chat normally, help with uploaded docs, and generate images once the Gemini key is connected.`;
  }

  return `Sorry ${name}, my bad 😅 I can chat with you, but the main AI engine is not responding right now. Please check AnythingLLM or add GEMINI_API_KEY for stronger general answers.`;
}

async function generateGeminiText(message, profile) {
  if (!GEMINI_API_KEY) {
    throw new Error('Gemini text chat is not configured.');
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
        contents: [{ parts: [{ text: buildPersonaPrompt(message, profile, 'general') }] }],
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error?.message || `Gemini text chat returned ${response.status}`);
  }

  const text = data.candidates?.[0]?.content?.parts?.map(part => part.text).filter(Boolean).join('\n').trim();
  if (!text) throw new Error('Gemini did not return a text answer.');
  return text;
}

async function generateOllamaText(message, profile) {
  const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: OLLAMA_GENERAL_MODEL,
      stream: false,
      messages: [
        {
          role: 'system',
          content: buildPersonaPrompt('', profile, 'general'),
        },
        {
          role: 'user',
          content: message,
        },
      ],
    }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || `Ollama returned ${response.status}`);
  }

  const text = data.message?.content || data.response;
  if (!text) throw new Error('Ollama did not return a text answer.');
  return text;
}

async function answerGeneralQuestion(message, session, clientProfile) {
  const profile = clientProfile || profileStore.get(session.userId) || profileStore.get(session.email) || {};
  if (/^(hi|hello|hey|yo|sup)\b/i.test(message.trim())) {
    return {
      text: localFriendlyReply(message, profile),
      provider: 'local-friendly-greeting',
    };
  }

  if (GEMINI_API_KEY) {
    return {
      text: await generateGeminiText(message, profile),
      provider: GEMINI_TEXT_MODEL,
    };
  }

  try {
    return {
      text: await generateOllamaText(message, profile),
      provider: OLLAMA_GENERAL_MODEL,
    };
  } catch {
    // Fall through to AnythingLLM when a standalone Ollama server is not available.
  }

  try {
    const data = await proxyAnythingLLM(`/v1/workspace/${WORKSPACE_SLUG}/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: buildPersonaPrompt(message, profile, 'general'),
        mode: 'chat',
      }),
    });

    return {
      text: data.textResponse || data.response || data.message || localFriendlyReply(message, profile),
      provider: 'anythingllm-chat',
      raw: data,
    };
  } catch {
    return {
      text: localFriendlyReply(message, profile),
      provider: 'local-friendly-fallback',
    };
  }
}

async function serveStatic(req, res) {
  if (!existsSync(DIST_DIR)) {
    sendJson(res, 404, { error: 'Build the frontend first with npm run build.' });
    return;
  }

  const url = new URL(req.url || '/', `http://${req.headers.host}`);
  const requestedPath = normalize(url.pathname === '/' ? '/index.html' : url.pathname);
  const resolvedPath = resolve(join(DIST_DIR, requestedPath));

  if (!resolvedPath.startsWith(DIST_DIR)) {
    sendJson(res, 403, { error: 'Forbidden.' });
    return;
  }

  let filePath = resolvedPath;
  try {
    const fileStat = await stat(filePath);
    if (fileStat.isDirectory()) filePath = join(filePath, 'index.html');
  } catch {
    filePath = join(DIST_DIR, 'index.html');
  }

  const contentType = mimeTypes[extname(filePath)] || 'application/octet-stream';
  res.writeHead(200, { 'Content-Type': contentType });
  createReadStream(filePath).pipe(res);
}

const server = createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    sendJson(res, 204, {});
    return;
  }

  try {
    if (req.method === 'GET' && req.url === '/api/health') {
      sendJson(res, 200, {
        ok: true,
        anythingllmBaseUrl: ANYTHINGLLM_BASE_URL,
        workspace: WORKSPACE_SLUG,
        hasApiKey: Boolean(ANYTHINGLLM_API_KEY),
        auth: 'email-or-sms-otp',
        mongoConfigured: Boolean(MONGODB_URI || (DATA_API_URL && DATA_API_KEY)),
        emailConfigured: Boolean(EMAIL_WEBHOOK_URL),
        smsConfigured: Boolean(SMS_WEBHOOK_URL),
        socialLogin: {
          google: Boolean(GOOGLE_AUTH_URL),
          github: Boolean(GITHUB_AUTH_URL),
        },
        generalChatConfigured: true,
        imageGenerationConfigured: Boolean(GEMINI_API_KEY),
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/auth/request-otp') {
      const rawBody = await readBody(req);
      const { email, phone, channel = 'email', profile = {} } = JSON.parse(rawBody.toString('utf8') || '{}');
      const authChannel = channel === 'sms' ? 'sms' : 'email';
      const contact = normalizeContact(authChannel, authChannel === 'sms' ? phone : email);

      if (!isValidContact(authChannel, contact)) {
        sendJson(res, 400, { error: authChannel === 'sms' ? 'Enter a valid mobile number.' : 'Enter a valid email address.' });
        return;
      }

      const key = getOtpKey(authChannel, contact);
      const otp = String(randomInt(100000, 999999));
      const otpHash = hash(otp);
      const expiresAt = Date.now() + 10 * 60 * 1000;

      otpStore.set(key, { otpHash, expiresAt, attempts: 0, profile });
      await mongoAction('insertOne', OTP_COLLECTION, {
        authChannel,
        contact,
        otpHash,
        requestedAt: new Date().toISOString(),
        expiresAt: new Date(expiresAt).toISOString(),
      });
      if (authChannel === 'sms') {
        await sendOtpSms(contact, otp);
      } else {
        await sendOtpEmail(contact, otp);
      }

      sendJson(res, 200, {
        message: authChannel === 'sms'
          ? (SMS_WEBHOOK_URL ? 'Verification code sent to your mobile.' : 'SMS code generated. Check the backend terminal while SMS is not configured.')
          : (EMAIL_WEBHOOK_URL ? 'Verification code sent to your email.' : 'Email code generated. Check the backend terminal while email is not configured.'),
        devOtp: (authChannel === 'sms' ? SMS_WEBHOOK_URL : EMAIL_WEBHOOK_URL) ? undefined : otp,
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/auth/verify-otp') {
      const rawBody = await readBody(req);
      const { email, phone, channel = 'email', otp } = JSON.parse(rawBody.toString('utf8') || '{}');
      const authChannel = channel === 'sms' ? 'sms' : 'email';
      const contact = normalizeContact(authChannel, authChannel === 'sms' ? phone : email);
      const key = getOtpKey(authChannel, contact);
      const record = otpStore.get(key);

      if (!record || record.expiresAt < Date.now()) {
        otpStore.delete(key);
        sendJson(res, 400, { error: 'The verification code expired. Request a new one.' });
        return;
      }

      record.attempts += 1;
      if (record.attempts > 5) {
        otpStore.delete(key);
        sendJson(res, 429, { error: 'Too many attempts. Request a new code.' });
        return;
      }

      if (record.otpHash !== hash(String(otp || '').trim())) {
        sendJson(res, 400, { error: 'Incorrect verification code.' });
        return;
      }

      otpStore.delete(key);
      const sessionIdentity = {
        userId: key,
        authChannel,
        email: authChannel === 'email' ? contact : undefined,
        phone: authChannel === 'sms' ? contact : undefined,
      };
      await saveUserLogin(sessionIdentity);
      const savedProfile = record.profile?.name
        ? await saveUserProfile(sessionIdentity, record.profile)
        : null;

      const token = randomBytes(32).toString('hex');
      sessionStore.set(token, {
        ...sessionIdentity,
        expiresAt: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });
      await saveState();

      sendJson(res, 200, { token, user: sessionIdentity, profile: savedProfile });
      return;
    }

    if (req.method === 'GET' && req.url === '/api/auth/me') {
      const session = getSession(req);
      sendJson(res, session ? 200 : 401, session ? { user: session, profile: profileStore.get(session.userId) || profileStore.get(session.email) || null } : { error: 'Not signed in.' });
      return;
    }

    if (req.method === 'GET' && req.url?.startsWith('/api/auth/social/')) {
      const provider = req.url.split('/').pop();
      const redirectUrl = provider === 'google' ? GOOGLE_AUTH_URL : provider === 'github' ? GITHUB_AUTH_URL : '';
      if (!redirectUrl) {
        sendJson(res, 501, { error: `${provider} sign-in needs an OAuth redirect URL configured in the backend environment.` });
        return;
      }
      res.writeHead(302, { Location: redirectUrl });
      res.end();
      return;
    }

    if (req.method === 'POST' && req.url === '/api/profile') {
      const session = requireSession(req, res);
      if (!session) return;

      const rawBody = await readBody(req);
      const profile = JSON.parse(rawBody.toString('utf8') || '{}');
      const savedProfile = await saveUserProfile(session, profile);
      await saveUserEvent(session, 'profile_completed', savedProfile);

      sendJson(res, 200, { profile: savedProfile });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/chat') {
      const session = requireSession(req, res);
      if (!session) return;

      const rawBody = await readBody(req);
      const { message, mode = 'documents', profile } = JSON.parse(rawBody.toString('utf8') || '{}');

      if (!message || typeof message !== 'string') {
        sendJson(res, 400, { error: 'Message is required.' });
        return;
      }

      if (mode === 'general') {
        const answer = await answerGeneralQuestion(message, session, profile);
        await saveUserEvent(session, 'chat_message', {
          mode,
          provider: answer.provider,
          messageLength: message.length,
        });

        sendJson(res, 200, {
          text: answer.text,
          provider: answer.provider,
          raw: answer.raw,
        });
        return;
      }

      const data = await proxyAnythingLLM(`/v1/workspace/${WORKSPACE_SLUG}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: buildPersonaPrompt(message, profileStore.get(session.userId) || profileStore.get(session.email) || profile || {}, 'documents'),
          mode: 'query',
        }),
      });

      await saveUserEvent(session, 'chat_message', {
        mode,
        messageLength: message.length,
      });

      sendJson(res, 200, {
        text: data.textResponse || data.response || data.message || 'No answer returned by AnythingLLM.',
        raw: data,
      });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/upload') {
      const session = requireSession(req, res);
      if (!session) return;

      const contentType = req.headers['content-type'];

      if (!contentType?.includes('multipart/form-data')) {
        sendJson(res, 400, { error: 'Upload must be sent as multipart/form-data.' });
        return;
      }

      const rawBody = await readBody(req);
      const data = await proxyAnythingLLM('/v1/document/upload', {
        method: 'POST',
        headers: { 'Content-Type': contentType },
        body: rawBody,
      });

      await saveUserEvent(session, 'file_upload', {
        contentType,
        byteLength: rawBody.length,
      });

      sendJson(res, 200, { message: 'Document uploaded and queued for embedding.', raw: data });
      return;
    }

    if (req.method === 'POST' && req.url === '/api/images/generate') {
      const session = requireSession(req, res);
      if (!session) return;

      const rawBody = await readBody(req);
      const { prompt, referenceImage, useWorkspaceContext = true, profile } = JSON.parse(rawBody.toString('utf8') || '{}');

      if (!prompt || typeof prompt !== 'string') {
        sendJson(res, 400, { error: 'Image prompt is required.' });
        return;
      }

      const workspaceContext = useWorkspaceContext
        ? await getWorkspaceVisualContext(prompt, session, profile)
        : '';
      const visualPrompt = buildStudyVisualPrompt(prompt, workspaceContext, profileStore.get(session.userId) || profileStore.get(session.email) || profile || {});
      let image;
      try {
        image = await generateGeminiImage({ prompt: visualPrompt, referenceImage });
      } catch (error) {
        if (!isQuotaError(error)) throw error;
        image = createLocalStudyVisual(`${prompt}\n${workspaceContext}`, error instanceof Error ? error.message : 'Image quota unavailable.');
      }
      await saveUserEvent(session, 'image_generation', {
        promptLength: prompt.length,
        hasReferenceImage: Boolean(referenceImage),
        model: image.model,
        fallback: Boolean(image.fallback),
        usedWorkspaceContext: Boolean(workspaceContext),
      });

      sendJson(res, 200, image);
      return;
    }

    if (req.method === 'GET') {
      await serveStatic(req, res);
      return;
    }

    sendJson(res, 404, { error: 'Route not found.' });
  } catch (error) {
    sendJson(res, 500, {
      error: error instanceof Error ? error.message : 'Unexpected backend error.',
    });
  }
});

await loadState();

server.listen(PORT, async () => {
  const builtFiles = existsSync(DIST_DIR) ? await readdir(DIST_DIR).catch(() => []) : [];
  console.log(`Rook AI backend listening on http://localhost:${PORT}`);
  console.log(`Proxying AnythingLLM workspace "${WORKSPACE_SLUG}" at ${ANYTHINGLLM_BASE_URL}`);
  console.log(MONGODB_URI ? 'MongoDB Atlas driver is configured.' : DATA_API_URL && DATA_API_KEY ? 'MongoDB Data API is configured.' : 'MongoDB is not configured; login records stay in the running process.');
  console.log(EMAIL_WEBHOOK_URL ? 'Email webhook is configured.' : 'Email webhook is not configured; OTP codes print in this terminal.');
  console.log(SMS_WEBHOOK_URL ? 'SMS webhook is configured.' : 'SMS webhook is not configured; SMS OTP codes print in this terminal.');
  console.log(`General chat tries Gemini, then Ollama at ${OLLAMA_BASE_URL}, then AnythingLLM, then a friendly fallback.`);
  console.log(GEMINI_API_KEY ? `Gemini image generation is configured with ${GEMINI_IMAGE_MODEL}.` : 'Gemini image generation is not configured; set GEMINI_API_KEY to enable images.');
  console.log(builtFiles.length ? 'Serving built frontend from dist.' : 'Run npm run build before production deploy.');
});
