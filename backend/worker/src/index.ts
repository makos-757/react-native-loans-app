import { stkPush, expectedCallbackToken, type MpesaEnv } from "./mpesa";
import { sendSms, sendOtpSms, sendLoanApprovedSms, sendLoanDisbursedSms, sendLoanDeclinedSms, sendRepaymentSms, sendOverdueSms, sendStkPromptSms, sendSuspensionSms, type MpesaEnv as SmsEnv } from "./services/sms";
import { sendOtpEmail, sendWelcomeEmail, sendLoanApprovedEmail, sendLoanDeclinedEmail, sendLoanDisbursedEmail, sendRepaymentEmail, sendOverdueEmail, sendSuspensionEmail, sendPasswordResetEmail, sendTestEmail, buildOtpEmail, buildWelcomeEmail, buildLoanApprovedEmail, buildLoanDisbursedEmail, buildRepaymentEmail, buildOverdueEmail, buildSuspensionEmail, buildPasswordResetEmail } from "./services/brevo";
import { calculateLoan, canTopUp, calculateWeeklyInstallment } from "./loanUtils";
import { uploadFile, getFile, deleteFile, generateFileKey, listFiles, getFilePrefix, canAccessFile, storeReport } from "./services/r2";

type Env = {
  DB: D1Database;
  R2: R2Bucket;
  JWT_SECRET: string;
  OTP_SECRET: string;
  RATE_LIMIT_BYPASS?: string;
} & MpesaEnv & SmsEnv & {
  BREVO_API_KEY: string;
  EMAIL_FROM: string;
  AT_API_KEY: string;
  AT_USERNAME: string;
  AT_USSD_SHORTCODE: string;
  AT_CALLBACK_URL: string;
};

type UserRole = "User" | "Officer" | "Supervisor" | "Manager";

const ROLE_LEVEL: Record<UserRole, number> = {
  User: 1,
  Officer: 2,
  Supervisor: 3,
  Manager: 4,
};

function hasAccess(userRole: UserRole, requiredRole: UserRole): boolean {
  return ROLE_LEVEL[userRole] >= ROLE_LEVEL[requiredRole];
}

interface User {
  id: string;
  email: string;
  password: string;
  fullName: string;
  telephone: string;
  idNumber: string;
  isVerified: number;
  pfNumber: string;
  branch: string;
  role: UserRole;
  assignment: string;
  createdAt: string;
  isSuspended: number;
  suspensionReason: string | null;
  suspendedAt: string | null;
  creditScore: number;
  loanLimit: number;
  currentLoanBalance: number;
  pin: string;
  photoUrl: string | null;
  category: string;
}

interface Transaction {
  id: string;
  userId: string;
  type: "loan" | "repayment" | "fee" | "penalty";
  amount: number;
  status: "pending" | "success" | "failed";
  reference: string;
  createdAt: string;
}

interface Loan {
  id: string;
  userId: string;
  customerId: string;
  customerName: string;
  loanType: "Starter" | "Top-up";
  principal: number;
  total: number;
  weeklyInstallment: number;
  duration: number;
  status: "pending" | "approved" | "declined" | "disbursed" | "closed" | "under_review";
  appliedDate: string;
  approvedDate?: string;
  disbursedDate?: string;
  declinedReason?: string;
  creditOfficer: string;
  dueDate?: string;
  penaltyAmount: number;
  createdAt: string;
}

interface IdVerification {
  id: string;
  userId: string;
  idNumber: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

interface IdempotencyKey {
  key: string;
  response: string;
  createdAt: string;
  expiresAt: string;
}

const ALLOWED_ORIGINS = [
  "http://localhost:8081",
  "http://localhost:8080",
  "http://localhost:1573",
  "http://localhost:19000",
  "http://localhost:19001",
  "http://localhost:19002",
  "http://localhost:19006",
  "http://localhost:3000",
  "http://127.0.0.1:8081",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:1573",
  "http://127.0.0.1:19000",
  "http://127.0.0.1:19001",
  "http://127.0.0.1:19002",
  "http://127.0.0.1:19006",
  "http://127.0.0.1:3000",
  "exp://localhost:8081",
  "exp://127.0.0.1:8081",
  "https://localhost:8081",
  "https://127.0.0.1:8081",
];

function getCorsHeaders(origin: string): Record<string, string> {
  const allowOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : "";
  const headers: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (allowOrigin) {
    headers["Access-Control-Allow-Origin"] = allowOrigin;
  }
  return headers;
}

let currentRequestOrigin = "";

function jsonResponse(body: unknown, status = 200, requestHeaders?: HeadersInit): Response {
  const bodyStr = JSON.stringify(body);
  const headers = new Headers({
    "Content-Type": "application/json",
    ...getCorsHeaders(currentRequestOrigin),
  });

  const acceptEncoding = typeof requestHeaders === "object" && requestHeaders
    ? (requestHeaders as Record<string, string>)["accept-encoding"] || ""
    : "";

  if (acceptEncoding.includes("gzip")) {
    return new Response(bodyStr, { status, headers });
  }

  return new Response(bodyStr, { status, headers });
}

function badRequest(message: string): Response {
  return jsonResponse({ error: message }, 400);
}

function unauthorized(message = "Unauthorized"): Response {
  return jsonResponse({ error: message }, 401);
}

function serverError(message = "Internal server error"): Response {
  return jsonResponse({ error: message }, 500);
}

async function fetchWithRetry(url: string, options: RequestInit, retries = 2): Promise<Response> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, options);
      if (res.ok || i === retries - 1) return res;
    } catch (err) {
      if (i === retries - 1) throw err;
    }
  }
  throw new Error("fetchWithRetry failed");
}

const CIRCUIT_WINDOW_MS = 60_000;
const CIRCUIT_FAILURE_THRESHOLD = 10;
const circuitState: { failures: number[] } = { failures: [] };

function recordFailure(): void {
  const now = Date.now();
  circuitState.failures = circuitState.failures.filter(ts => now - ts < CIRCUIT_WINDOW_MS);
  circuitState.failures.push(now);
}

function isCircuitOpen(): boolean {
  const now = Date.now();
  circuitState.failures = circuitState.failures.filter(ts => now - ts < CIRCUIT_WINDOW_MS);
  return circuitState.failures.length >= CIRCUIT_FAILURE_THRESHOLD;
}

async function enqueueRetry(env: Env, operation: string, payload: Record<string, unknown>, maxAttempts = 3): Promise<void> {
  const now = new Date().toISOString();
  const nextRetry = new Date(Date.now() + 60000).toISOString();
  await env.DB.prepare(
    `INSERT INTO retry_queue (id, operation, payload, attempts, max_attempts, next_retry_at, created_at)
     VALUES (?, ?, ?, 0, ?, ?, ?)`
  ).bind(generateId(), operation, JSON.stringify(payload), maxAttempts, nextRetry, now).run();
}

async function processRetryQueue(env: Env): Promise<{ processed: number; succeeded: number; failed: number }> {
  const now = new Date().toISOString();
  const due = await env.DB.prepare(
    "SELECT * FROM retry_queue WHERE next_retry_at <= ? AND attempts < max_attempts"
  ).bind(now).all<Record<string, unknown>>();

  let succeeded = 0;
  let failed = 0;

  for (const item of (due.results || [])) {
    try {
      const payload = JSON.parse((item.payload as string) || "{}");
      switch (item.operation) {
        case "approve_loan":
          await env.DB.prepare(
            `UPDATE loans SET status = 'approved', approved_date = ?, approved_by = ?, approved_by_pf = ? WHERE id = ? AND status = 'pending'`
          ).bind(payload.approved_date, payload.approved_by, payload.approved_by_pf, payload.loan_id).run();
          break;
        case "decline_loan":
          await env.DB.prepare(
            `UPDATE loans SET status = 'declined', declined_reason = ? WHERE id = ? AND status = 'pending'`
          ).bind(payload.reason, payload.loan_id).run();
          break;
        case "disburse_loan":
          await env.DB.prepare(
            `UPDATE loans SET status = 'disbursed', disbursed_date = ? WHERE id = ? AND status = 'approved'`
          ).bind(payload.disbursed_date, payload.loan_id).run();
          break;
        default:
          break;
      }
      await env.DB.prepare("DELETE FROM retry_queue WHERE id = ?").bind(item.id).run();
      succeeded++;
    } catch {
      await env.DB.prepare(
        `UPDATE retry_queue SET attempts = attempts + 1, next_retry_at = ? WHERE id = ?`
      ).bind(new Date(Date.now() + 60000).toISOString(), item.id).run();
      failed++;
    }
  }

  return { processed: due.results?.length || 0, succeeded, failed };
}

function generateId(): string {
  return crypto.randomUUID();
}

function generateOtp(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomUUID();
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(salt)
  );
  const hashArray = Array.from(new Uint8Array(signatureBuffer));
  return `sha256:${salt}:${hashArray.map((b) => b.toString(16).padStart(2, "0")).join("")}`;
}

async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (!stored) return false;
  const [algo, salt, hash] = stored.split(":");
  if (algo !== "sha256" || !salt || !hash) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    key,
    enc.encode(salt)
  );
  const computed = Array.from(new Uint8Array(signatureBuffer)).map((b) => b.toString(16).padStart(2, "0")).join("");
  return computed === hash;
}

async function hashOtp(code: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(code);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function verifyOtpCode(code: string, hash: string): Promise<boolean> {
  const encoder = new TextEncoder();
  const data = encoder.encode(code);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashed = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  return hashed === hash;
}

function formatPhone(phone: string): string {
  if (phone.startsWith("07")) {
    return "+254" + phone.slice(1);
  }
  if (phone.startsWith("01")) {
    return "+254" + phone.slice(1);
  }
  return phone;
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("+254")) return digits.slice(1);
  return digits;
}

function isValidKenyanPhone(phone: string): boolean {
  const cleaned = phone.replace(/\s+/g, "");
  return /^\+2547\d{8}$/.test(cleaned) || /^07\d{8}$/.test(cleaned);
}

function calculateCreditScore(user: User, loans: Loan[]): number {
  let score = 500;

  const repaidLoans = loans.filter((l) => l.status === "closed" && l.userId === user.id).length;
  const missedPayments = loans.filter((l) => l.status === "declined" || l.penaltyAmount > 0).length;
  const accountAgeDays = Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24));

  score += repaidLoans * 20;
  score -= missedPayments * 30;
  score += Math.floor(accountAgeDays / 10);
  score += user.isVerified === 1 ? 50 : 0;

  return Math.max(300, Math.min(850, score));
}

async function getJwtSecret(env: Env): Promise<Uint8Array> {
  return new TextEncoder().encode(env.JWT_SECRET);
}

async function generateToken(userId: string, env: Env): Promise<string> {
  const timestamp = Date.now();
  const expiresAt = timestamp + 30 * 60 * 1000; // 30 minutes
  const data = `${userId}.${timestamp}.${expiresAt}`;
  const secret = await getJwtSecret(env);
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    new TextEncoder().encode(data)
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${userId}.${timestamp}.${expiresAt}.${signature}`;
}

async function generateRefreshToken(userId: string, env: Env): Promise<string> {
  const id = crypto.randomUUID();
  const timestamp = Date.now();
  const expiresAt = timestamp + 30 * 24 * 60 * 60 * 1000; // 30 days
  const data = `${id}.${userId}.${timestamp}.${expiresAt}`;
  const secret = await getJwtSecret(env);
  const signatureBuffer = await crypto.subtle.sign(
    "HMAC",
    await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
    new TextEncoder().encode(data)
  );
  const signature = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return `${data}.${signature}`;
}

async function storeRefreshToken(env: Env, userId: string, token: string): Promise<void> {
  const tokenHash = await hashString(token);
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await env.DB.prepare(
    "INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)"
  ).bind(crypto.randomUUID(), userId, tokenHash, expiresAt, new Date().toISOString()).run();
}

async function hashString(str: string): Promise<string> {
  const buffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(str));
  return btoa(String.fromCharCode(...new Uint8Array(buffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function verifyRefreshToken(env: Env, token: string): Promise<{ userId: string } | null> {
  try {
    const secret = await getJwtSecret(env);
    const parts = token.split(".");
    if (parts.length !== 5) return null;
    const [id, userId, timestamp, expiresAt, signature] = parts;
    if (!id || !userId || !timestamp || !expiresAt || !signature) return null;

    const data = `${id}.${userId}.${timestamp}.${expiresAt}`;
    const expectedBuffer = await crypto.subtle.sign(
      "HMAC",
      await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
      new TextEncoder().encode(data)
    );
    const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(expectedBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (signature !== expectedSignature) return null;

    if (Date.now() > parseInt(expiresAt)) return null;

    const result = await env.DB.prepare("SELECT * FROM refresh_tokens WHERE user_id = ? AND token_hash = ? AND revoked = 0").bind(userId, await hashString(token)).first<Record<string, unknown>>();
    if (!result) return null;
    const dbExpiresAt = new Date(result.expires_at as string);
    if (dbExpiresAt < new Date()) return null;
    return { userId };
  } catch {
    return null;
  }
}

async function verifyToken(env: Env, token: string): Promise<{ userId: string } | null> {
  try {
    const secret = await getJwtSecret(env);
    const parts = token.split(".");
    if (parts.length !== 4) return null;
    const [userId, timestamp, expiresAt, signature] = parts;
    if (!userId || !timestamp || !expiresAt || !signature) return null;

    const data = `${userId}.${timestamp}.${expiresAt}`;
    const expectedBuffer = await crypto.subtle.sign(
      "HMAC",
      await crypto.subtle.importKey("raw", secret, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]),
      new TextEncoder().encode(data)
    );
    const expectedSignature = btoa(String.fromCharCode(...new Uint8Array(expectedBuffer))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
    if (signature !== expectedSignature) return null;

    if (Date.now() > parseInt(expiresAt)) return null;
    return { userId };
  } catch {
    return null;
  }
}

async function sendSmsOtp(env: Env, phone: string, code: string): Promise<{ success: boolean; error?: string }> {
  const result = await sendSms(env, phone, `Your Vaultiline OTP is ${code}. Valid for 5 min. Do not share.`);
  if (!result.success) {
    return { success: false, error: result.error };
  }
  return { success: true };
}

function toCamelCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
    result[camelKey] = value;
  }
  return result;
}

function toSnakeCase(obj: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const snakeKey = key.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
    result[snakeKey] = value;
  }
  return result;
}

async function recordLedgerEntry(
  env: Env,
  userId: string,
  loanId: string | undefined,
  entryType: "disbursement" | "repayment" | "penalty" | "fee" | "adjustment" | "reversal",
  amount: number,
  direction: "debit" | "credit",
  balanceAfter: number,
  reference: string | undefined,
  actorId: string | undefined,
  actorEmail: string | undefined,
  details: Record<string, unknown> | undefined
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO ledger_entries (id, loan_id, user_id, entry_type, amount, direction, balance_after, reference, actor_id, actor_email, details, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    generateId(),
    loanId || null,
    userId,
    entryType,
    amount,
    direction,
    balanceAfter,
    reference || null,
    actorId || null,
    actorEmail || null,
    details ? JSON.stringify(details) : null,
    new Date().toISOString()
  ).run();
}

async function getUserBalance(env: Env, userId: string): Promise<number> {
  const user = await getUserById(env, userId);
  return user?.currentLoanBalance || 0;
}

let dbInitialized = false;

async function ensureDatabaseInitialized(env: Env): Promise<void> {
  if (dbInitialized) return;
  await initDatabase(env);
  dbInitialized = true;
}

async function initDatabase(env: Env): Promise<void> {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      full_name TEXT NOT NULL,
      telephone TEXT NOT NULL,
      id_number TEXT NOT NULL DEFAULT '',
      is_verified INTEGER NOT NULL DEFAULT 0,
      pf_number TEXT NOT NULL,
      branch TEXT NOT NULL,
      role TEXT NOT NULL,
      assignment TEXT NOT NULL,
      created_at TEXT NOT NULL,
      is_suspended INTEGER NOT NULL DEFAULT 0,
      suspension_reason TEXT,
      suspended_at TEXT,
      is_active INTEGER NOT NULL DEFAULT 1,
      photo_url TEXT
    )`
  ).run();

  await env.DB.prepare(
    `ALTER TABLE users ADD COLUMN is_suspended INTEGER NOT NULL DEFAULT 0`
  ).run().catch(() => {});
  await env.DB.prepare(
    `ALTER TABLE users ADD COLUMN suspension_reason TEXT`
  ).run().catch(() => {});
  await env.DB.prepare(
    `ALTER TABLE users ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1`
  ).run().catch(() => {});
  await env.DB.prepare(
    `ALTER TABLE users ADD COLUMN credit_score INTEGER NOT NULL DEFAULT 0`
  ).run().catch(() => {});
  await env.DB.prepare(
    `ALTER TABLE users ADD COLUMN loan_limit INTEGER NOT NULL DEFAULT 1000`
  ).run().catch(() => {});
  await env.DB.prepare(
    `ALTER TABLE users ADD COLUMN current_loan_balance INTEGER NOT NULL DEFAULT 0`
  ).run().catch(() => {});
  await env.DB.prepare(
    `ALTER TABLE users ADD COLUMN photo_url TEXT`
  ).run().catch(() => {});

  await env.DB.prepare(
    `ALTER TABLE users ADD COLUMN password_algo TEXT NOT NULL DEFAULT 'sha256-hmac'`
  ).run().catch(() => {});

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_users_email ON users (email)`
  ).run().catch(() => {});
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_users_telephone ON users (telephone)`
  ).run().catch(() => {});
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_users_is_active ON users (is_active)`
  ).run().catch(() => {});

  await env.DB.prepare(
    `CREATE TRIGGER IF NOT EXISTS validate_user_role_insert BEFORE INSERT ON users FOR EACH ROW WHEN NEW.role NOT IN ('Manager','Supervisor','Officer','User') BEGIN SELECT RAISE(ABORT, 'Invalid user role'); END`
  ).run().catch(() => {});

  await env.DB.prepare(
    `CREATE TRIGGER IF NOT EXISTS validate_user_role_update BEFORE UPDATE OF role ON users FOR EACH ROW WHEN NEW.role NOT IN ('Manager','Supervisor','Officer','User') BEGIN SELECT RAISE(ABORT, 'Invalid user role'); END`
  ).run().catch(() => {});

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS admin_logs (
      id TEXT PRIMARY KEY,
      admin_id TEXT NOT NULL,
      action TEXT NOT NULL,
      target_user_id TEXT,
      details TEXT,
      ip_address TEXT,
      created_at TEXT NOT NULL
    )`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_admin_logs_admin_id ON admin_logs (admin_id)`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_admin_logs_target_user_id ON admin_logs (target_user_id)`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS retry_queue (
      id TEXT PRIMARY KEY,
      operation TEXT NOT NULL,
      payload TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      max_attempts INTEGER NOT NULL DEFAULT 3,
      next_retry_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_retry_queue_next_retry ON retry_queue (next_retry_at)`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      loan_id TEXT,
      type TEXT NOT NULL CHECK (type IN ('loan', 'repayment', 'fee', 'penalty')),
      amount REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed')),
      reference TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (loan_id) REFERENCES loans (id)
    )`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON transactions (user_id)`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_transactions_reference ON transactions (reference)`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS ledger_entries (
      id TEXT PRIMARY KEY,
      loan_id TEXT,
      user_id TEXT NOT NULL,
      entry_type TEXT NOT NULL CHECK (entry_type IN ('disbursement', 'repayment', 'penalty', 'fee', 'adjustment', 'reversal')),
      amount REAL NOT NULL,
      direction TEXT NOT NULL CHECK (direction IN ('debit', 'credit')),
      balance_after REAL NOT NULL,
      reference TEXT,
      actor_id TEXT,
      actor_email TEXT,
      details TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id),
      FOREIGN KEY (loan_id) REFERENCES loans (id)
    )`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_ledger_loan_id ON ledger_entries (loan_id)`
  ).run().catch(() => {});

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_ledger_user_id ON ledger_entries (user_id)`
  ).run().catch(() => {});

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_ledger_created_at ON ledger_entries (created_at)`
  ).run().catch(() => {});

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS id_verifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      id_number TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_id_verifications_user_id ON id_verifications (user_id)`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS idempotency_keys (
      key TEXT PRIMARY KEY,
      response TEXT NOT NULL,
      created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL
    )`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_idempotency_expires ON idempotency_keys (expires_at)`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS loans (
      id TEXT PRIMARY KEY,
      loan_number TEXT NOT NULL DEFAULT '',
      user_id TEXT NOT NULL,
      customer_id TEXT,
      customer_name TEXT NOT NULL,
      loan_type TEXT NOT NULL CHECK (loan_type IN ('Starter', 'Top-up')),
      principal REAL NOT NULL,
      total REAL NOT NULL,
      weekly_installment REAL NOT NULL,
      duration INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'declined', 'disbursed', 'closed', 'under_review')),
      applied_date TEXT NOT NULL,
      approved_date TEXT,
      disbursed_date TEXT,
      declined_reason TEXT,
      credit_officer TEXT NOT NULL,
      due_date TEXT,
      penalty_amount REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`
  ).run();

  await env.DB.prepare(
    `ALTER TABLE loans ADD COLUMN loan_number TEXT NOT NULL DEFAULT ''`
  ).run().catch(() => {});

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_loans_user_id ON loans (user_id)`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_loans_status ON loans (status)`
  ).run();
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_loans_user_status ON loans (user_id, status)`
  ).run().catch(() => {});

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_loans_due_date ON loans (due_date)`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS mpesa_payments (
      id TEXT PRIMARY KEY,
      checkout_request_id TEXT,
      merchant_request_id TEXT,
      phone TEXT NOT NULL,
      amount REAL NOT NULL,
      reference TEXT,
      loan_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      receipt_number TEXT,
      result_desc TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT,
      FOREIGN KEY (loan_id) REFERENCES loans (id)
    )`
  ).run();

  await env.DB.prepare(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_mpesa_receipt ON mpesa_payments (receipt_number) WHERE receipt_number IS NOT NULL`
  ).run().catch(() => {});

  await env.DB.prepare(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_loans_loan_number ON loans (loan_number)`
  ).run().catch(() => {});

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS audit_logs (
      id TEXT PRIMARY KEY,
      action TEXT NOT NULL,
      actor_id TEXT,
      actor_email TEXT,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      details TEXT,
      ip_address TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL
    )`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS sms_logs (
      id TEXT PRIMARY KEY,
      user_id TEXT,
      phone TEXT NOT NULL,
      message TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      message_id TEXT,
      created_at TEXT NOT NULL
    )`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_sms_logs_user_id ON sms_logs (user_id)`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_sms_logs_created_at ON sms_logs (created_at)`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      requests INTEGER NOT NULL DEFAULT 1,
      window_start TEXT NOT NULL,
      blocked_until TEXT
    )`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS otp_codes (
      id TEXT PRIMARY KEY,
      phone TEXT,
      email TEXT,
      code_hash TEXT NOT NULL,
      purpose TEXT NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      attempts INTEGER NOT NULL DEFAULT 0,
      attempts_max INTEGER NOT NULL DEFAULT 5,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_otp_phone ON otp_codes (phone, purpose, used)`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_otp_email ON otp_codes (email, purpose, used)`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS qualification_answers (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      customer_type TEXT NOT NULL,
      education_level TEXT NOT NULL,
      employment_status TEXT NOT NULL,
      monthly_income REAL NOT NULL,
      has_existing_loans INTEGER NOT NULL DEFAULT 0,
      existing_loan_details TEXT,
      collateral_available INTEGER NOT NULL DEFAULT 0,
      business_type TEXT,
      chama_name TEXT,
      years_in_business REAL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users (id)
    )`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS customers (
      id TEXT PRIMARY KEY,
      customer_type TEXT NOT NULL CHECK (customer_type IN ('Micro-Enterprise', 'Chama')),
      name TEXT NOT NULL,
      phone TEXT NOT NULL,
      id_number TEXT NOT NULL DEFAULT '',
      county TEXT NOT NULL DEFAULT '',
      subcounty TEXT NOT NULL DEFAULT '',
      ward TEXT NOT NULL DEFAULT '',
      village TEXT NOT NULL DEFAULT '',
      chief_name TEXT NOT NULL DEFAULT '',
      marital_status TEXT NOT NULL DEFAULT '',
      spouse_name TEXT,
      spouse_phone TEXT,
      economic_activity TEXT NOT NULL DEFAULT '',
      monthly_income REAL NOT NULL DEFAULT 0,
      credit_officer TEXT NOT NULL,
      created_at TEXT NOT NULL
    )`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers (phone)`
  ).run();
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_customers_created_at ON customers (created_at)`
  ).run().catch(() => {});

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS inquiries (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      telephone TEXT NOT NULL,
      email TEXT,
      county TEXT NOT NULL DEFAULT '',
      location TEXT NOT NULL DEFAULT '',
      inquiry_type TEXT NOT NULL DEFAULT 'Loan Limit',
      description TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'in_progress', 'completed', 'closed')),
      created_at TEXT NOT NULL
    )`
  ).run();
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_inquiries_status ON inquiries (status)`
  ).run();
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_inquiries_status_created ON inquiries (status, created_at DESC)`
  ).run().catch(() => {});
  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_inquiries_created_at ON inquiries (created_at)`
  ).run().catch(() => {});

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS ussd_sessions (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      phone_number TEXT NOT NULL,
      session_data TEXT NOT NULL DEFAULT '{}',
      step TEXT NOT NULL DEFAULT 'welcome',
      attempts INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_ussd_transaction_id ON ussd_sessions (transaction_id)`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_ussd_phone_number ON ussd_sessions (phone_number)`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS chama_members (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      name TEXT NOT NULL,
      national_id TEXT NOT NULL DEFAULT '',
      phone TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    )`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_chama_members_customer_id ON chama_members (customer_id)`
  ).run();

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS settings (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL UNIQUE,
      value TEXT NOT NULL,
      description TEXT,
      updated_at TEXT NOT NULL
    )`
  ).run();

  await env.DB.prepare(
    `INSERT OR IGNORE INTO settings (id, key, value, description, updated_at)
     VALUES (?, 'max_loan_amount', '50000', 'Maximum loan amount in KES', ?),
             (?, 'interest_rate', '30', 'Interest rate percentage', ?),
             (?, 'repayment_period', '12', 'Maximum repayment period in weeks', ?),
             (?, 'min_loan_amount', '1000', 'Minimum loan amount in KES', ?)`
  )
    .bind(generateId(), new Date().toISOString(), generateId(), new Date().toISOString(), generateId(), new Date().toISOString(), generateId(), new Date().toISOString())
    .run();

  await env.DB.prepare(
    `ALTER TABLE users ADD COLUMN pin TEXT NOT NULL DEFAULT ''`
  ).run().catch(() => {});

  await env.DB.prepare(
    `ALTER TABLE users ADD COLUMN category TEXT NOT NULL DEFAULT ''`
  ).run().catch(() => {});

  await env.DB.prepare(
    `ALTER TABLE loans ADD COLUMN repaid_percentage REAL NOT NULL DEFAULT 0`
  ).run().catch(() => {});

  await env.DB.prepare(
    `ALTER TABLE loans ADD COLUMN approved_by TEXT`
  ).run().catch(() => {});

  await env.DB.prepare(
    `ALTER TABLE loans ADD COLUMN approved_by_pf TEXT`
  ).run().catch(() => {});

  await env.DB.prepare(
    `ALTER TABLE loans ADD COLUMN repaid_amount REAL NOT NULL DEFAULT 0`
  ).run().catch(() => {});

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS files (
      id TEXT PRIMARY KEY,
      key TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'upload',
      owner_id TEXT,
      created_at TEXT NOT NULL,
      expires_at TEXT
    )`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_files_owner_id ON files (owner_id)`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_files_type ON files (type)`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_loans_credit_officer ON loans (credit_officer)`
  ).run().catch(() => {});

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_loans_created_at ON loans (created_at)`
  ).run().catch(() => {});

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_transactions_type_status ON transactions (type, status)`
  ).run().catch(() => {});

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON transactions (created_at)`
  ).run().catch(() => {});

  await env.DB.prepare(
    `CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_loan_disbursement ON transactions (loan_id) WHERE type = 'disbursement'`
  ).run().catch(() => {});

  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS refresh_tokens (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      token_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL,
      revoked INTEGER NOT NULL DEFAULT 0,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    )`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens (user_id)`
  ).run().catch(() => {});

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS idx_refresh_tokens_token_hash ON refresh_tokens (token_hash)`
  ).run().catch(() => {});

  if ((env as any).ENABLE_TEST_SEED === "true") {
    const testerEmail = "admin@example.com";
    const existingTester = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(testerEmail).first<{ id: string }>();
    if (!existingTester) {
      const testerPassword = await hashPassword("Admin@1234");
      await env.DB.prepare(
        `INSERT INTO users (id, email, password, full_name, telephone, id_number, pf_number, branch, role, assignment, created_at, is_suspended, suspension_reason, suspended_at, credit_score, loan_limit, current_loan_balance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, 0, 1000, 0)`
      ).bind(
        generateId(),
        testerEmail,
        testerPassword,
        "Admin User",
        "+254700000101",
        "",
        "",
        "Nairobi",
        "Manager",
        "Nairobi",
        new Date().toISOString()
      ).run();
    }

    const ownerEmail = "owner@example.com";
    const existingOwner = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(ownerEmail).first<{ id: string }>();
    if (!existingOwner) {
      const ownerPassword = await hashPassword("Owner@1234");
      await env.DB.prepare(
        `INSERT INTO users (id, email, password, full_name, telephone, id_number, pf_number, branch, role, assignment, created_at, is_suspended, suspension_reason, suspended_at, credit_score, loan_limit, current_loan_balance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, 0, 1000, 0)`
      ).bind(
        generateId(),
        ownerEmail,
        ownerPassword,
        "Owner User",
        "+254700000102",
        "",
        "",
        "Nakuru",
        "Manager",
        "Nakuru",
        new Date().toISOString()
      ).run();
    }

    const supervisorEmail = "supervisor@example.com";
    const existingSupervisor = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(supervisorEmail).first<{ id: string }>();
    if (!existingSupervisor) {
      const supervisorPassword = await hashPassword("Supervisor@1234");
      await env.DB.prepare(
        `INSERT INTO users (id, email, password, full_name, telephone, id_number, pf_number, branch, role, assignment, created_at, is_suspended, suspension_reason, suspended_at, credit_score, loan_limit, current_loan_balance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, 0, 1000, 0)`
      ).bind(
        generateId(),
        supervisorEmail,
        supervisorPassword,
        "Supervisor User",
        "+254700000103",
        "",
        "",
        "Nairobi",
        "Supervisor",
        "Nairobi",
        new Date().toISOString()
      ).run();
    }

    const officerEmail = "officer@example.com";
    const existingOfficer = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(officerEmail).first<{ id: string }>();
    if (!existingOfficer) {
      const officerPassword = await hashPassword("Officer@1234");
      await env.DB.prepare(
        `INSERT INTO users (id, email, password, full_name, telephone, id_number, pf_number, branch, role, assignment, created_at, is_suspended, suspension_reason, suspended_at, credit_score, loan_limit, current_loan_balance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, 0, 1000, 0)`
      ).bind(
        generateId(),
        officerEmail,
        officerPassword,
        "Officer User",
        "+254700000104",
        "",
        "",
        "Nairobi",
        "Officer",
        "Nairobi",
        new Date().toISOString()
      ).run();
    }

    const userEmail = "user@example.com";
    const existingUser = await env.DB.prepare("SELECT id FROM users WHERE email = ?").bind(userEmail).first<{ id: string }>();
    if (!existingUser) {
      const userPassword = await hashPassword("User@1234");
      await env.DB.prepare(
        `INSERT INTO users (id, email, password, full_name, telephone, id_number, pf_number, branch, role, assignment, created_at, is_suspended, suspension_reason, suspended_at, credit_score, loan_limit, current_loan_balance)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, 0, 1000, 0)`
      ).bind(
        generateId(),
        userEmail,
        userPassword,
        "Regular User",
        "+254700000105",
        "",
        "",
        "Nairobi",
        "User",
        "Nairobi",
        new Date().toISOString()
      ).run();
    }
  }
}

async function getUserByEmail(env: Env, email: string): Promise<User | undefined> {
  const result = await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<Record<string, unknown>>();
  if (!result) return undefined;
  return toCamelCase(result) as unknown as User;
}

async function requireAuth(request: Request, env: Env): Promise<User | null> {
  const token = getBearerToken(request);
  if (!token) return null;
  const payload = await verifyToken(env, token);
  if (!payload) return null;
  const user = await getUserById(env, payload.userId);
  if (!user) return null;
  return user;
}

async function getUserById(env: Env, id: string): Promise<User | undefined> {
  const result = await env.DB.prepare("SELECT * FROM users WHERE id = ? AND is_active = 1").bind(id).first<Record<string, unknown>>();
  if (!result) return undefined;
  return toCamelCase(result) as unknown as User;
}

async function createUser(env: Env, user: Omit<User, "id" | "createdAt" | "isSuspended" | "suspensionReason" | "suspendedAt" | "creditScore" | "loanLimit" | "currentLoanBalance">, ip?: string): Promise<User> {
  const newUser: User = {
    ...user,
    isSuspended: 0,
    suspensionReason: null,
    suspendedAt: null,
    creditScore: 0,
    loanLimit: 1000,
    currentLoanBalance: 0,
    id: generateId(),
    createdAt: new Date().toISOString(),
  };
  await env.DB.prepare(
    `INSERT INTO users (id, email, password, full_name, telephone, id_number, pf_number, branch, role, assignment, created_at, is_suspended, suspension_reason, suspended_at, credit_score, loan_limit, current_loan_balance)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL, NULL, 0, 1000, 0)`
  )
    .bind(
      newUser.id,
      newUser.email,
      newUser.password,
      newUser.fullName,
      newUser.telephone,
      newUser.idNumber,
      newUser.pfNumber,
      newUser.branch,
      newUser.role,
      newUser.assignment,
      newUser.createdAt
    )
    .run();

  await logAudit(env, "user.signup", newUser.id, newUser.email, "user", newUser.id, { role: newUser.role, branch: newUser.branch }, ip);
  return newUser;
}

async function logAudit(
  env: Env,
  action: string,
  actorId: string | undefined,
  actorEmail: string | undefined,
  resourceType: string,
  resourceId: string | undefined,
  details: Record<string, unknown> | undefined,
  ip: string | undefined
): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO audit_logs (id, action, actor_id, actor_email, resource_type, resource_id, details, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        generateId(),
        action,
        actorId || null,
        actorEmail || null,
        resourceType,
        resourceId || null,
        details ? JSON.stringify(details) : null,
        ip || null,
        new Date().toISOString()
      )
      .run();
  } catch {
    // best-effort logging; never break the request
  }
}

async function logAdminAction(env: Env, adminId: string, adminEmail: string | undefined, action: string, targetUserId: string | undefined, details: Record<string, unknown> | undefined, ip: string | undefined): Promise<void> {
  try {
    await env.DB.prepare(
      `INSERT INTO admin_logs (id, admin_id, action, target_user_id, details, ip_address, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(
        generateId(),
        adminId,
        action,
        targetUserId || null,
        details ? JSON.stringify(details) : null,
        ip || null,
        new Date().toISOString()
      )
      .run();
  } catch {
    // best-effort logging
  }
}

function requestIp(request: Request): string | undefined {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0]?.trim();
  return request.headers.get("cf-connecting-ip") || undefined;
}

function isRateLimitBypassed(env: Env, key: string): boolean {
  const bypassList: string[] = (env.RATE_LIMIT_BYPASS || '').split(',').map((s: string) => s.trim()).filter((s: string) => Boolean(s));
  if (bypassList.length === 0) return false;
  return bypassList.some((bypass: string) => bypass === key || bypass === 'all');
}

async function checkRateLimit(env: Env, key: string, maxRequests: number, windowSeconds: number, blockMinutes = 15): Promise<boolean> {
   if (isRateLimitBypassed(env, key)) {
     return true;
   }
   const now = new Date();
   const windowStart = new Date(now.getTime() - windowSeconds * 1000);

   const existing = await env.DB.prepare("SELECT * FROM rate_limits WHERE key = ?").bind(key).first<Record<string, unknown>>();
   if (!existing) {
     await env.DB.prepare("INSERT INTO rate_limits (key, requests, window_start) VALUES (?, 1, ?)").bind(key, now.toISOString()).run();
     return true;
   }

   const existingStart = new Date(existing.window_start as string);
   if (existingStart < windowStart) {
     await env.DB.prepare("UPDATE rate_limits SET requests = 1, window_start = ?, blocked_until = NULL WHERE key = ?")
       .bind(now.toISOString(), key)
       .run();
     return true;
   }

    const count = (existing.requests as number) || 0;
    if (count >= maxRequests) {
      const blockedUntil = existing.blocked_until ? new Date(existing.blocked_until as string) : null;
      if (blockedUntil && blockedUntil > now) {
        return false;
      }
      const newBlockedUntil = new Date(now.getTime() + blockMinutes * 60 * 1000).toISOString();
      await env.DB.prepare("UPDATE rate_limits SET requests = requests + 1, blocked_until = ? WHERE key = ?")
        .bind(newBlockedUntil, key)
        .run();
      return false;
    }

   await env.DB.prepare("UPDATE rate_limits SET requests = requests + 1 WHERE key = ?").bind(key).run();
   return true;
 }

async function handleSignup(request: Request, env: Env): Promise<Response> {
  try {
    const ip = requestIp(request);
    if (!(await checkRateLimit(env, `signup_ip:${ip || "unknown"}`, 5, 300))) {
      return jsonResponse({ error: "Too many signup attempts from this IP. Try again after 5 minutes." }, 429);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    const fullName = typeof body.fullName === "string" ? body.fullName.trim() : "";
    const telephone = typeof body.telephone === "string" ? body.telephone.trim() : "";
    const idNumber = typeof body.idNumber === "string" ? body.idNumber.trim() : "";
    const pfNumber = typeof body.pfNumber === "string" ? body.pfNumber.trim() : "";
    const branch = typeof body.branch === "string" ? body.branch.trim() : "";
    const role = typeof body.role === "string" ? body.role : "User";
    const assignment = typeof body.assignment === "string" ? body.assignment.trim() : branch;

    if (!email || !password || !fullName || !telephone || !idNumber || !pfNumber || !branch) {
      return badRequest("All fields are required");
    }

    if (password.length < 6) {
      return badRequest("Password must be at least 6 characters");
    }

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return badRequest("Invalid email format");
    }

    if (!isValidKenyanPhone(telephone)) {
      return badRequest("Invalid Kenyan phone number format. Use 07XXXXXXXX or +2547XXXXXXXX");
    }

    const validRoles: UserRole[] = ["User", "Officer", "Supervisor", "Manager"];
    const normalizedRole = validRoles.includes(role as UserRole) ? (role as UserRole) : "User";

    const existing = await getUserByEmail(env, email);
    if (existing) {
      return badRequest("Email already registered");
    }

    if (!(await checkRateLimit(env, `signup_email:${email}`, 5, 300))) {
      return jsonResponse({ error: "Too many signup attempts for this email. Try again after 5 minutes." }, 429);
    }

    const passwordHash = await hashPassword(password);

    const user = await createUser(env, {
      email,
      password: passwordHash,
      fullName,
      telephone,
      idNumber,
      isVerified: 0,
      pfNumber,
      branch,
      role: normalizedRole,
      assignment,
      pin: "",
      category: "",
      photoUrl: null,
    }, requestIp(request));

    const token = await generateToken(user.id, env);
    const refreshToken = await generateRefreshToken(user.id, env);
    await storeRefreshToken(env, user.id, refreshToken);

    const { password: _, ...safeUser } = user;

    sendWelcomeEmail(env, user.email, user.fullName).catch((err) => {
      console.error("[EMAIL] Welcome email failed:", err);
    });

    return jsonResponse({ user: safeUser, token, refreshToken }, 201);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("Signup error:", message, err);
    return jsonResponse({ error: message }, 500);
  }
}

async function handleLogin(request: Request, env: Env): Promise<Response> {
  try {
    const ip = requestIp(request);
    if (!(await checkRateLimit(env, `login_ip:${ip || "unknown"}`, 10, 900))) {
      return jsonResponse({ error: "Too many login attempts from this IP. Try again after 15 minutes." }, 429);
    }

    let body: Record<string, unknown> = {};
    try {
      const raw = await request.text();
      if (raw.trim()) {
        body = JSON.parse(raw) as Record<string, unknown>;
      }
    } catch {
      return badRequest("Invalid JSON body");
    }

    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const target = email || phone;

    if (target && !(await checkRateLimit(env, `login_user:${target}`, 5, 900))) {
      return jsonResponse({ error: "Too many login attempts for this account. Try again after 15 minutes." }, 429);
    }
    const password = typeof body.password === "string" ? body.password : "";

    if (!password || (!email && !phone)) {
      return badRequest("Email or phone, and password are required");
    }

    let user = undefined;
    if (email) {
      user = await getUserByEmail(env, email);
    } else if (phone) {
      if (!isValidKenyanPhone(phone)) {
        return badRequest("Invalid Kenyan phone number format. Use 07XXXXXXXX or +2547XXXXXXXX");
      }
      const formatted = formatPhone(phone);
      user = await env.DB.prepare("SELECT * FROM users WHERE telephone = ? OR telephone = ?").bind(phone, formatted).first<Record<string, unknown>>();
    }

    if (!user || !(await verifyPassword(password, (user as any).password as string))) {
      await logAudit(env, "auth.login_failed", undefined, email || phone, "user", undefined, { reason: "invalid_credentials" }, requestIp(request));
      return unauthorized("Invalid email/phone or password");
    }

    const safeUser = toCamelCase(user as Record<string, unknown>) as unknown as User;

    if ((safeUser as any).isSuspended === 1) {
      await logAudit(env, "auth.login_failed", safeUser.id, safeUser.email, "user", safeUser.id, { reason: "suspended" }, requestIp(request));
      return jsonResponse({ error: "Your account has been suspended. Please contact support.", suspended: true }, 403);
    }

    await logAudit(env, "auth.login", safeUser.id, safeUser.email, "user", safeUser.id, { role: safeUser.role }, requestIp(request));
    const token = await generateToken(safeUser.id, env);
    const refreshToken = await generateRefreshToken(safeUser.id, env);
    await storeRefreshToken(env, safeUser.id, refreshToken);

    const { password: _, ...safeUserWithoutPassword } = safeUser;
    return jsonResponse({ user: safeUserWithoutPassword, token, refreshToken });
  } catch (err) {
    console.error("Login error:", err);
    return serverError();
  }
}

async function handleRefresh(request: Request, env: Env): Promise<Response> {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const refreshToken = typeof body.refreshToken === "string" ? body.refreshToken : "";

    if (!refreshToken) {
      return badRequest("refreshToken is required");
    }

    const payload = await verifyRefreshToken(env, refreshToken);
    if (!payload) {
      return unauthorized("Invalid or expired refresh token");
    }

    const user = await getUserById(env, payload.userId);
    if (!user) {
      return unauthorized("User not found");
    }

    if ((user as any).isSuspended === 1) {
      return jsonResponse({ error: "Your account has been suspended" }, 403);
    }

    const newAccessToken = await generateToken(payload.userId, env);
    const newRefreshToken = await generateRefreshToken(payload.userId, env);

    await env.DB.prepare("UPDATE refresh_tokens SET revoked = 1 WHERE user_id = ? AND token_hash = ?").bind(payload.userId, await hashString(refreshToken)).run();
    await storeRefreshToken(env, payload.userId, newRefreshToken);

    const safeUser = toCamelCase(user as unknown as Record<string, unknown>) as unknown as User;
    const { password: _, ...safeUserWithoutPassword } = safeUser;

    return jsonResponse({ user: safeUserWithoutPassword, token: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error("Refresh error:", err);
    return serverError();
  }
}

async function handleOtpLogin(request: Request, env: Env): Promise<Response> {
  try {
    const ip = requestIp(request);
    if (!(await checkRateLimit(env, `otp_ip:${ip || "unknown"}`, 10, 900))) {
      return jsonResponse({ error: "Too many OTP login attempts from this IP. Try again after 15 minutes." }, 429);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const target = phone || email;

    if (!code || !target) {
      return badRequest("Code and phone/email are required");
    }

    if (target && !(await checkRateLimit(env, `otp_user:${target}`, 5, 900))) {
      return jsonResponse({ error: "Too many OTP login attempts for this account. Try again after 15 minutes." }, 429);
    }

    const query = phone
      ? "SELECT * FROM otp_codes WHERE phone = ? AND purpose = 'login' AND used = 0 ORDER BY created_at DESC LIMIT 1"
      : "SELECT * FROM otp_codes WHERE email = ? AND purpose = 'login' AND used = 0 ORDER BY created_at DESC LIMIT 1";

    const result = await env.DB.prepare(query)
      .bind(target)
      .first<Record<string, unknown>>();

    if (!result) {
      return badRequest("Invalid or expired OTP");
    }

    const expiresAt = new Date(result.expires_at as string);
    if (expiresAt < new Date()) {
      return badRequest("OTP has expired");
    }

    const attempts = (result.attempts as number) || 0;
    const attemptsMax = (result.attempts_max as number) || 5;

    if (attempts >= attemptsMax) {
      await env.DB.prepare("UPDATE otp_codes SET used = 1 WHERE id = ?").bind(result.id).run();
      await logAudit(env, "auth.otp_login_failed_max", undefined, target, "user", undefined, { reason: "max_attempts_exceeded" }, ip);
      return badRequest("Maximum verification attempts exceeded. Please request a new OTP.");
    }

    const codeHash = result.code_hash as string;
    const isValid = await verifyOtpCode(code, codeHash);

    if (!isValid) {
      const newAttempts = attempts + 1;
      await env.DB.prepare("UPDATE otp_codes SET attempts = ? WHERE id = ?").bind(newAttempts, result.id).run();
      await logAudit(env, "auth.otp_login_failed", undefined, target, "user", undefined, { reason: "invalid_code", attempt: newAttempts }, ip);
      return badRequest(`Invalid OTP. ${attemptsMax - newAttempts} attempt(s) remaining.`);
    }

    await env.DB.prepare("UPDATE otp_codes SET used = 1 WHERE id = ?").bind(result.id).run();

    const user = phone
      ? await env.DB.prepare("SELECT * FROM users WHERE telephone = ? OR telephone = ?").bind(phone, formatPhone(phone)).first<Record<string, unknown>>()
      : await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<Record<string, unknown>>();

    if (!user) {
      return badRequest("No account found with this phone/email");
    }

    const safeUser = toCamelCase(user) as unknown as User;
    const { password: _, ...safeUserWithoutPassword } = safeUser;

    await logAudit(env, "auth.otp_login", safeUser.id, safeUser.email, "user", safeUser.id, { method: phone ? 'phone' : 'email' }, ip);
    const token = await generateToken(safeUser.id, env);
    const refreshToken = await generateRefreshToken(safeUser.id, env);
    await storeRefreshToken(env, safeUser.id, refreshToken);

    return jsonResponse({ user: safeUserWithoutPassword, token, refreshToken });
  } catch (err) {
    console.error("OTP login error:", err);
    return serverError();
  }
}

async function handleLogout(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const payload = await verifyToken(env, token);
    if (payload) {
      await logAudit(env, "auth.logout", payload.userId, undefined, "user", payload.userId, {}, requestIp(request));
    }
    return jsonResponse({ message: "Logged out successfully" });
  } catch (err) {
    console.error("Logout error:", err);
    return serverError();
  }
}

async function handleMe(token: string | null, env: Env): Promise<Response> {
  if (!token) {
    return unauthorized();
  }
  try {
    const payload = await verifyToken(env, token);
    if (!payload) {
      return unauthorized();
    }

    const result = await env.DB.prepare("SELECT * FROM users WHERE id = ?").bind(payload.userId).first<Record<string, unknown>>();
    if (!result) {
      return unauthorized();
    }

    const isSuspended = (result.is_suspended as number) === 1;
    if (isSuspended) {
      return jsonResponse({
        error: "Account suspended",
        suspended: true,
        reason: result.suspension_reason as string | null,
      }, 403);
    }

    const user = toCamelCase(result) as unknown as User;
    const { password: _, ...safeUser } = user;

    const newToken = await generateToken(user.id, env);
    const newRefreshToken = await generateRefreshToken(user.id, env);
    await storeRefreshToken(env, user.id, newRefreshToken);

    return jsonResponse({ user: safeUser, token: newToken, refreshToken: newRefreshToken });
  } catch {
    return serverError();
  }
}

async function handleHealth(): Promise<Response> {
  return jsonResponse({ status: "ok" });
}

// ──── Loan Handlers ──────────────────────────────────

async function handleLoanApply(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const user = await requireAuth(request, env);
    if (!user) {
      return unauthorized();
    }

    if ((user as any).isSuspended === 1) {
      return jsonResponse({ error: "Your account has been suspended. Please contact support." }, 403);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const customerId = typeof body.customerId === "string" ? body.customerId.trim() : "";
    const customerName = typeof body.customerName === "string" ? body.customerName.trim() : "";
    const loanType = typeof body.loanType === "string" ? body.loanType.trim() : "";
    const principal = Number(body.principal);
    const duration = Number(body.duration);
    const creditOfficer = typeof body.creditOfficer === "string" ? body.creditOfficer.trim() : "";

    if (!customerName) {
      return badRequest("Customer name is required");
    }

    if (loanType !== "Starter" && loanType !== "Top-up") {
      return badRequest("Loan type must be 'Starter' or 'Top-up'");
    }

    if (!principal || principal <= 0) {
      return badRequest("Principal must be a positive number");
    }

    if (!duration || duration <= 0 || !Number.isInteger(duration)) {
      return badRequest("Duration must be a positive integer");
    }

    if (!creditOfficer) {
      return badRequest("Credit officer is required");
    }

    if (principal > user.loanLimit) {
      return badRequest(`Loan amount exceeds your limit of Ksh ${user.loanLimit.toLocaleString()}`);
    }

    if (principal > (user.loanLimit - user.currentLoanBalance)) {
      return badRequest("Loan amount exceeds your available limit");
    }

    if (loanType === "Top-up") {
      const activeLoan = await env.DB.prepare(
        "SELECT * FROM loans WHERE user_id = ? AND status IN ('pending', 'disbursed', 'under_review')"
      ).bind(user.id).first<Record<string, unknown>>();

      if (activeLoan) {
        const repaid = Number(activeLoan.repaid_amount || 0);
        const total = Number(activeLoan.total || 0);
        if (!canTopUp(repaid, total)) {
          return badRequest("Top-up not allowed yet. You must have repaid at least 70% of your current loan.");
        }
      }
    }

    const interestRateSetting = await getSetting(env, "interest_rate");
    const interestRate = interestRateSetting ? Number(interestRateSetting) / 100 : 0.3;
    const total = calculateLoan(principal, interestRate);
    const weeklyInstallment = calculateWeeklyInstallment(total, duration);

    const availableLimit = user.loanLimit - user.currentLoanBalance;
    if (principal > availableLimit) {
      return badRequest("Loan exceeds your available limit");
    }

    const existingLoan = await env.DB.prepare(
      "SELECT id FROM loans WHERE user_id = ? AND status IN ('pending', 'disbursed', 'under_review')"
    )
      .bind(user.id)
      .first<{ id: string }>();

    if (existingLoan && loanType !== "Top-up") {
      return badRequest("You already have an active or pending loan. Please wait for it to be processed.");
    }

    const loanId = generateId();
    const now = new Date().toISOString();
    const loanNumber = `UST-${now.slice(2,4)}${now.slice(5,7)}${now.slice(8,10)}-${Math.floor(1000 + Math.random() * 9000)}`;

    await env.DB.prepare(
      `INSERT INTO loans (id, loan_number, user_id, customer_id, customer_name, loan_type, principal, total, weekly_installment, duration, status, applied_date, approved_date, disbursed_date, declined_reason, credit_officer, due_date, penalty_amount, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, NULL, NULL, NULL, ?, NULL, 0, ?)`
    )
      .bind(loanId, loanNumber, user.id, customerId || null, customerName, loanType, principal, total, weeklyInstallment, duration, now, creditOfficer, now)
      .run();

    await env.DB.prepare(
      `INSERT INTO transactions (id, user_id, loan_id, type, amount, status, reference, created_at)
       VALUES (?, ?, ?, 'loan', ?, 'pending', ?, ?)`
    )
      .bind(generateId(), user.id, loanId, principal, loanId, now)
      .run();

    await logAudit(env, "loan.apply", user.id, user.email, "loan", loanId, { loanType, principal, duration, total }, requestIp(request));

    const loan = await env.DB.prepare("SELECT * FROM loans WHERE id = ?").bind(loanId).first<Record<string, unknown>>();
    if (!loan) return badRequest("Loan not found");
    return jsonResponse({ loan: toCamelCase(loan) }, 201);
  } catch (err) {
    console.error("Loan apply error:", err);
    return serverError();
  }
}

async function handleLoanApprove(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const admin = await requireAuth(request, env);
    if (!admin || !hasAccess(admin.role, 'Officer')) {
      return jsonResponse({ error: "Forbidden: Officer+ access required" }, 403);
    }

    const loanId = request.url.split("/api/loans/")[1]?.split("/")[1] || "";
    if (!loanId) {
      return badRequest("Loan ID is required");
    }

    const loan = await env.DB.prepare("SELECT * FROM loans WHERE id = ?").bind(loanId).first<Record<string, unknown>>();
    if (!loan) {
      return badRequest("Loan not found");
    }

    if ((loan as any).status !== "pending") {
      return badRequest("Only pending loans can be approved");
    }

    const now = new Date().toISOString();

    try {
      await env.DB.prepare(
        `UPDATE loans SET status = 'approved', approved_date = ?, approved_by = ?, approved_by_pf = ? WHERE id = ?`
      ).bind(now, admin.fullName, admin.pfNumber, loanId).run();

      await env.DB.prepare(
        `INSERT INTO transactions (id, user_id, loan_id, type, amount, status, reference, created_at)
         VALUES (?, ?, ?, 'loan', ?, 'success', ?, ?)`
      )
        .bind(generateId(), (loan as any).user_id, loanId, (loan as any).principal, loanId, now)
        .run();

      const currentBalance = await getUserBalance(env, (loan as any).user_id);
      const newBalance = currentBalance + (loan as any).principal;
      await env.DB.prepare(
        "UPDATE users SET current_loan_balance = ? WHERE id = ?"
      ).bind(newBalance, (loan as any).user_id).run();

      await recordLedgerEntry(env, (loan as any).user_id, loanId, "disbursement", (loan as any).principal, "debit", newBalance, loanId, admin.id, admin.email, { action: "approve_loan", principal: (loan as any).principal });

      const user = await getUserById(env, (loan as any).user_id);
      if (user) {
        const newScore = Math.min(850, (user.creditScore || 0) + 20);
        await env.DB.prepare(
          `UPDATE users SET credit_score = ? WHERE id = ?`
        ).bind(newScore, (loan as any).user_id).run();
      }

      if (user && user.creditScore > 700) {
        const newLimit = user.loanLimit + Math.round((loan as any).principal * 0.5);
        await env.DB.prepare(
          `UPDATE users SET loan_limit = ? WHERE id = ?`
        ).bind(newLimit, (loan as any).user_id).run();
      }

      await logAdminAction(env, admin.id, admin.email, "approve_loan", (loan as any).user_id, { loanId, principal: (loan as any).principal }, requestIp(request));
      await logAudit(env, "loan.approve", admin.id, admin.email, "loan", loanId, { loanId, principal: (loan as any).principal }, requestIp(request));

      if (user && user.telephone) {
        await sendLoanApprovedSms(env, user.telephone, loanId, (loan as any).principal);
      }
      if (user && user.email) {
        await sendLoanApprovedEmail(env, user.email, loanId, (loan as any).principal);
      }
    } catch (err) {
      console.error("Loan approve partial failure, enqueuing for retry:", err);
      await enqueueRetry(env, "approve_loan", {
        loan_id: loanId,
        approved_by: admin.fullName,
        approved_by_pf: admin.pfNumber,
        principal: (loan as any).principal,
        user_id: (loan as any).user_id,
      });
      return jsonResponse({ loan: toCamelCase(loan), queued: true, message: "Operation queued for retry" }, 202);
    }

    const updatedLoan = await env.DB.prepare("SELECT * FROM loans WHERE id = ?").bind(loanId).first<Record<string, unknown>>();
    if (!updatedLoan) return serverError("Loan not found");
    return jsonResponse({ loan: toCamelCase(updatedLoan) });
  } catch (err) {
    console.error("Loan approve error:", err);
    return serverError();
  }
}

async function handleLoanDecline(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const admin = await requireAuth(request, env);
    if (!admin || !hasAccess(admin.role, 'Officer')) {
      return jsonResponse({ error: "Forbidden: Officer+ access required" }, 403);
    }

    const loanId = request.url.split("/api/loans/")[1]?.split("/")[1] || "";
    if (!loanId) {
      return badRequest("Loan ID is required");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!reason) {
      return badRequest("Decline reason is required");
    }

    const loan = await env.DB.prepare("SELECT * FROM loans WHERE id = ?").bind(loanId).first<Record<string, unknown>>();
    if (!loan) {
      return badRequest("Loan not found");
    }

    if ((loan as any).status !== "pending") {
      return badRequest("Only pending loans can be declined");
    }

    const now = new Date().toISOString();

    try {
      await env.DB.prepare(
        `UPDATE loans SET status = 'declined', declined_reason = ? WHERE id = ?`
      ).bind(reason, loanId).run();

      await env.DB.prepare(
        `INSERT INTO transactions (id, user_id, loan_id, type, amount, status, reference, created_at)
         VALUES (?, ?, ?, 'loan', ?, 'failed', ?, ?)`
      )
        .bind(generateId(), (loan as any).user_id, loanId, (loan as any).principal, loanId, now)
        .run();

      await logAdminAction(env, admin.id, admin.email, "decline_loan", (loan as any).user_id, { loanId, reason }, requestIp(request));
      await logAudit(env, "loan.decline", admin.id, admin.email, "loan", loanId, { loanId, reason }, requestIp(request));

      const user = await getUserById(env, (loan as any).user_id);
      if (user && user.telephone) {
        await sendLoanDeclinedSms(env, user.telephone, loanId, reason);
      }
      if (user && user.email) {
        await sendLoanDeclinedEmail(env, user.email, loanId, reason);
      }

      const officer = (loan as any).credit_officer as string | undefined;
      if (officer) {
        const officerUser = await env.DB.prepare(
          "SELECT * FROM users WHERE full_name = ? AND role IN ('Officer', 'Supervisor', 'Manager')"
        ).bind(officer).first<Record<string, unknown>>();
        if (officerUser && officerUser.telephone) {
          await sendSms(env, String(officerUser.telephone), `Dear ${officer}, kindly review loan ${loanId}. Reason: ${reason}`);
        }
      }
    } catch (err) {
      console.error("Loan decline partial failure, enqueuing for retry:", err);
      await enqueueRetry(env, "decline_loan", {
        loan_id: loanId,
        reason,
        user_id: (loan as any).user_id,
      });
      return jsonResponse({ loan: toCamelCase(loan), queued: true, message: "Operation queued for retry" }, 202);
    }

    const updatedLoan = await env.DB.prepare("SELECT * FROM loans WHERE id = ?").bind(loanId).first<Record<string, unknown>>();
    if (!updatedLoan) return serverError("Loan not found");
    return jsonResponse({ loan: toCamelCase(updatedLoan) });
  } catch (err) {
    console.error("Loan decline error:", err);
    return serverError();
  }
}

async function handleLoanStatement(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const user = await requireAuth(request, env);
    if (!user) {
      return unauthorized();
    }

    const url = new URL(request.url);
    const loanId = url.pathname.split("/").filter(Boolean).pop() || "";

    if (!loanId) {
      return badRequest("Loan ID is required");
    }

    const loan = await env.DB.prepare(`
      SELECT l.*, u.full_name as customer_name
      FROM loans l
      JOIN users u ON l.user_id = u.id
      WHERE l.id = ?
    `).bind(loanId).first<Record<string, unknown>>();

    if (!loan) {
      return badRequest("Loan not found");
    }

    if ((loan as any).user_id !== user.id && !hasAccess(user.role, 'Manager')) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const repayments = await env.DB.prepare(`
      SELECT amount, type, status, reference, created_at
      FROM transactions
      WHERE loan_id = ?
      ORDER BY created_at ASC
    `).bind(loanId).all<Record<string, unknown>>();

    const loanData = toCamelCase(loan);
    const repaymentData = (repayments.results || []).map(toCamelCase);

    const format = url.searchParams.get("format");

    if (format === "html") {
      const rows = repaymentData.map((r: Record<string, unknown>) => {
        const date = new Date(String(r.createdAt)).toLocaleDateString("en-KE");
        const amount = Number(r.amount).toLocaleString();
        const status = String(r.status);
        return `<tr><td>${date}</td><td>${amount}</td><td>${status}</td></tr>`;
      }).join("");

      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Loan Statement</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 20px; color: #333; }
    h1 { color: #1a73e8; }
    .info { margin: 10px 0; }
    .label { font-weight: bold; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 8px; text-align: left; }
    th { background-color: #f2f2f2; }
    .footer { margin-top: 30px; font-size: 12px; color: #666; }
  </style>
</head>
<body>
  <h1>Vaultiline - Loan Statement</h1>
  <div class="info"><span class="label">Loan Number:</span> ${loanData.loanNumber}</div>
  <div class="info"><span class="label">Customer:</span> ${loanData.customerName}</div>
  <div class="info"><span class="label">Principal:</span> Ksh ${Number(loanData.principal).toLocaleString()}</div>
  <div class="info"><span class="label">Total:</span> Ksh ${Number(loanData.total).toLocaleString()}</div>
  <div class="info"><span class="label">Duration:</span> ${loanData.duration} weeks</div>
  <div class="info"><span class="label">Status:</span> ${loanData.status}</div>
  <div class="info"><span class="label">Applied Date:</span> ${new Date(String(loanData.appliedDate)).toLocaleDateString("en-KE")}</div>
  ${loanData.approvedDate ? `<div class="info"><span class="label">Approved Date:</span> ${new Date(String(loanData.approvedDate)).toLocaleDateString("en-KE")}</div>` : ""}
  ${loanData.disbursedDate ? `<div class="info"><span class="label">Disbursed Date:</span> ${new Date(String(loanData.disbursedDate)).toLocaleDateString("en-KE")}</div>` : ""}
  ${loanData.dueDate ? `<div class="info"><span class="label">Due Date:</span> ${new Date(String(loanData.dueDate)).toLocaleDateString("en-KE")}</div>` : ""}
  <h2>Repayment History</h2>
  <table>
    <tr><th>Date</th><th>Amount (Ksh)</th><th>Status</th></tr>
    ${rows || "<tr><td colspan='3'>No repayments yet</td></tr>"}
  </table>
  <div class="footer">Generated on ${new Date().toLocaleString("en-KE")} | Vaultiline</div>
</body>
</html>`;

      return new Response(html, {
        headers: {
          "Content-Type": "text/html",
          "Content-Disposition": `inline; filename=loan-statement-${loanId}.html`,
        },
      });
    }

    return jsonResponse({
      loan: loanData,
      repayments: repaymentData
    });
  } catch (err) {
    console.error("Loan statement error:", err);
    return serverError();
  }
}

async function handleLoanDisburse(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const admin = await requireAuth(request, env);
    if (!admin || !hasAccess(admin.role, 'Manager')) {
      return jsonResponse({ error: "Forbidden: Manager access required" }, 403);
    }

    const loanId = request.url.split("/api/loans/")[1]?.split("/")[1] || "";
    if (!loanId) {
      return badRequest("Loan ID is required");
    }

    const loan = await env.DB.prepare("SELECT * FROM loans WHERE id = ?").bind(loanId).first<Record<string, unknown>>();
    if (!loan) {
      return badRequest("Loan not found");
    }

    if ((loan as any).status !== "approved") {
      return badRequest("Only approved loans can be disbursed");
    }

    const now = new Date().toISOString();
    const dueDate = new Date(Date.now() + (loan as any).duration * 7 * 24 * 60 * 60 * 1000).toISOString();

    try {
      await env.DB.prepare(
        `UPDATE loans SET status = 'disbursed', disbursed_date = ?, due_date = ? WHERE id = ?`
      ).bind(now, dueDate, loanId).run();

      await logAdminAction(env, admin.id, admin.email, "disburse_loan", (loan as any).user_id, { loanId, principal: (loan as any).principal, dueDate }, requestIp(request));
      await logAudit(env, "loan.disburse", admin.id, admin.email, "loan", loanId, { loanId, principal: (loan as any).principal, dueDate }, requestIp(request));

      const user = await getUserById(env, (loan as any).user_id);
      if (user && user.telephone) {
        await sendLoanDisbursedSms(env, user.telephone, loanId, (loan as any).principal, dueDate.split("T")[0]);
      }
      if (user && user.email) {
        await sendLoanDisbursedEmail(env, user.email, loanId, (loan as any).principal, dueDate.split("T")[0]);
      }
    } catch (err) {
      console.error("Loan disburse partial failure, enqueuing for retry:", err);
      await enqueueRetry(env, "disburse_loan", {
        loan_id: loanId,
        disbursed_date: now,
        due_date: dueDate,
        principal: (loan as any).principal,
        user_id: (loan as any).user_id,
      });
      return jsonResponse({ loan: toCamelCase(loan), queued: true, message: "Operation queued for retry" }, 202);
    }

    const updatedLoan = await env.DB.prepare("SELECT * FROM loans WHERE id = ?").bind(loanId).first<Record<string, unknown>>();
    if (!updatedLoan) return serverError("Loan not found");
    return jsonResponse({ loan: toCamelCase(updatedLoan) });
  } catch (err) {
    console.error("Loan disburse error:", err);
    return serverError();
  }
}

async function handleUpdateLoanStatus(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const admin = await requireAuth(request, env);
    if (!admin || !hasAccess(admin.role, 'Manager')) {
      return jsonResponse({ error: "Forbidden: Manager access required" }, 403);
    }

    const loanId = request.url.split("/api/loans/")[1]?.split("/")[1] || "";
    if (!loanId) {
      return badRequest("Loan ID is required");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const status = typeof body.status === "string" ? body.status : "";

    const validStatuses = ["pending", "approved", "declined", "disbursed", "closed", "under_review"];
    if (!validStatuses.includes(status)) {
      return badRequest(`Invalid status. Must be one of: ${validStatuses.join(", ")}`);
    }

    const loan = await env.DB.prepare("SELECT * FROM loans WHERE id = ?").bind(loanId).first<Record<string, unknown>>();
    if (!loan) {
      return badRequest("Loan not found");
    }

    const now = new Date().toISOString();

    await env.DB.prepare(
      `UPDATE loans SET status = ?, updated_at = ? WHERE id = ?`
    ).bind(status, now, loanId).run();

    await logAdminAction(env, admin.id, admin.email, "update_loan_status", (loan as any).user_id, { loanId, status }, requestIp(request));
    await logAudit(env, "loan.update_status", admin.id, admin.email, "loan", loanId, { loanId, status }, requestIp(request));

    const updatedLoan = await env.DB.prepare("SELECT * FROM loans WHERE id = ?").bind(loanId).first<Record<string, unknown>>();
    if (!updatedLoan) return serverError("Loan not found");
    return jsonResponse({ loan: toCamelCase(updatedLoan) });
  } catch (err) {
    console.error("Loan update status error:", err);
    return serverError();
  }
}

async function handleLoanRepay(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const user = await requireAuth(request, env);
    if (!user) {
      return unauthorized();
    }

    if ((user as any).isSuspended === 1) {
      return jsonResponse({ error: "Your account has been suspended. Please contact support." }, 403);
    }

    const loanId = request.url.split("/api/loans/")[1]?.split("/")[1] || "";
    if (!loanId) {
      return badRequest("Loan ID is required");
    }

    const body = (await request.json()) as Record<string, unknown>;
    const amount = Number(body.amount);
    const reference = typeof body.reference === "string" ? body.reference.trim() : "";

    if (!amount || amount <= 0) {
      return badRequest("Amount must be a positive number");
    }

    const loan = await env.DB.prepare("SELECT * FROM loans WHERE id = ?").bind(loanId).first<Record<string, unknown>>();
    if (!loan) {
      return badRequest("Loan not found");
    }

    if ((loan as any).user_id !== user.id) {
      return jsonResponse({ error: "Forbidden: You can only repay your own loans" }, 403);
    }

    if ((loan as any).status !== "disbursed" && (loan as any).status !== "under_review") {
      return badRequest("Loan is not in a repayable state");
    }

    if (amount > user.currentLoanBalance) {
      return badRequest("Amount exceeds your current loan balance");
    }

    const now = new Date().toISOString();

    await env.DB.prepare(
      `INSERT INTO transactions (id, user_id, loan_id, type, amount, status, reference, created_at)
       VALUES (?, ?, ?, 'repayment', ?, 'success', ?, ?)`
    )
      .bind(generateId(), user.id, loanId, amount, reference || loanId, now)
      .run();

    const currentBalance = await getUserBalance(env, user.id);
    const newBalance = Math.max(0, currentBalance - amount);
    await env.DB.prepare(
      "UPDATE users SET current_loan_balance = ? WHERE id = ?"
    ).bind(newBalance, user.id).run();

    await recordLedgerEntry(env, user.id, loanId, "repayment", amount, "credit", newBalance, reference || loanId, user.id, user.email, { action: "manual_repay", loanId });

    await env.DB.prepare(
      `UPDATE loans SET repaid_amount = COALESCE(repaid_amount, 0) + ? WHERE id = ?`
    ).bind(amount, loanId).run();

    const updatedUser = await getUserById(env, user.id);
    if (updatedUser && updatedUser.currentLoanBalance <= 0) {
      await env.DB.prepare(
        `UPDATE loans SET status = 'closed' WHERE id = ?`
      ).bind(loanId).run();

      const newScore = Math.min(850, (user.creditScore || 0) + 30);
      await env.DB.prepare(
        `UPDATE users SET credit_score = ?, current_loan_balance = 0 WHERE id = ?`
      ).bind(newScore, user.id).run();
    }

    await logAudit(env, "loan.repay", user.id, user.email, "loan", loanId, { amount, reference }, requestIp(request));

    // Send repayment confirmation SMS
    const balance = updatedUser?.currentLoanBalance || 0;
    await sendRepaymentSms(env, user.telephone, (loan as any).loan_number || loanId, amount, balance);
    if (user.email) {
      const nextPaymentDate = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
      await sendRepaymentEmail(env, user.email, (loan as any).loan_number || loanId, amount, balance, nextPaymentDate);
    }

    const updatedLoan = await env.DB.prepare("SELECT * FROM loans WHERE id = ?").bind(loanId).first<Record<string, unknown>>();
    if (!updatedLoan) return serverError("Loan not found");
    return jsonResponse({ loan: toCamelCase(updatedLoan) });
  } catch (err) {
    console.error("Loan repay error:", err);
    return serverError();
  }
}

async function handleGetLoans(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const user = await requireAuth(request, env);
    if (!user) {
      return unauthorized();
    }

    let query = `SELECT l.*, u.email, u.full_name as user_full_name, u.telephone, u.role as user_role
                 FROM loans l
                 JOIN users u ON l.user_id = u.id`;
    const bindings: (string | number)[] = [];

    if (!hasAccess(user.role, 'Manager')) {
      query += " WHERE l.user_id = ?";
      bindings.push(user.id);
    }

    query += " ORDER BY l.created_at DESC";

    const loans = await env.DB.prepare(query).bind(...bindings).all<Record<string, unknown>>();

    const result = (loans.results || []).map((row) => toCamelCase(row));
    return jsonResponse({ loans: result });
  } catch (err) {
    console.error("Get loans error:", err);
    return serverError();
  }
}

async function handleGetMyLoanInfo(request: Request, env: Env, token: string): Promise<Response> {
  if (!token) {
    return unauthorized();
  }
  try {
    const user = await requireAuth(request, env);
    if (!user) {
      return unauthorized();
    }

    const activeLoan = await env.DB.prepare(
      `SELECT * FROM loans WHERE user_id = ? AND status IN ('disbursed', 'under_review', 'approved') ORDER BY created_at DESC LIMIT 1`
    ).bind(token).first<Record<string, unknown>>();

    const totalLoans = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM loans WHERE user_id = ?"
    ).bind(token).first<{ count: number }>();

    const totalRepaid = await env.DB.prepare(
      "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'repayment' AND status = 'success'"
    ).bind(token).first<{ total: number }>();

    return jsonResponse({
      loanLimit: user.loanLimit || 0,
      currentLoanBalance: user.currentLoanBalance || 0,
      creditScore: user.creditScore || 0,
      hasActiveLoan: !!activeLoan,
      activeLoan: activeLoan ? toCamelCase(activeLoan) : null,
      totalLoans: totalLoans?.count || 0,
      totalRepaid: totalRepaid?.total || 0,
    });
  } catch (err) {
    console.error("Get my loan info error:", err);
    return serverError();
  }
}

// ──── Admin Handlers ──────────────────────────────────────────────────────────────────────────────────────────────

async function handleAdminReportsLoans(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const admin = await requireAuth(request, env);
    if (!admin || !hasAccess(admin.role, 'Manager')) {
      return jsonResponse({ error: "Forbidden: Manager access required" }, 403);
    }

    const url = new URL(request.url);
    const officer = url.searchParams.get("officer") || "";
    const branch = url.searchParams.get("branch") || "";
    const periodFrom = url.searchParams.get("from") || "";
    const periodTo = url.searchParams.get("to") || "";
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
    const offset = Number(url.searchParams.get("offset")) || 0;

    let query = `SELECT l.*, u.email, u.full_name as user_full_name, u.telephone, u.role as user_role
                 FROM loans l
                 JOIN users u ON l.user_id = u.id
                 WHERE 1=1`;
    const bindings: (string | number)[] = [];

    if (officer) {
      query += " AND l.credit_officer = ?";
      bindings.push(officer);
    }
    if (branch) {
      query += " AND u.branch = ?";
      bindings.push(branch);
    }
    if (periodFrom) {
      query += " AND l.applied_date >= ?";
      bindings.push(periodFrom);
    }
    if (periodTo) {
      query += " AND l.applied_date <= ?";
      bindings.push(periodTo);
    }

    query += " ORDER BY l.created_at DESC LIMIT ? OFFSET ?";
    bindings.push(limit, offset);

    const loans = await env.DB.prepare(query).bind(...bindings).all<Record<string, unknown>>();
    const result = (loans.results || []).map((row) => toCamelCase(row));

    const countQuery = `SELECT COUNT(*) as total FROM loans l WHERE 1=1`;
    const countBindings: (string | number)[] = [];
    let countWhere = "";
    if (officer) { countWhere += " AND l.credit_officer = ?"; countBindings.push(officer); }
    if (branch) { countWhere += " AND l.branch = ?"; countBindings.push(branch); }
    if (periodFrom) { countWhere += " AND l.applied_date >= ?"; countBindings.push(periodFrom); }
    if (periodTo) { countWhere += " AND l.applied_date <= ?"; countBindings.push(periodTo); }
    const countRow = await env.DB.prepare(countQuery + countWhere).bind(...countBindings).first<{ total: number }>();
    const total = countRow?.total ?? 0;

    await logAdminAction(env, admin.id, admin.email, "report_loans_viewed", undefined, { officer, branch, periodFrom, periodTo, limit, offset }, requestIp(request));

    return jsonResponse({ loans: result, total, limit, offset, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("Admin loan reports error:", err);
    return serverError();
  }
}

async function handleAdminReportsRepayments(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const admin = await requireAuth(request, env);
    if (!admin || !hasAccess(admin.role, 'Manager')) {
      return jsonResponse({ error: "Forbidden: Manager access required" }, 403);
    }

    const url = new URL(request.url);
    const officer = url.searchParams.get("officer") || "";
    const branch = url.searchParams.get("branch") || "";
    const periodFrom = url.searchParams.get("from") || "";
    const periodTo = url.searchParams.get("to") || "";
    const format = url.searchParams.get("format") || "json";
    const limit = Math.min(Number(url.searchParams.get("limit")) || 50, 200);
    const offset = Number(url.searchParams.get("offset")) || 0;

    let query = `SELECT t.*, u.full_name as user_full_name, u.telephone, u.branch
                 FROM transactions t
                 JOIN users u ON t.user_id = u.id
                 WHERE t.type = 'repayment' AND t.status = 'success'`;
    const bindings: (string | number)[] = [];

    if (officer) {
      query += " AND u.assignment = ?";
      bindings.push(officer);
    }
    if (branch) {
      query += " AND u.branch = ?";
      bindings.push(branch);
    }
    if (periodFrom) {
      query += " AND t.created_at >= ?";
      bindings.push(periodFrom);
    }
    if (periodTo) {
      query += " AND t.created_at <= ?";
      bindings.push(periodTo);
    }

    query += " ORDER BY t.created_at DESC LIMIT ? OFFSET ?";
    bindings.push(limit, offset);

    const repayments = await env.DB.prepare(query).bind(...bindings).all<Record<string, unknown>>();
    const result = (repayments.results || []).map((row) => toCamelCase(row));

    const countQuery = `SELECT COUNT(*) as total FROM transactions t JOIN users u ON t.user_id = u.id WHERE t.type = 'repayment' AND t.status = 'success'`;
    const countBindings: (string | number)[] = [];
    let countWhere = "";
    if (officer) { countWhere += " AND u.assignment = ?"; countBindings.push(officer); }
    if (branch) { countWhere += " AND u.branch = ?"; countBindings.push(branch); }
    if (periodFrom) { countWhere += " AND t.created_at >= ?"; countBindings.push(periodFrom); }
    if (periodTo) { countWhere += " AND t.created_at <= ?"; countBindings.push(periodTo); }
    const countRow = await env.DB.prepare(countQuery + countWhere).bind(...countBindings).first<{ total: number }>();
    const total = countRow?.total ?? 0;

    await logAdminAction(env, admin.id, admin.email, "report_repayments_viewed", undefined, { officer, branch, periodFrom, periodTo, format, limit, offset }, requestIp(request));

    if (format === "csv") {
      const csv = "Date,User,Amount,Reference\n" + result.map((r: any) => `${r.createdAt},${r.userFullName},${r.amount},${r.reference}`).join("\n");
      return new Response(csv, {
        headers: { "Content-Type": "text/csv", "Content-Disposition": "attachment; filename=repayments.csv" },
      });
    }

    return jsonResponse({ repayments: result, total, limit, offset, generatedAt: new Date().toISOString() });
  } catch (err) {
    console.error("Admin repayment reports error:", err);
    return serverError();
  }
}

async function handleAdminBulkSms(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const admin = await requireAuth(request, env);
    if (!admin || !hasAccess(admin.role, 'Manager')) {
      return jsonResponse({ error: "Forbidden: Manager access required" }, 403);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const message = typeof body.message === "string" ? body.message.trim() : "";
    const recipientType = typeof body.recipientType === "string" ? body.recipientType : "all";
    const filterBranch = typeof body.filterBranch === "string" ? body.filterBranch.trim() : "";
    const sendEmail = body.sendEmail === true;
    const sendSms = body.sendSms === true;

    if (!message) {
      return badRequest("Message is required");
    }

    if (!sendEmail && !sendSms) {
      return badRequest("Please select at least one channel (Email or SMS)");
    }

    let recipients: Array<{ email?: string; telephone?: string }> = [];

    if (recipientType === "all") {
      const users = await env.DB.prepare("SELECT email, telephone FROM users WHERE (email IS NOT NULL AND email != '') OR (telephone IS NOT NULL AND telephone != '')").all<{ email: string; telephone: string }>();
      recipients = (users.results || []).map((u) => ({ email: u.email || undefined, telephone: u.telephone || undefined }));
    } else {
      let query = "SELECT email, telephone FROM users WHERE (email IS NOT NULL AND email != '') OR (telephone IS NOT NULL AND telephone != '')";
      const bindings: (string | number)[] = [];
      if (filterBranch) {
        query += " AND branch = ?";
        bindings.push(filterBranch);
      }
      const users = await env.DB.prepare(query).bind(...bindings).all<{ email: string; telephone: string }>();
      recipients = (users.results || []).map((u) => ({ email: u.email || undefined, telephone: u.telephone || undefined }));
    }

    const results = [];
    for (const recipient of recipients) {
      const result = { email: null as any, sms: null as any };
      
      if (sendEmail && recipient.email) {
        const emailResult = await sendBrevoEmail(env, recipient.email, message, `<p>${message.replace(/\n/g, '</p><p>')}</p>`);
        result.email = { success: emailResult.success, messageId: emailResult.messageId };
      }
      
      if (sendSms && recipient.telephone) {
        const smsResult = await sendSms(env, recipient.telephone, message, admin.id);
        result.sms = { success: smsResult.success, messageId: smsResult.messageId };
      }
      
      results.push({ recipient: recipient.email || recipient.telephone, result });
      await new Promise((r) => setTimeout(r, 200));
    }

    const successCount = results.filter((r) => (r.result.email?.success || r.result.sms?.success)).length;
    const failCount = results.length - successCount;

    await logAdminAction(env, admin.id, admin.email, "bulk_message_sent", undefined, { message: message.substring(0, 100), recipientType, filterBranch, sendEmail, sendSms, successCount, failCount }, requestIp(request));

    return jsonResponse({ success: true, sent: successCount, failed: failCount, total: recipients.length });
  } catch (err) {
    console.error("Bulk message error:", err);
    return serverError();
  }
}

async function handleAdminSettings(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const admin = await requireAuth(request, env);
    if (!admin || !hasAccess(admin.role, 'Manager')) {
      return jsonResponse({ error: "Forbidden: Manager access required" }, 403);
    }

    if (request.method === "GET") {
      const cache = (env as any).CACHE || caches.default;
      let response = await cache.match(request);
      if (!response) {
        const maxLoan = await getSetting(env, "max_loan_amount");
        const interestRate = await getSetting(env, "interest_rate");
        const repaymentPeriod = await getSetting(env, "repayment_period");
        const minLoan = await getSetting(env, "min_loan_amount");
        const body = {
          maxLoanAmount: maxLoan,
          interestRate: interestRate,
          repaymentPeriod: repaymentPeriod,
          minLoanAmount: minLoan,
        };
        response = jsonResponse(body);
        response = new Response(response.body, {
          status: response.status,
          statusText: response.statusText,
          headers: new Headers({
            ...Object.fromEntries(response.headers.entries()),
            "Cache-Control": "public, max-age=300",
          }),
        });
        await cache.put(request, response.clone());
      }
      return response;
    }

    if (request.method === "POST") {
      const body = (await request.json()) as Record<string, unknown>;
      const updates: Record<string, string> = {};
      const fields = ["maxLoanAmount", "interestRate", "repaymentPeriod", "minLoanAmount"];
      const keys = ["max_loan_amount", "interest_rate", "repayment_period", "min_loan_amount"];

      for (let i = 0; i < fields.length; i++) {
        if (fields[i] in body) {
          updates[keys[i]] = String(body[fields[i]]);
        }
      }

      for (const [key, value] of Object.entries(updates)) {
        await env.DB.prepare(
          `INSERT OR REPLACE INTO settings (key, value, description, updated_at)
           VALUES (?, ?, COALESCE((SELECT description FROM settings WHERE key = ?), ''), ?)`
        )
          .bind(key, value, key, new Date().toISOString())
          .run();
      }

      await logAdminAction(env, admin.id, admin.email, "settings_updated", undefined, updates, requestIp(request));

      return jsonResponse({ success: true, settings: updates });
    }

    return badRequest("Method not allowed");
  } catch (err) {
    console.error("Admin settings error:", err);
    return serverError();
  }
}

// ──── Admin Handlers ──────────────────────────────────────────────────────────────────────────────────────────────

async function handleAdminSuspendUser(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const admin = await requireAuth(request, env);
    if (!admin || !hasAccess(admin.role, 'Manager')) {
      return jsonResponse({ error: "Forbidden: Manager access required" }, 403);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";
    const reason = typeof body.reason === "string" ? body.reason.trim() : "";

    if (!targetUserId) {
      return badRequest("User ID is required");
    }

    if (!reason) {
      return badRequest("Suspension reason is required");
    }

    const targetUser = await getUserById(env, targetUserId);
    if (!targetUser) {
      return badRequest("User not found");
    }

    if ((targetUser as any).isSuspended === 1) {
      return jsonResponse({ error: "User is already suspended" }, 400);
    }

    await env.DB.prepare(
      `UPDATE users SET is_suspended = 1, suspension_reason = ?, suspended_at = ? WHERE id = ?`
    ).bind(reason, new Date().toISOString(), targetUserId).run();

    await logAdminAction(env, admin.id, admin.email, "suspend_user", targetUserId, { reason, targetEmail: targetUser.email }, requestIp(request));
    await logAudit(env, "admin.suspend_user", admin.id, admin.email, "user", targetUserId, { reason, targetEmail: targetUser.email }, requestIp(request));

    // Send SMS notification to suspended user
    if (targetUser.telephone) {
      await sendSuspensionSms(env, targetUser.telephone, reason);
    }
    if (targetUser.email) {
      await sendSuspensionEmail(env, targetUser.email, reason);
    }

    return jsonResponse({ message: "User suspended successfully" }, 200);
  } catch (err) {
    console.error("Suspend user error:", err);
    return serverError();
  }
}

async function handleAdminUnsuspendUser(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const admin = await requireAuth(request, env);
    if (!admin || !hasAccess(admin.role, 'Manager')) {
      return jsonResponse({ error: "Forbidden: Manager access required" }, 403);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";

    if (!targetUserId) {
      return badRequest("User ID is required");
    }

    const targetUser = await getUserById(env, targetUserId);
    if (!targetUser) {
      return badRequest("User not found");
    }

    if ((targetUser as any).isSuspended !== 1) {
      return jsonResponse({ error: "User is not suspended" }, 400);
    }

    await env.DB.prepare(
      `UPDATE users SET is_suspended = 0, suspension_reason = NULL, suspended_at = NULL WHERE id = ?`
    ).bind(targetUserId).run();

    await logAdminAction(env, admin.id, admin.email, "unsuspend_user", targetUserId, { targetEmail: targetUser.email }, requestIp(request));
    await logAudit(env, "admin.unsuspend_user", admin.id, admin.email, "user", targetUserId, { targetEmail: targetUser.email }, requestIp(request));

    return jsonResponse({ message: "User unsuspended successfully" }, 200);
  } catch (err) {
    console.error("Unsuspend user error:", err);
    return serverError();
  }
}

async function handleAdminDeleteUser(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const admin = await requireAuth(request, env);
    if (!admin || !hasAccess(admin.role, 'Manager')) {
      return jsonResponse({ error: "Forbidden: Manager access required" }, 403);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";

    if (!targetUserId) {
      return badRequest("User ID is required");
    }

    const targetUser = await getUserById(env, targetUserId);
    if (!targetUser) {
      return badRequest("User not found");
    }

    if (targetUser.email === "demo@example.com" || targetUser.email === "admin@example.com" || targetUser.email === "owner@example.com") {
      return jsonResponse({ error: "Cannot delete protected account" }, 400);
    }

    await env.DB.prepare("DELETE FROM users WHERE id = ?").bind(targetUserId).run();

    await logAdminAction(env, admin.id, admin.email, "delete_user", targetUserId, { targetEmail: targetUser.email, targetRole: targetUser.role }, requestIp(request));
    await logAudit(env, "admin.delete_user", admin.id, admin.email, "user", targetUserId, { targetEmail: targetUser.email, targetRole: targetUser.role }, requestIp(request));

    return jsonResponse({ message: "User deleted successfully" }, 200);
  } catch (err) {
    console.error("Delete user error:", err);
    return serverError();
  }
}

async function handleAdminUpdateUserRole(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const admin = await requireAuth(request, env);
    if (!admin || !hasAccess(admin.role, 'Manager')) {
      return jsonResponse({ error: "Forbidden: Manager access required" }, 403);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const targetUserId = typeof body.userId === "string" ? body.userId.trim() : "";
    const newRole = typeof body.role === "string" ? body.role.trim() : "";

    if (!targetUserId || !newRole) {
      return badRequest("User ID and role are required");
    }

    const validRoles: UserRole[] = ["User", "Officer", "Supervisor", "Manager"];
    if (!validRoles.includes(newRole as UserRole)) {
      return jsonResponse({ error: "Invalid role. Must be one of: User, Officer, Supervisor, Manager" }, 400);
    }

    const targetUser = await getUserById(env, targetUserId);
    if (!targetUser) {
      return badRequest("User not found");
    }

    if (targetUser.email === "demo@example.com" || targetUser.email === "admin@example.com" || targetUser.email === "owner@example.com") {
      return jsonResponse({ error: "Cannot change role of protected account" }, 400);
    }

    await env.DB.prepare("UPDATE users SET role = ? WHERE id = ?").bind(newRole, targetUserId).run();

    await logAdminAction(env, admin.id, admin.email, "update_user_role", targetUserId, { targetEmail: targetUser.email, oldRole: targetUser.role, newRole }, requestIp(request));
    await logAudit(env, "admin.update_user_role", admin.id, admin.email, "user", targetUserId, { targetEmail: targetUser.email, oldRole: targetUser.role, newRole }, requestIp(request));

    return jsonResponse({ message: "User role updated successfully", userId: targetUserId, newRole }, 200);
  } catch (err) {
    console.error("Update user role error:", err);
    return serverError();
  }
}

async function handleAdminTestEmail(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const admin = await requireAuth(request, env);
    if (!admin || !hasAccess(admin.role, 'Manager')) {
      return jsonResponse({ error: "Forbidden: Manager access required" }, 403);
    }

    const body = (await request.json()) as Record<string, unknown> | null;
    const toRaw = typeof body?.to === "string" ? body.to : "support@example.com";
    const subject = typeof body?.subject === "string" ? body.subject : "Test Email - Vaultiline Platform";
    const to = toRaw.split(",").map((e) => e.trim()).filter(Boolean);

    const result = await sendTestEmail(env, to, subject);

    return jsonResponse({
      message: result.success ? "Test email sent successfully" : "Test email failed",
      success: result.success,
      messageId: result.messageId,
      error: result.error,
    }, result.success ? 200 : 500);
  } catch (err) {
    console.error("Test email error:", err);
    return serverError();
  }
}

async function handleAdminListUsers(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const admin = await requireAuth(request, env);
    if (!admin || !hasAccess(admin.role, 'Manager')) {
      return jsonResponse({ error: "Forbidden: Manager access required" }, 403);
    }

    const body = (await request.json()) as Record<string, unknown> | null;
    const includeSuspended = body && typeof body.includeSuspended === "boolean" ? body.includeSuspended : false;

    const query = includeSuspended
      ? "SELECT id, email, full_name, telephone, role, branch, assignment, is_verified, is_suspended, suspended_at, created_at FROM users ORDER BY created_at DESC"
      : "SELECT id, email, full_name, telephone, role, branch, assignment, is_verified, created_at FROM users WHERE is_suspended = 0 ORDER BY created_at DESC";

    const users = await env.DB.prepare(query).all<Record<string, unknown>>();

    const safeUsers = (users.results || []).map((u) => {
      const camel = toCamelCase(u) as Record<string, unknown>;
      const { password, ...safe } = camel;
      return safe;
    });

    return jsonResponse({ users: safeUsers }, 200);
  } catch (err) {
    console.error("List users error:", err);
    return serverError();
  }
}

async function handleAdminSearch(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const admin = await requireAuth(request, env);
    if (!admin || !hasAccess(admin.role, 'Manager')) {
      return jsonResponse({ error: "Forbidden: Manager access required" }, 403);
    }

    const url = new URL(request.url);
    const query = url.searchParams.get("q")?.trim() ?? "";
    const type = url.searchParams.get("type") || "all";

    if (!query || query.length < 2) {
      return badRequest("Search query must be at least 2 characters");
    }

    const results: Record<string, unknown[]> = {
      customers: [],
      loans: [],
      users: [],
    };

    const searchPattern = `%${query}%`;

    if (type === "all" || type === "customers") {
      const customers = await env.DB.prepare(
        `SELECT id, customer_type, name, phone, id_number, county, subcounty, ward, credit_officer, created_at
         FROM customers
         WHERE name LIKE ? OR id_number LIKE ? OR county LIKE ? OR phone LIKE ?
         ORDER BY created_at DESC
         LIMIT 20`
      ).bind(searchPattern, searchPattern, searchPattern, searchPattern).all<Record<string, unknown>>();
      results.customers = customers.results || [];
    }

    if (type === "all" || type === "loans") {
      const loans = await env.DB.prepare(
        `SELECT l.id, l.loan_number, l.customer_name, l.principal, l.total, l.status, l.applied_date, l.credit_officer,
                 u.full_name as user_name, u.telephone
         FROM loans l
         LEFT JOIN users u ON l.user_id = u.id
         WHERE l.loan_number LIKE ? OR l.customer_name LIKE ? OR l.id LIKE ?
         ORDER BY l.created_at DESC
         LIMIT 20`
      ).bind(searchPattern, searchPattern, searchPattern).all<Record<string, unknown>>();
      results.loans = loans.results || [];
    }

    if (type === "all" || type === "users") {
      const users = await env.DB.prepare(
        `SELECT id, full_name, email, telephone, role, branch, assignment, created_at
         FROM users
         WHERE full_name LIKE ? OR email LIKE ? OR telephone LIKE ? OR id_number LIKE ?
         ORDER BY created_at DESC
         LIMIT 20`
      ).bind(searchPattern, searchPattern, searchPattern, searchPattern).all<Record<string, unknown>>();
      results.users = users.results || [];
    }

    await logAudit(env, "admin.search", admin.id, admin.email, "search", undefined, { query, type, results: JSON.stringify(results) }, requestIp(request));

    return jsonResponse({ query, results, total: results.customers.length + results.loans.length + results.users.length }, 200);
  } catch (err) {
    console.error("Search error:", err);
    return serverError();
  }
}

// ──── OTP Handlers ───────────────────────────────────────────────────────────

async function handleOtpSend(request: Request, env: Env): Promise<Response> {
  try {
    const ip = requestIp(request);
    if (!(await checkRateLimit(env, `otp:${ip || "unknown"}`, 5, 600))) {
      return jsonResponse({ error: "Too many OTP requests. Try again in 10 minutes." }, 429);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const purpose = typeof body.purpose === "string" ? body.purpose.trim() : "login";

    if (!phone && !email) {
      return badRequest("Phone or email is required");
    }

    const code = generateOtp();
    const codeHash = await hashOtp(code);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const id = generateId();

    await env.DB.prepare(
      `INSERT INTO otp_codes (id, phone, email, code_hash, purpose, attempts, attempts_max, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 5, ?, ?)`
    )
      .bind(id, phone || null, email || null, codeHash, purpose, expiresAt, new Date().toISOString())
      .run();

    const target = phone || email;

    if (phone) {
      const formatted = formatPhone(phone);
      const smsResult = await sendSmsOtp(env, formatted, code);
      if (!smsResult.success) {
        console.error(`[OTP] SMS failed for ${formatted}: ${smsResult.error}`);
      }
    }

    if (email) {
      const emailResult = await sendOtpEmail(env, email, code);
      if (!emailResult.success) {
        console.error(`[OTP] Email failed for ${email}: ${emailResult.error}`);
      }
    }

    console.log(`[OTP] To: ${target} | Purpose: ${purpose} | Expires: ${expiresAt}`);

    await logAudit(env, "otp.sent", undefined, target, "otp", id, { purpose, phone: phone || undefined, email: email || undefined }, ip);

    return jsonResponse({
      message: "OTP sent successfully",
      expiresIn: 300,
      debugTarget: target,
    }, 200);
  } catch (err) {
    console.error("OTP send error:", err);
    return serverError("Failed to send OTP");
  }
}

async function handleOtpVerify(request: Request, env: Env): Promise<Response> {
  try {
    const ip = requestIp(request);
    if (!(await checkRateLimit(env, `otp-verify:${ip || "unknown"}`, 5, 600))) {
      return jsonResponse({ error: "Too many verification attempts. Try again after 10 minutes." }, 429);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const purpose = typeof body.purpose === "string" ? body.purpose.trim() : "";

    if (!code || (!phone && !email)) {
      return badRequest("Code and phone/email are required");
    }

    const query = phone
      ? "SELECT * FROM otp_codes WHERE phone = ? AND purpose = ? AND used = 0 ORDER BY created_at DESC LIMIT 1"
      : "SELECT * FROM otp_codes WHERE email = ? AND purpose = ? AND used = 0 ORDER BY created_at DESC LIMIT 1";

    const result = await env.DB.prepare(query)
      .bind(phone || email, purpose)
      .first<Record<string, unknown>>();

    if (!result) {
      return badRequest("Invalid or expired OTP");
    }

    const expiresAt = new Date(result.expires_at as string);
    if (expiresAt < new Date()) {
      return badRequest("OTP has expired");
    }

    const attempts = (result.attempts as number) || 0;
    const attemptsMax = (result.attempts_max as number) || 5;

    if (attempts >= attemptsMax) {
      await env.DB.prepare("UPDATE otp_codes SET used = 1 WHERE id = ?").bind(result.id).run();
      await logAudit(env, "otp.verify_failed_max", undefined, phone || email, "otp", result.id as string, { reason: "max_attempts_exceeded" }, requestIp(request));
      return badRequest("Maximum verification attempts exceeded. Please request a new OTP.");
    }

    const codeHash = result.code_hash as string;
    const isValid = await verifyOtpCode(code, codeHash);

    if (!isValid) {
      const newAttempts = attempts + 1;
      await env.DB.prepare("UPDATE otp_codes SET attempts = ? WHERE id = ?").bind(newAttempts, result.id).run();
      await logAudit(env, "otp.verify_failed", undefined, phone || email, "otp", result.id as string, { reason: "invalid_code", attempt: newAttempts }, requestIp(request));
      return badRequest(`Invalid OTP. ${attemptsMax - newAttempts} attempt(s) remaining.`);
    }

    await env.DB.prepare("UPDATE otp_codes SET used = 1 WHERE id = ?").bind(result.id).run();

    const target = phone || email;
    await logAudit(env, "otp.verified", undefined, target, "otp", result.id as string, { purpose }, requestIp(request));

    return jsonResponse({ verified: true, message: "OTP verified successfully" }, 200);
  } catch (err) {
    console.error("OTP verify error:", err);
    return serverError("Failed to verify OTP");
  }
}

async function handleOtpResend(request: Request, env: Env): Promise<Response> {
  try {
    const ip = requestIp(request);
    if (!(await checkRateLimit(env, `otp:${ip || "unknown"}`, 5, 600))) {
      return jsonResponse({ error: "Too many OTP requests. Try again in 10 minutes." }, 429);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const purpose = typeof body.purpose === "string" ? body.purpose.trim() : "";

    if (!phone && !email) {
      return badRequest("Phone or email is required");
    }

    const existing = phone
      ? await env.DB.prepare("SELECT * FROM otp_codes WHERE phone = ? AND purpose = ? AND used = 0 ORDER BY created_at DESC LIMIT 1").bind(phone, purpose).first<Record<string, unknown>>()
      : await env.DB.prepare("SELECT * FROM otp_codes WHERE email = ? AND purpose = ? AND used = 0 ORDER BY created_at DESC LIMIT 1").bind(email, purpose).first<Record<string, unknown>>();

    if (existing) {
      const createdAt = new Date(existing.created_at as string);
      const oneMinuteAgo = new Date(Date.now() - 60 * 1000);
      if (createdAt > oneMinuteAgo) {
        return jsonResponse({ error: "Please wait 60 seconds before requesting a new OTP" }, 429);
      }
    }

    const code = generateOtp();
    const codeHash = await hashOtp(code);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const id = generateId();

    await env.DB.prepare(
      `INSERT INTO otp_codes (id, phone, email, code_hash, purpose, attempts, attempts_max, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 5, ?, ?)`
    )
      .bind(id, phone || null, email || null, codeHash, purpose, expiresAt, new Date().toISOString())
      .run();

    const target = phone || email;

    if (phone) {
      const formatted = formatPhone(phone);
      await sendSmsOtp(env, formatted, code);
    }

    if (email) {
      await sendOtpEmail(env, email, code);
    }

    console.log(`[OTP RESEND] To: ${target} | Purpose: ${purpose} | Expires: ${expiresAt}`);

    await logAudit(env, "otp.resent", undefined, target, "otp", id, { purpose }, ip);

    return jsonResponse({
      message: "OTP resent successfully",
      expiresIn: 300,
      debugTarget: target,
    }, 200);
  } catch (err) {
    console.error("OTP resend error:", err);
    return serverError("Failed to resend OTP");
  }
}

// ──── Password Reset Handlers ────────────────────────────────────────────────

async function handleForgotPassword(request: Request, env: Env): Promise<Response> {
  try {
    const ip = requestIp(request);
    if (!(await checkRateLimit(env, `forgot-password:${ip || "unknown"}`, 5, 600))) {
      return jsonResponse({ error: "Too many requests. Try again in 10 minutes." }, 429);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!phone && !email) {
      return badRequest("Phone or email is required");
    }

    const target = phone || email;
    const user = phone
      ? await env.DB.prepare("SELECT * FROM users WHERE telephone = ? OR telephone = ?").bind(phone, formatPhone(phone)).first<Record<string, unknown>>()
      : await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<Record<string, unknown>>();

    if (!user) {
      return badRequest("No account found with this phone/email");
    }

    const code = generateOtp();
    const codeHash = await hashOtp(code);
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
    const id = generateId();

    await env.DB.prepare(
      `INSERT INTO otp_codes (id, phone, email, code_hash, purpose, attempts, attempts_max, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?, 0, 5, ?, ?)`
    )
      .bind(id, phone || null, email || null, codeHash, "reset", expiresAt, new Date().toISOString())
      .run();

    if (phone) {
      const formatted = formatPhone(phone);
      await sendSmsOtp(env, formatted, code);
    }

    if (email) {
      await sendOtpEmail(env, email, code);
    }

    console.log(`[PASSWORD RESET] To: ${target} | Expires: ${expiresAt}`);

    await logAudit(env, "auth.forgot_password", (user as any).id, (user as any).email, "user", (user as any).id, { phone: phone || undefined, email: email || undefined }, ip);

    return jsonResponse({
      message: "Password reset OTP sent successfully",
      expiresIn: 300,
      debugTarget: target,
    }, 200);
  } catch (err) {
    console.error("Forgot password error:", err);
    return serverError("Failed to send password reset OTP");
  }
}

async function handleResetPassword(request: Request, env: Env): Promise<Response> {
  try {
    const ip = requestIp(request);
    if (!(await checkRateLimit(env, `reset-password:${ip || "unknown"}`, 5, 600))) {
      return jsonResponse({ error: "Too many attempts. Try again in 10 minutes." }, 429);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const code = typeof body.code === "string" ? body.code.trim() : "";
    const newPassword = typeof body.newPassword === "string" ? body.newPassword.trim() : "";

    if (!code || (!phone && !email) || !newPassword) {
      return badRequest("Code, phone/email, and new password are required");
    }

    if (newPassword.length < 6) {
      return badRequest("Password must be at least 6 characters");
    }

    const target = phone || email;
    const result = await env.DB.prepare(
      phone
        ? "SELECT * FROM otp_codes WHERE phone = ? AND purpose = 'reset' AND used = 0 ORDER BY created_at DESC LIMIT 1"
        : "SELECT * FROM otp_codes WHERE email = ? AND purpose = 'reset' AND used = 0 ORDER BY created_at DESC LIMIT 1"
    )
      .bind(target)
      .first<Record<string, unknown>>();

    if (!result) {
      return badRequest("Invalid or expired OTP");
    }

    const expiresAt = new Date(result.expires_at as string);
    if (expiresAt < new Date()) {
      return badRequest("OTP has expired");
    }

    const attempts = (result.attempts as number) || 0;
    const attemptsMax = (result.attempts_max as number) || 5;

    if (attempts >= attemptsMax) {
      await env.DB.prepare("UPDATE otp_codes SET used = 1 WHERE id = ?").bind(result.id).run();
      return badRequest("Maximum verification attempts exceeded. Please request a new OTP.");
    }

    const codeHash = result.code_hash as string;
    const isValid = await verifyOtpCode(code, codeHash);

    if (!isValid) {
      const newAttempts = attempts + 1;
      await env.DB.prepare("UPDATE otp_codes SET attempts = ? WHERE id = ?").bind(newAttempts, result.id).run();
      return badRequest(`Invalid OTP. ${attemptsMax - newAttempts} attempt(s) remaining.`);
    }

    await env.DB.prepare("UPDATE otp_codes SET used = 1 WHERE id = ?").bind(result.id).run();

    const passwordHash = await hashPassword(newPassword);
    const user = phone
      ? await env.DB.prepare("SELECT * FROM users WHERE telephone = ? OR telephone = ?").bind(phone, formatPhone(phone)).first<Record<string, unknown>>()
      : await env.DB.prepare("SELECT * FROM users WHERE email = ?").bind(email).first<Record<string, unknown>>();

    if (!user) {
      return badRequest("User not found");
    }

    await env.DB.prepare("UPDATE users SET password = ? WHERE id = ?").bind(passwordHash, (user as any).id).run();

    await logAudit(env, "auth.password_reset", (user as any).id, (user as any).email, "user", (user as any).id, { phone: phone || undefined, email: email || undefined }, ip);

    return jsonResponse({ message: "Password reset successfully" }, 200);
  } catch (err) {
    console.error("Reset password error:", err);
    return serverError("Failed to reset password");
  }
}

// ──── Profile Handlers ───────────────────────────────────────────────────────

async function handleUpdateProfile(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const user = await requireAuth(request, env);
    if (!user) {
      return unauthorized();
    }

    const isSuspended = (user as any).isSuspended === 1;
    if (isSuspended) {
      return jsonResponse({ error: "Your account has been suspended. Please contact support.", suspended: true }, 403);
    }

    const contentType = request.headers.get("content-type") ?? "";
    let updates: Record<string, unknown>;
    let snakeUpdates: Record<string, unknown>;
    let profilePhotoUrl: string | undefined;

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      updates = {};
      snakeUpdates = {};

      if (typeof formData.get("fullName") === "string") {
        updates.fullName = (formData.get("fullName") as string).trim();
        snakeUpdates.full_name = updates.fullName;
      }
      if (typeof formData.get("email") === "string") {
        updates.email = (formData.get("email") as string).trim().toLowerCase();
        snakeUpdates.email = updates.email;
      }
      if (typeof formData.get("branch") === "string") {
        updates.branch = (formData.get("branch") as string).trim();
        snakeUpdates.branch = updates.branch;
      }
      if (typeof formData.get("assignment") === "string") {
        updates.assignment = (formData.get("assignment") as string).trim();
        snakeUpdates.assignment = updates.assignment;
      }

      const profilePhotoFile = formData.get("profilePhoto") as File | null;
      if (profilePhotoFile && profilePhotoFile instanceof Blob) {
        const key = generateFileKey("profile-photos", user.id, (profilePhotoFile as File).name);
        await uploadFile(env.R2, key, profilePhotoFile, profilePhotoFile.type || "image/jpeg");
        const publicUrl = `${new URL(request.url).origin}/api/files/${key}`;
        updates.photoUrl = publicUrl;
        snakeUpdates.photo_url = publicUrl;
      }
    } else {
      const body = (await request.json()) as Record<string, unknown>;
      updates = {};
      snakeUpdates = {};

      const allowedFields = ["fullName", "email", "branch", "assignment"];
      for (const field of allowedFields) {
        if (field in body) {
          let value = body[field];
          if (typeof value === "string") {
            value = value.trim();
          }
          if (field === "email") {
            value = (value as string).toLowerCase();
          }
          updates[field] = value;
          snakeUpdates[field === "fullName" ? "full_name" : field] = value;
        }
      }

      if (typeof body.profilePhotoUrl === "string") {
        // Ignore profilePhotoUrl - photos are uploaded via multipart only
      }
    }

    if (!updates.fullName || !updates.email) {
      return badRequest("Full name and email are required");
    }

    if (updates.email !== user.email) {
      const existing = await getUserByEmail(env, updates.email as string);
      if (existing && existing.id !== user.id) {
        return badRequest("Email is already in use by another account");
      }
    }

    const setClauses = Object.keys(snakeUpdates).map(key => `${key} = ?`).join(", ");
    const values = Object.values(snakeUpdates);
    values.push(user.id);

    await env.DB.prepare(`UPDATE users SET ${setClauses} WHERE id = ?`).bind(...values).run();

    const updated = await getUserById(env, user.id);
    if (!updated) {
      return serverError("Failed to fetch updated profile");
    }

    const { password: _, ...safeUser } = updated;
    await logAudit(env, "user.profile_updated", user.id, user.email, "user", user.id, updates as Record<string, unknown>, requestIp(request));

    return jsonResponse({ user: safeUser }, 200);
  } catch (err) {
    console.error("Update profile error:", err);
    return serverError();
  }
}

async function handleDeleteAccount(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const user = await requireAuth(request, env);
    if (!user) {
      return unauthorized();
    }

    const body = (await request.json()) as Record<string, unknown>;
    const password = typeof body.password === "string" ? body.password : "";

    if (!password) {
      return badRequest("Password confirmation is required");
    }

    if (!(await verifyPassword(password, user.password))) {
      await logAudit(env, "user.delete_failed", user.id, user.email, "user", user.id, { reason: "invalid_password" }, requestIp(request));
      return badRequest("Incorrect password");
    }

    if (user.email === "demo@example.com" || user.email === "admin@example.com" || user.email === "owner@example.com") {
      return jsonResponse({ error: "The demo account cannot be deleted" }, 400);
    }

    const activeLoans = await env.DB.prepare(
      "SELECT id, principal, total, status FROM loans WHERE user_id = ? AND status IN ('pending', 'disbursed', 'under_review')"
    ).bind(user.id).all<Record<string, unknown>>();

    const loanResults = activeLoans.results || [];
    if (loanResults.length > 0) {
      const totalOutstanding = loanResults.reduce((sum: number, loan: Record<string, unknown>) => {
        const principal = Number(loan.principal) || 0;
        const total = Number(loan.total) || 0;
        return sum + (total - principal);
      }, 0);

      const loanNumbers = loanResults.map((l: Record<string, unknown>) => l.loan_number || 'N/A').join(', ');
      return jsonResponse({
        error: "Account deletion is not allowed while you have active financial obligations.",
        hasActiveLoans: true,
        activeLoanCount: loanResults.length,
        outstandingBalance: totalOutstanding,
        loanNumbers: loanNumbers,
      }, 409);
    }

    const activeMpesa = await env.DB.prepare(
      "SELECT COUNT(*) as count FROM mpesa_payments WHERE phone = ? AND status = 'pending'"
    ).bind(user.telephone).first<{ count: number }>();

    if (activeMpesa && activeMpesa.count > 0) {
      return jsonResponse({ error: "Cannot delete account with pending M-Pesa transactions. Please wait for them to complete or contact support." }, 400);
    }

    await env.DB.prepare("UPDATE users SET is_active = 0 WHERE id = ?").bind(user.id).run();

    await logAudit(env, "user.deleted", user.id, user.email, "user", user.id, { email: user.email, role: user.role }, requestIp(request));

    return jsonResponse({ message: "Account deactivated successfully" }, 200);
  } catch (err) {
    console.error("Delete account error:", err);
    return serverError();
  }
}

// ──── Qualification Handlers ─────────────────────────────────────────────────

async function handleQualification(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const user = await requireAuth(request, env);
    if (!user) {
      return unauthorized();
    }

    const body = (await request.json()) as Record<string, unknown>;
    const customerType = typeof body.customerType === "string" ? body.customerType : "";
    const educationLevel = typeof body.educationLevel === "string" ? body.educationLevel : "";
    const employmentStatus = typeof body.employmentStatus === "string" ? body.employmentStatus : "";
    const monthlyIncome = typeof body.monthlyIncome === "number" ? body.monthlyIncome : 0;
    const hasExistingLoans = typeof body.hasExistingLoans === "boolean" ? body.hasExistingLoans : false;
    const existingLoanDetails = typeof body.existingLoanDetails === "string" ? body.existingLoanDetails.trim() : "";
    const collateralAvailable = typeof body.collateralAvailable === "boolean" ? body.collateralAvailable : false;
    const businessType = typeof body.businessType === "string" ? body.businessType.trim() : "";
    const chamaName = typeof body.chamaName === "string" ? body.chamaName.trim() : "";
    const yearsInBusiness = typeof body.yearsInBusiness === "number" ? body.yearsInBusiness : 0;

    if (!customerType || !educationLevel || !employmentStatus || !monthlyIncome) {
      return badRequest("All required fields must be provided");
    }

    const existing = await env.DB.prepare("SELECT * FROM qualification_answers WHERE user_id = ?").bind(token).first<Record<string, unknown>>();

    if (existing) {
      await env.DB.prepare(
        `UPDATE qualification_answers SET customer_type = ?, education_level = ?, employment_status = ?, monthly_income = ?, has_existing_loans = ?, existing_loan_details = ?, collateral_available = ?, business_type = ?, chama_name = ?, years_in_business = ?, updated_at = ? WHERE user_id = ?`
      )
        .bind(
          customerType,
          educationLevel,
          employmentStatus,
          monthlyIncome,
          hasExistingLoans ? 1 : 0,
          existingLoanDetails || null,
          collateralAvailable ? 1 : 0,
          businessType || null,
          chamaName || null,
          yearsInBusiness,
          new Date().toISOString(),
          token
        )
        .run();
    } else {
      await env.DB.prepare(
        `INSERT INTO qualification_answers (id, user_id, customer_type, education_level, employment_status, monthly_income, has_existing_loans, existing_loan_details, collateral_available, business_type, chama_name, years_in_business, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          generateId(),
          token,
          customerType,
          educationLevel,
          employmentStatus,
          monthlyIncome,
          hasExistingLoans ? 1 : 0,
          existingLoanDetails || null,
          collateralAvailable ? 1 : 0,
          businessType || null,
          chamaName || null,
          yearsInBusiness,
          new Date().toISOString(),
          new Date().toISOString()
        )
        .run();
    }

    const qualification = checkQualificationLogic({ customerType, educationLevel, employmentStatus, monthlyIncome, hasExistingLoans, existingLoanDetails, collateralAvailable, businessType, chamaName, yearsInBusiness });

    await logAudit(env, "qualification.submitted", user.id, user.email, "qualification", token, { ...qualification, customerType }, requestIp(request));

    return jsonResponse({ ...qualification, message: "Qualification saved successfully" }, 200);
  } catch (err) {
    console.error("Qualification error:", err);
    return serverError();
  }
}

async function handleGetQualification(env: Env, token: string): Promise<Response> {
  if (!token) {
    return unauthorized();
  }
  try {
    const result = await env.DB.prepare("SELECT * FROM qualification_answers WHERE user_id = ?").bind(token).first<Record<string, unknown>>();
    if (!result) {
      return jsonResponse({ exists: false }, 200);
    }
    return jsonResponse({ exists: true, ...toCamelCase(result) }, 200);
  } catch {
    return serverError();
  }
}

function checkQualificationLogic(data: {
  customerType: string;
  educationLevel: string;
  employmentStatus: string;
  monthlyIncome: number;
  hasExistingLoans: boolean;
  existingLoanDetails: string;
  collateralAvailable: boolean;
  businessType: string;
  chamaName: string;
  yearsInBusiness: number;
}): { qualifies: boolean; reason: string; recommendedLoanAmount: number } {
  if (!data.employmentStatus || (data.employmentStatus !== "Employed" && data.employmentStatus !== "Self-Employed" && data.employmentStatus !== "Business Owner")) {
    return { qualifies: false, reason: "You must be employed or own a business to qualify", recommendedLoanAmount: 0 };
  }

  if (data.monthlyIncome < 10000) {
    return { qualifies: false, reason: "Minimum monthly income required is Ksh 10,000", recommendedLoanAmount: 0 };
  }

  if (data.hasExistingLoans && data.existingLoanDetails) {
    const existingBalance = parseFloat(data.existingLoanDetails) || 0;
    if (existingBalance > data.monthlyIncome * 0.5) {
      return { qualifies: false, reason: "Existing loan balance exceeds 50% of your monthly income", recommendedLoanAmount: 0 };
    }
  }

  if (!data.collateralAvailable) {
    return { qualifies: false, reason: "Collateral or guarantor is required for loan qualification", recommendedLoanAmount: 0 };
  }

  const recommended = Math.min(data.monthlyIncome * 4, 200000);
  return { qualifies: true, reason: "You qualify for a loan", recommendedLoanAmount: Math.round(recommended) };
}

async function handleKycVerify(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const user = await requireAuth(request, env);
    if (!user) {
      return unauthorized();
    }

    const isSuspended = user.isSuspended === 1;
    if (isSuspended) {
      return jsonResponse({ error: "Your account has been suspended.", suspended: true }, 403);
    }

    const contentType = request.headers.get("content-type") ?? "";
    let idNumber: string;
    let selfieKey: string = "";
    let idPhotoKey: string = "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await request.formData();
      idNumber = typeof formData.get("idNumber") === "string" ? (formData.get("idNumber") as string).trim() : "";
      const selfieFile = formData.get("selfie") as File | null;
      const idPhotoFile = formData.get("idPhoto") as File | null;

      if (selfieFile && selfieFile instanceof Blob) {
        selfieKey = generateFileKey("id-photos", user.id, (selfieFile as File).name);
        await uploadFile(env.R2, selfieKey, selfieFile, selfieFile.type || "image/jpeg");
      }

      if (idPhotoFile && idPhotoFile instanceof Blob) {
        idPhotoKey = generateFileKey("id-photos", user.id, (idPhotoFile as File).name);
        await uploadFile(env.R2, idPhotoKey, idPhotoFile, idPhotoFile.type || "image/jpeg");
      }

      if (!idNumber) {
        return badRequest("ID number is required");
      }
    } else {
      const body = (await request.json()) as Record<string, unknown>;
      idNumber = typeof body.idNumber === "string" ? body.idNumber.trim() : "";
      // Legacy URL-based approach - still upload to R2 for backward compat
      const selfieUrl = typeof body.selfieUrl === "string" ? body.selfieUrl.trim() : "";
      const idPhotoUrl = typeof body.idPhotoUrl === "string" ? body.idPhotoUrl.trim() : "";

      if (!idNumber) {
        return badRequest("ID number is required");
      }
    }

    await env.DB.prepare(
      `UPDATE users SET id_number = ?, is_verified = 0 WHERE id = ?`
    )
      .bind(idNumber, user.id)
      .run();

    await logAudit(env, "kyc.submitted", user.id, user.email, "user", user.id, { idNumber, hasSelfie: !!selfieKey, hasIdPhoto: !!idPhotoKey }, requestIp(request));

    return jsonResponse({ message: "KYC information submitted for verification", isVerified: false }, 200);
  } catch (err) {
    console.error("KYC verify error:", err);
    return serverError();
  }
}

async function handleKycStatus(request: Request, env: Env, token: string): Promise<Response> {
  if (!token) {
    return unauthorized();
  }
  try {
    const user = await requireAuth(request, env);
    if (!user) {
      return unauthorized();
    }
    // Check R2 for uploaded files
    const [selfieList, idPhotoList] = await Promise.all([
      env.R2.list({ prefix: `id-photos/${user.id}/` }),
      env.R2.list({ prefix: `id-photos/${user.id}/` }),
    ]);
    const selfieUrl = selfieList.objects.length > 0 
      ? `/api/files/${encodeURIComponent(selfieList.objects[0].key)}`
      : "";
    const idPhotoUrl = idPhotoList.objects.length > 0
      ? `/api/files/${encodeURIComponent(idPhotoList.objects[0].key)}`
      : "";
    return jsonResponse({
      isVerified: user.isVerified === 1,
      idNumber: user.idNumber || "",
      hasSelfie: !!selfieUrl,
      hasIdPhoto: !!idPhotoUrl,
      selfieUrl,
      idPhotoUrl,
    }, 200);
  } catch {
    return serverError();
  }
}

// ──── File Handlers ─────────────────────────────────────────

async function handleListUsers(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const user = await requireAuth(request, env);
    if (!user) return unauthorized();
    if (!hasAccess(user.role, 'Officer')) {
      return jsonResponse({ error: "Insufficient permissions" }, 403);
    }

    const reqUrl = new URL(request.url);
    const cursor = reqUrl.searchParams.get("cursor") ?? "";
    const maxCreatedAt = cursor || new Date(Date.now() + 86400000).toISOString();
    const limit = 200;

    const rows = await env.DB.prepare(
      "SELECT * FROM users WHERE is_active = 1 AND created_at < ? ORDER BY created_at DESC LIMIT ?"
    ).bind(maxCreatedAt, limit).all<Record<string, unknown>>();

    const nextCursor = rows.results.length > 0 ? rows.results[rows.results.length - 1]?.created_at ?? "" : "";
    const users = (rows.results || []).map((r) => {
      const { password, ...safe } = toCamelCase(r);
      return safe;
    });

    return jsonResponse({ users, nextCursor }, 200);
  } catch (err) {
    console.error("List users error:", err);
    return serverError();
  }
}

async function handleFileUpload(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const user = await requireAuth(request, env);
    if (!user) {
      return unauthorized();
    }

    const isSuspended = user.isSuspended === 1;
    if (isSuspended) {
      return jsonResponse({ error: "Your account has been suspended.", suspended: true }, 403);
    }

    const contentType = request.headers.get("content-type") ?? "";
    if (!contentType.includes("multipart/form-data")) {
      return badRequest("Request must be multipart/form-data");
    }

    const formData = await request.formData();
    const file = formData.get("file");
    const purpose = typeof formData.get("purpose") === "string" ? formData.get("purpose") : "";

    if (!file || typeof file !== "object") {
      return badRequest("No file provided");
    }

    const fileBlob = file as File;

    const purposeMap: Record<string, string> = {
      idPhoto: "id-photos",
      profilePhoto: "profile-photos",
      report: "reports",
      auditLog: "exports",
    };

    const prefix = purposeMap[purpose as string] ?? "uploads";
    const key = generateFileKey(prefix, user.id, fileBlob.name);
    await uploadFile(env.R2, key, fileBlob, fileBlob.type || "application/octet-stream");

    await env.DB.prepare(
      `INSERT INTO files (id, key, type, owner_id, created_at)
       VALUES (?, ?, ?, ?, ?)`
    ).bind(generateId(), key, purpose || "upload", user.id, new Date().toISOString()).run();

    await logAudit(env, "file.uploaded", user.id, user.email, "file", key, { purpose, fileName: fileBlob.name, size: fileBlob.size }, requestIp(request));

    return jsonResponse({ key, purpose, size: fileBlob.size }, 201);
  } catch (err) {
    console.error("File upload error:", err);
    return serverError();
  }
}

async function handleFileDownload(request: Request, env: Env, key: string): Promise<Response> {
  try {
    const token = getBearerToken(request);
    if (!token) return unauthorized();
    const user = await requireAuth(request, env);
    if (!user) return unauthorized();

    const prefix = getFilePrefix(key);

    if (prefix === "reports" || prefix === "exports") {
      if (!hasAccess(user.role, 'Supervisor')) {
        return jsonResponse({ error: "Insufficient permissions" }, 403);
      }
    } else if (prefix === "id-photos" || prefix === "profile-photos" || prefix === "uploads") {
      if (!canAccessFile(user.role, key, user.id)) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }
    } else if (prefix === "loans" || prefix === "customers") {
      if (!canAccessFile(user.role, key, user.id)) {
        return jsonResponse({ error: "Forbidden" }, 403);
      }
    }

    return await getFile(env.R2, key);
  } catch (err) {
    console.error("File download error:", err);
    return serverError();
  }
}

async function handleMonthlyReports(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const user = await requireAuth(request, env);
    if (!user) {
      return unauthorized();
    }

    if (!hasAccess(user.role, 'Supervisor')) {
      return jsonResponse({ error: "Insufficient permissions" }, 403);
    }

    const reqUrl = new URL(request.url);
    const month = reqUrl.searchParams.get("month") ?? new Date().toISOString().slice(0, 7);
    const cursor = reqUrl.searchParams.get("cursor") ?? "";

    const maxCreatedAt = cursor || new Date(Date.now() + 86400000).toISOString();
    const limit = 200;

    const loans = await env.DB.prepare(
      "SELECT * FROM loans WHERE strftime('%Y-%m', created_at) = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?"
    ).bind(month, maxCreatedAt, limit).all<Record<string, unknown>>();

    const transactions = await env.DB.prepare(
      "SELECT * FROM transactions WHERE strftime('%Y-%m', created_at) = ? AND created_at < ? ORDER BY created_at DESC LIMIT ?"
    ).bind(month, maxCreatedAt, limit).all<Record<string, unknown>>();

    const nextCursor = (loans.results.length > 0 || transactions.results.length > 0)
      ? loans.results[loans.results.length - 1]?.created_at ?? transactions.results[transactions.results.length - 1]?.created_at ?? ""
      : "";

    const totalLoans = loans.results.length;
    const totalDisbursed = transactions.results
      .filter((t: Record<string, unknown>) => t.type === "loan" && t.status === "success")
      .reduce((sum: number, t: Record<string, unknown>) => sum + (Number(t.amount) || 0), 0);
    const totalRepaid = transactions.results
      .filter((t: Record<string, unknown>) => t.type === "repayment" && t.status === "success")
      .reduce((sum: number, t: Record<string, unknown>) => sum + (Number(t.amount) || 0), 0);
    const totalPenalties = transactions.results
      .filter((t: Record<string, unknown>) => t.type === "penalty" && t.status === "success")
      .reduce((sum: number, t: Record<string, unknown>) => sum + (Number(t.amount) || 0), 0);

    const report = {
      month,
      nextCursor,
      totalLoans,
      totalDisbursed,
      totalRepaid,
      totalPenalties,
      outstandingBalance: totalDisbursed - totalRepaid,
      loans: loans.results,
      transactions: transactions.results,
    };

    await logAudit(env, "report.monthly_viewed", user.id, user.email, "report", month, {}, requestIp(request));

    const url = new URL(request.url);
    const format = url.searchParams.get("format") ?? "json";

    if (format === "csv") {
      const header = "Month,Total Loans,Total Disbursed,Total Repaid,Total Penalties,Outstanding Balance\n";
      const row = `${month},${totalLoans},${totalDisbursed},${totalRepaid},${totalPenalties},${(totalDisbursed - totalRepaid).toFixed(2)}\n`;
      const csv = header + row;

      const key = `reports/monthly/${month}.csv`;
      await storeReport(env.R2, key, csv, "text/csv");

      await env.DB.prepare(
        `INSERT INTO files (id, key, type, owner_id, created_at)
         VALUES (?, ?, ?, ?, ?)`
      ).bind(generateId(), key, "report", user.id, new Date().toISOString()).run();

      return new Response(csv, {
        headers: {
          "Content-Type": "text/csv",
          "Content-Disposition": `attachment; filename=monthly-report-${month}.csv`,
        },
      });
    }

    return jsonResponse(report, 200);
  } catch (err) {
    console.error("Monthly reports error:", err);
    return serverError();
  }
}

async function handleAuditLogs(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const user = await requireAuth(request, env);
    if (!user) {
      return unauthorized();
    }

    if (!hasAccess(user.role, 'Manager')) {
      return jsonResponse({ error: "Insufficient permissions" }, 403);
    }

    const reqUrl = new URL(request.url);
    const limit = Math.min(Number(reqUrl.searchParams.get("limit")) || 50, 200);
    const cursor = reqUrl.searchParams.get("cursor") ?? "";
    const action = reqUrl.searchParams.get("action") ?? "";

    let query = "SELECT * FROM audit_logs";
    const params: unknown[] = [];

    if (action) {
      query += " WHERE action = ?";
      params.push(action);
    }

    const maxCreatedAt = cursor || new Date(Date.now() + 86400000).toISOString();
    query += ` AND created_at < ? ORDER BY created_at DESC LIMIT ?`;
    params.push(maxCreatedAt, limit);

    const rows = await env.DB.prepare(query).bind(...params).all<Record<string, unknown>>();

    const nextCursor = rows.results.length > 0 ? rows.results[rows.results.length - 1]?.created_at ?? "" : "";
    return jsonResponse({ logs: rows.results, nextCursor, limit }, 200);
  } catch (err) {
    console.error("Audit logs error:", err);
    return serverError();
  }
}

// ──── M-Pesa Handlers ────────────────────────────────────────────────

async function handleMpesaStk(request: Request, env: Env): Promise<Response> {
  try {
    const ip = requestIp(request);
    if (!(await checkRateLimit(env, `mpesa:${ip || "unknown"}`, 10, 60))) {
      return jsonResponse({ error: "Too many M-Pesa requests. Try again later." }, 429);
    }

    const body = (await request.json()) as Record<string, unknown>;
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const amount = Number(body.amount);
    const reference = typeof body.reference === "string" ? body.reference.trim() : undefined;
    const description = typeof body.description === "string" ? body.description.trim() : undefined;

    if (!phone || !amount || amount <= 0) {
      return badRequest("Valid phone and amount are required");
    }

    if (amount > 150000) {
      return badRequest("Amount exceeds maximum allowed (Ksh 150,000)");
    }

    const normalizedPhone = normalizePhone(phone);
    if (!/^254\d{9}$/.test(normalizedPhone)) {
      return badRequest("Invalid phone number format. Must be a Kenyan mobile number (e.g., 07XXXXXXXX, +2547XXXXXXXX, 2547XXXXXXXX).");
    }

    const idempotencyKey = `${normalizedPhone}:${amount}:${reference || "none"}`;
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    const recentPayment = await env.DB.prepare(
      "SELECT * FROM mpesa_payments WHERE phone = ? AND amount = ? AND reference = ? AND created_at > ? AND status = 'pending'"
    )
      .bind(normalizedPhone, amount, reference || "", fiveMinutesAgo)
      .first<Record<string, unknown>>();

    if (recentPayment) {
      return jsonResponse({
        CheckoutRequestID: recentPayment.checkout_request_id,
        MerchantRequestID: recentPayment.merchant_request_id,
        paymentId: recentPayment.id,
        ResponseCode: "0",
        ResponseDescription: "Duplicate request suppressed",
        CustomerMessage: "A pending payment already exists for this request",
      }, 200);
    }

    const result = await stkPush(env, { phone, amount, reference, description });

    const id = generateId();
    await env.DB.prepare(
      `INSERT INTO mpesa_payments (id, checkout_request_id, merchant_request_id, phone, amount, reference, status, receipt_number, result_desc, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
    )
      .bind(
        id,
        result.CheckoutRequestID,
        result.MerchantRequestID,
        normalizedPhone,
        amount,
        reference ?? "",
        null,
        result.ResponseDescription,
        new Date().toISOString(),
        new Date().toISOString()
      )
      .run();

    await logAudit(env, "mpesa.stk_initiated", undefined, normalizedPhone, "payment", id, { amount, reference, checkoutRequestId: result.CheckoutRequestID, phone: normalizedPhone }, ip);

    return jsonResponse({ ...result, paymentId: id }, 201);
  } catch (err) {
    console.error("M-Pesa STK error:", err);
    return serverError(err instanceof Error ? err.message : "M-Pesa request failed");
  }
}

async function handleMpesaCallback(request: Request, env: Env): Promise<Response> {
  const auth = request.headers.get("Authorization");
  const token = auth?.startsWith("Bearer ") ? auth.slice(7) : null;
  const customToken = request.headers.get("X-Mpesa-Callback-Token");
  const expectedToken = expectedCallbackToken(env);
  if (expectedToken && token !== expectedToken && customToken !== expectedToken) {
    return unauthorized("Invalid callback token");
  }

  try {
    const body = (await request.json()) as Record<string, unknown>;
    const stk = (body.Body as Record<string, unknown>)?.stkCallback as Record<string, unknown>;
    const checkoutRequestId = stk?.CheckoutRequestID as string;
    const merchantRequestId = stk?.MerchantRequestID as string;
    const resultCode = stk?.ResultCode as number;
    const resultDesc = (stk?.ResultDesc as string) ?? "";
    const callbackData = stk?.CallbackMetadata as Record<string, unknown> | undefined;
    const items = (callbackData?.Item as Array<Record<string, unknown>>) ?? [];
    const receipt = items.find((i) => i.Name === "ReceiptNumber")?.Value as string | undefined;
    const amount = items.find((i) => i.Name === "Amount")?.Value as number | undefined;
    const phone = items.find((i) => i.Name === "PhoneNumber")?.Value as string | undefined;
    const transactionDate = items.find((i) => i.Name === "TransactionDate")?.Value as string | undefined;

    const existing = await env.DB.prepare(
      "SELECT * FROM mpesa_payments WHERE checkout_request_id = ?"
    )
      .bind(checkoutRequestId)
      .first<Record<string, unknown>>();

    let status: string;
    if (resultCode === 0) {
      status = "completed";
    } else if (resultCode === 1032) {
      status = "cancelled";
    } else if (resultCode === 1037) {
      status = "timeout";
    } else {
      status = "failed";
    }

    const details: Record<string, unknown> = {
      resultCode,
      resultDesc,
      receiptNumber: receipt ?? null,
      amount: amount ?? null,
      phone: phone ?? null,
      transactionDate: transactionDate ?? null,
    };

    const existingReference = existing ? (existing.reference as string) : "";

    if (existing) {
      await env.DB.prepare(
        "UPDATE mpesa_payments SET status = ?, receipt_number = ?, result_desc = ?, updated_at = ? WHERE checkout_request_id = ?"
      )
        .bind(status, receipt ?? null, resultDesc, new Date().toISOString(), checkoutRequestId)
        .run();
    } else {
      const loan = existingReference ? await env.DB.prepare(
        "SELECT id FROM loans WHERE loan_number = ? OR id = ?"
      ).bind(existingReference, existingReference).first<{ id: string }>() : null;

      await env.DB.prepare(
        `INSERT INTO mpesa_payments (id, checkout_request_id, merchant_request_id, phone, amount, reference, loan_id, status, receipt_number, result_desc, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
        .bind(
          generateId(),
          checkoutRequestId,
          merchantRequestId ?? "",
          phone ?? "",
          amount ?? 0,
          existingReference,
          loan?.id || null,
          status,
          receipt ?? null,
          resultDesc,
          new Date().toISOString(),
          new Date().toISOString()
        )
        .run();
    }

    await logAudit(env, `mpesa.callback_${status}`, undefined, checkoutRequestId, "payment", checkoutRequestId, details, requestIp(request));

    // If payment completed and has a reference, try to link to loan repayment
    if (status === "completed" && existingReference && amount) {
      const loan = await env.DB.prepare(
        "SELECT * FROM loans WHERE loan_number = ? OR id = ?"
      )
        .bind(existingReference, existingReference)
        .first<Record<string, unknown>>();

      if (loan) {
        const userId = (loan as any).user_id;
        const loanId = (loan as any).id;
        const loanStatus = (loan as any).status;

        // Only create repayment if loan is in a repayable state
        if (loanStatus === "disbursed" || loanStatus === "under_review") {
          // Idempotency: check if this checkout request already created a repayment
          const existingRepayment = await env.DB.prepare(
            "SELECT id FROM transactions WHERE reference = ? AND type = 'repayment' AND status = 'success' AND loan_id = ? LIMIT 1"
          )
            .bind(checkoutRequestId, loanId)
            .first<Record<string, unknown>>();

          if (!existingRepayment) {
            const now = new Date().toISOString();

            // Create repayment transaction
            await env.DB.prepare(
              `INSERT INTO transactions (id, user_id, loan_id, type, amount, status, reference, created_at)
               VALUES (?, ?, ?, 'repayment', ?, 'success', ?, ?)`
            )
              .bind(generateId(), userId, loanId, amount, checkoutRequestId, now)
              .run();

            const currentBalance = await getUserBalance(env, userId);
            const newBalance = Math.max(0, currentBalance - amount);
            await env.DB.prepare(
              "UPDATE users SET current_loan_balance = ? WHERE id = ?"
            ).bind(newBalance, userId).run();

            await recordLedgerEntry(env, userId, loanId, "repayment", amount, "credit", newBalance, checkoutRequestId, undefined, undefined, { action: "mpesa_repay", loanId, receipt: receipt ?? null });

            // Check if loan is fully paid
            const updatedUser = await getUserById(env, userId);
            if (updatedUser && updatedUser.currentLoanBalance <= 0) {
              await env.DB.prepare(
                "UPDATE loans SET status = 'closed' WHERE id = ?"
              ).bind(loanId).run();

              const newScore = Math.min(850, (updatedUser.creditScore || 0) + 30);
              await env.DB.prepare(
                "UPDATE users SET credit_score = ?, current_loan_balance = 0 WHERE id = ?"
              ).bind(newScore, userId).run();
            }

            await logAudit(env, "loan.repay_mpesa", userId, updatedUser?.email, "loan", loanId, { amount, reference: existingReference, checkoutRequestId }, requestIp(request));

            // Send repayment confirmation SMS
            const balance = updatedUser?.currentLoanBalance || 0;
            await sendRepaymentSms(env, updatedUser?.telephone ? updatedUser.telephone : (phone ?? ""), existingReference, amount, balance);
          }
        }
      }
    }

    // Send SMS on successful payment
    if (status === "completed" && phone && amount) {
      const reference = existingReference || checkoutRequestId;
      await sendStkPromptSms(env, phone, amount, reference);
    }

    return jsonResponse({ ResultCode: 0, ResultDesc: "Accepted" });
  } catch (err) {
    console.error("M-Pesa callback error:", err);
    return jsonResponse({ ResultCode: 1, ResultDesc: "Rejected" });
  }
}

async function handleMpesaStatus(request: Request, env: Env): Promise<Response> {
  const token = getBearerToken(request);
  if (!token) return unauthorized();
  const user = await requireAuth(request, env);
  if (!user) return unauthorized();

  const url = new URL(request.url);
  const checkoutRequestId = url.searchParams.get("checkoutRequestId");
  if (!checkoutRequestId) return badRequest("checkoutRequestId is required");

  const row = await env.DB.prepare(
    "SELECT * FROM mpesa_payments WHERE checkout_request_id = ?"
  )
    .bind(checkoutRequestId)
    .first<Record<string, unknown>>();

  if (!row) return jsonResponse({ error: "Not found" }, 404);

  const status = row.status as string;
  const statusMessages: Record<string, string> = {
    completed: "Payment completed successfully",
    failed: "Payment failed",
    pending: "Payment is still pending",
    cancelled: "Payment was cancelled by the user",
    timeout: "Payment timed out",
  };

  return jsonResponse({
    ...toCamelCase(row),
    statusMessage: statusMessages[status] || status,
  });
}

// ──── USSD Handlers ──────────────────────────────────────────────────────

interface UssdSession {
  transactionId: string;
  phoneNumber: string;
  step: string;
  data: Record<string, unknown>;
  attempts: number;
}

async function getUssdSession(env: Env, transactionId: string): Promise<UssdSession | null> {
  const row = await env.DB.prepare(
    "SELECT * FROM ussd_sessions WHERE transaction_id = ?"
  )
    .bind(transactionId)
    .first<Record<string, unknown>>();

  if (!row) return null;
  return {
    transactionId: row.transaction_id as string,
    phoneNumber: row.phone_number as string,
    step: row.step as string,
    data: JSON.parse((row.session_data as string) || "{}"),
    attempts: (row.attempts as number) || 0,
  };
}

async function saveUssdSession(env: Env, session: UssdSession): Promise<void> {
  await env.DB.prepare(
    `INSERT OR REPLACE INTO ussd_sessions (transaction_id, phone_number, session_data, step, attempts, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, COALESCE((SELECT created_at FROM ussd_sessions WHERE transaction_id = ?), ?), ?)`
  )
    .bind(
      session.transactionId,
      session.phoneNumber,
      JSON.stringify(session.data),
      session.step,
      session.attempts,
      session.transactionId,
      new Date().toISOString(),
      new Date().toISOString()
    )
    .run();
}

async function deleteUssdSession(env: Env, transactionId: string): Promise<void> {
  await env.DB.prepare("DELETE FROM ussd_sessions WHERE transaction_id = ?").bind(transactionId).run();
}

async function getSetting(env: Env, key: string): Promise<string> {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = ?").bind(key).first<{ value: string }>();
  return row?.value || "";
}

async function getUserByPhone(env: Env, phone: string): Promise<User | undefined> {
  const formatted = formatPhone(phone);
  const result = await env.DB.prepare("SELECT * FROM users WHERE telephone = ? OR telephone = ?").bind(phone, formatted).first<Record<string, unknown>>();
  if (!result) return undefined;
  return toCamelCase(result) as unknown as User;
}

function buildUssdResponse(text: string, isEnd = false): string {
  const prefix = isEnd ? "END" : "CON";
  return `${prefix} ${text}`;
}

async function handleUssd(request: Request, env: Env): Promise<Response> {
  try {
    const url = new URL(request.url);
    const transactionId = url.searchParams.get("transactionId") || "";
    const phoneNumber = url.searchParams.get("phoneNumber") || "";
    const text = url.searchParams.get("text") || "";

    if (!transactionId || !phoneNumber) {
      return new Response("END Invalid request", { headers: { "Content-Type": "text/plain" } });
    }

    const ip = requestIp(request);
    if (!(await checkRateLimit(env, `ussd:${phoneNumber}`, 20, 600))) {
      return new Response("END Too many requests. Please try again later.", { headers: { "Content-Type": "text/plain" } });
    }

    let session = await getUssdSession(env, transactionId);
    if (!session) {
      session = {
        transactionId,
        phoneNumber,
        step: "welcome",
        data: {},
        attempts: 0,
      };
    }

    const input = text.split("*").filter(Boolean);
    const currentInput = input[input.length - 1] || "";

    let responseText = "";
    let isEnd = false;

    switch (session.step) {
      case "welcome":
        const userForWelcome = await getUserByPhone(env, session.phoneNumber);
        const welcomeName = userForWelcome ? ` ${userForWelcome.fullName}` : "";
        responseText = buildUssdResponse(`Welcome back${welcomeName}.\nWe believe you have read and understood the Terms and Conditions.\nPlease select:\n1. Log in\n2. Forgot Password`);
        session.step = "welcome_select";
        break;

      case "welcome_select":
        if (currentInput === "1") {
          responseText = buildUssdResponse("Enter PIN to proceed");
          session.step = "login_pin";
        } else if (currentInput === "2") {
          responseText = buildUssdResponse("Enter your phone number");
          session.step = "forgot_phone";
        } else {
          responseText = buildUssdResponse("Invalid option. Please select:\n1. Log in\n2. Forgot Password");
        }
        break;

      case "login_pin":
        const pin = currentInput;
        const user = await getUserByPhone(env, session.phoneNumber);
        if (!user || !user.pin) {
          responseText = buildUssdResponse("Account not found. Please register first.", true);
          isEnd = true;
        } else {
          const pinValid = await verifyPassword(pin, user.pin);
          if (pinValid) {
            session.data.userId = user.id;
            session.data.userName = user.fullName;
            session.data.category = user.category || "Micro-Enterprise";
            responseText = buildUssdResponse(`Welcome ${user.fullName}.\nPlease select your category:\n1. Micro-Enterprise\n2. Chama`);
            session.step = "category_select";
          } else {
            session.attempts += 1;
            if (session.attempts >= 3) {
              responseText = buildUssdResponse("Too many failed attempts. Goodbye.", true);
              isEnd = true;
            } else {
              responseText = buildUssdResponse(`Invalid PIN. ${3 - session.attempts} attempts remaining.\nEnter PIN to proceed\nOR dial *650*0# to reset PIN`);
            }
          }
        }
        break;

      case "forgot_phone":
        const forgotPhone = currentInput.replace(/\D/g, "");
        if (forgotPhone.length < 9) {
          responseText = buildUssdResponse("Invalid phone number. Enter your phone number:");
        } else {
          session.data.forgotPhone = `+254${forgotPhone.slice(-9)}`;
          const resetCode = Math.floor(100000 + Math.random() * 900000).toString();
          const resetHash = await hashOtp(resetCode);
          const resetId = generateId();
          await env.DB.prepare(
            `INSERT INTO otp_codes (id, phone, email, code_hash, purpose, attempts, attempts_max, expires_at, created_at)
             VALUES (?, ?, NULL, ?, 'reset', 0, 5, ?, ?)`
          )
            .bind(resetId, session.data.forgotPhone as string, resetHash, new Date(Date.now() + 5 * 60 * 1000).toISOString(), new Date().toISOString())
            .run();

          await sendSmsOtp(env, session.data.forgotPhone as string, resetCode);
          responseText = buildUssdResponse(`Reset code sent to ${session.data.forgotPhone}.\nEnter reset code:`);
          session.step = "forgot_code";
        }
        break;

      case "forgot_code":
        const enteredCode = currentInput;
        const resetOtp = await env.DB.prepare(
          "SELECT * FROM otp_codes WHERE phone = ? AND purpose = 'reset' AND used = 0 ORDER BY created_at DESC LIMIT 1"
        )
          .bind(session.data.forgotPhone)
          .first<Record<string, unknown>>();

        if (!resetOtp) {
          responseText = buildUssdResponse("Invalid or expired reset code. Goodbye.", true);
          isEnd = true;
        } else {
          const codeHash = resetOtp.code_hash as string;
          const codeValid = await verifyOtpCode(enteredCode, codeHash);
          if (codeValid) {
            responseText = buildUssdResponse("Enter new PIN (4-6 digits):");
            session.step = "forgot_new_pin";
          } else {
            responseText = buildUssdResponse("Invalid reset code. Try again:");
          }
        }
        break;

      case "forgot_new_pin":
        const newPin = currentInput;
        if (newPin.length < 4 || newPin.length > 6) {
          responseText = buildUssdResponse("PIN must be 4-6 digits. Enter new PIN:");
        } else {
          const newPinHash = await hashPassword(newPin);
          await env.DB.prepare("UPDATE users SET pin = ? WHERE telephone = ?").bind(newPinHash, session.data.forgotPhone).run();
          await env.DB.prepare("UPDATE otp_codes SET used = 1 WHERE id = (SELECT id FROM otp_codes WHERE phone = ? AND purpose = 'reset' AND used = 0 ORDER BY created_at DESC LIMIT 1)").bind(session.data.forgotPhone).run();
          responseText = buildUssdResponse("Password reset successful. You can now log in.", true);
          isEnd = true;
        }
        break;

      case "category_select":
        if (currentInput === "1") {
          session.data.category = "Micro-Enterprise";
        } else if (currentInput === "2") {
          session.data.category = "Chama";
        } else {
          responseText = buildUssdResponse("Invalid option.\n1. Micro-Enterprise\n2. Chama");
          break;
        }
        responseText = buildUssdResponse("Please select:\n1. Apply Loan\n2. Repay Loan\n3. Check Loan Balance\n4. Check Loan Limit");
        session.step = "main_menu";
        break;

      case "main_menu":
        switch (currentInput) {
          case "1":
            responseText = buildUssdResponse("Select loan type:\n1. Starter\n2. Top-up");
            session.step = "loan_type";
            break;
          case "2":
            responseText = buildUssdResponse("Enter amount to repay:");
            session.step = "repay_amount";
            break;
          case "3":
            const userForBalance = await getUserByPhone(env, session.phoneNumber);
            const balance = userForBalance?.currentLoanBalance || 0;
            responseText = buildUssdResponse(`Your loan balance is Ksh ${balance.toLocaleString()}.\nThank you.`, true);
            isEnd = true;
            break;
          case "4":
            const userForLimit = await getUserByPhone(env, session.phoneNumber);
            const limit = userForLimit?.loanLimit || 0;
            responseText = buildUssdResponse(`You have a loan limit of Ksh ${limit.toLocaleString()}.\nThe more you borrow and repay, the higher your limit. Thank you.`, true);
            isEnd = true;
            break;
          case "5":
            responseText = buildUssdResponse("Enter your phone number to reset PIN:");
            session.step = "forgot_phone";
            break;
          default:
            responseText = buildUssdResponse("Invalid option.\n1. Apply Loan\n2. Repay Loan\n3. Check Loan Balance\n4. Check Loan Limit\n5. Forgot PIN");
        }
        break;

      case "loan_type":
        if (currentInput === "1") {
          session.data.loanType = "Starter";
        } else if (currentInput === "2") {
          const userForTopup = await getUserByPhone(env, session.phoneNumber);
          const activeLoan = await env.DB.prepare(
            "SELECT * FROM loans WHERE user_id = ? AND status IN ('disbursed', 'under_review') ORDER BY created_at DESC LIMIT 1"
          )
            .bind(userForTopup?.id || "")
            .first<Record<string, unknown>>();

          if (!activeLoan) {
            responseText = buildUssdResponse("No active loan found. Top-up loans are eligible only upon payment of 70% of previous loan.\nSelect:\n1. Starter", true);
            isEnd = true;
            session.data.loanType = "Starter";
            break;
          }

          const principal = (activeLoan as any).principal as number;
          const total = (activeLoan as any).total as number;
          const repaid = await env.DB.prepare(
            "SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE user_id = ? AND type = 'repayment' AND status = 'success'"
          )
            .bind(userForTopup?.id || "")
            .first<{ total: number }>();

          const repaidAmount = repaid?.total || 0;
          const repaidPercentage = total > 0 ? (repaidAmount / total) * 100 : 0;

          if (repaidPercentage < 70) {
            responseText = buildUssdResponse(`Top-up requires 70% repayment of previous loan. Current: ${Math.round(repaidPercentage)}%.\nSelect:\n1. Starter`, true);
            isEnd = true;
            session.data.loanType = "Starter";
            break;
          }

          session.data.loanType = "Top-up";
        } else {
          responseText = buildUssdResponse("Invalid option.\n1. Starter\n2. Top-up");
          break;
        }
        responseText = buildUssdResponse("Enter amount (Minimum Ksh 1,000):");
        session.step = "loan_amount";
        break;

      case "loan_amount":
        const amount = parseFloat(currentInput.replace(/[^\d]/g, ""));
        const minLoan = parseFloat(await getSetting(env, "min_loan_amount")) || 1000;
        if (isNaN(amount) || amount < minLoan) {
          responseText = buildUssdResponse(`Minimum loan is Ksh ${minLoan.toLocaleString()}. Enter amount:`);
        } else {
          session.data.amount = amount;
          responseText = buildUssdResponse("Enter duration in weeks (Maximum 12 weeks):");
          session.step = "loan_duration";
        }
        break;

      case "loan_duration":
        const duration = parseInt(currentInput);
        const maxDuration = parseInt(await getSetting(env, "repayment_period")) || 12;
        if (isNaN(duration) || duration <= 0 || duration > maxDuration) {
          responseText = buildUssdResponse(`Maximum duration is ${maxDuration} weeks. Enter duration:`);
        } else {
          session.data.duration = duration;
          const principalAmt = (session.data.amount as number) || 0;
          const interestRate = (parseFloat(await getSetting(env, "interest_rate")) || 30) / 100;
          const totalAmt = Math.round(principalAmt * (1 + interestRate) * 100) / 100;
          const weeklyInstallment = Math.round((totalAmt / duration) * 100) / 100;
          session.data.total = totalAmt;
          session.data.weeklyInstallment = weeklyInstallment;

          responseText = buildUssdResponse(
            `Confirm Loan Application:\nLoan: Ksh ${principalAmt.toLocaleString()}\nTotal: Ksh ${totalAmt.toLocaleString()}\nDuration: ${duration} weeks\nInstallment: Ksh ${weeklyInstallment.toLocaleString()}\n\n1. Confirm\n2. Cancel`
          );
          session.step = "loan_confirm";
        }
        break;

      case "loan_confirm":
        if (currentInput === "1") {
          const userForLoan = await getUserByPhone(env, session.phoneNumber);
          if (!userForLoan) {
            responseText = buildUssdResponse("User not found. Goodbye.", true);
            isEnd = true;
            break;
          }

          const existingLoan = await env.DB.prepare(
            "SELECT id FROM loans WHERE user_id = ? AND status IN ('pending', 'disbursed', 'under_review')"
          )
            .bind(userForLoan.id)
            .first<{ id: string }>();

          if (existingLoan) {
            responseText = buildUssdResponse("You already have an active or pending loan. Please wait for it to be processed.", true);
            isEnd = true;
            break;
          }

          const loanId = generateId();
          const loanNumber = `UST-${new Date().getFullYear().toString().slice(2)}${String(new Date().getMonth() + 1).padStart(2, "0")}${String(new Date().getDate()).padStart(2, "0")}-${Math.floor(1000 + Math.random() * 9000)}`;
          const now = new Date().toISOString();

          await env.DB.prepare(
            `INSERT INTO loans (id, loan_number, user_id, customer_id, customer_name, loan_type, principal, total, weekly_installment, duration, status, applied_date, credit_officer, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`
          )
            .bind(
              loanId,
              loanNumber,
              userForLoan.id,
              userForLoan.id,
              userForLoan.fullName,
              session.data.loanType,
              session.data.amount,
              session.data.total,
              session.data.weeklyInstallment,
              session.data.duration,
              userForLoan.fullName,
              now
            )
            .run();

          await env.DB.prepare(
            `INSERT INTO transactions (id, user_id, loan_id, type, amount, status, reference, created_at)
             VALUES (?, ?, ?, 'loan', ?, 'pending', ?, ?)`
          )
            .bind(generateId(), userForLoan.id, loanId, session.data.amount, loanId, now)
            .run();

          await logAudit(env, "ussd.loan.apply", userForLoan.id, userForLoan.email, "loan", loanId, { loanType: session.data.loanType, principal: session.data.amount, duration: session.data.duration, total: session.data.total }, ip);

          responseText = buildUssdResponse(`Thank you. Your loan application ${loanNumber} has been received and is pending approval.`, true);
          isEnd = true;
        } else if (currentInput === "2") {
          responseText = buildUssdResponse("Application cancelled. Thank you.", true);
          isEnd = true;
        } else {
          responseText = buildUssdResponse("Invalid option.\n1. Confirm\n2. Cancel");
        }
        break;

      case "repay_amount":
        const repayAmount = parseFloat(currentInput.replace(/[^\d]/g, ""));
        const userForRepay = await getUserByPhone(env, session.phoneNumber);
        if (!userForRepay || repayAmount <= 0 || repayAmount > (userForRepay.currentLoanBalance || 0)) {
          responseText = buildUssdResponse(`Invalid amount. Your balance is Ksh ${(userForRepay?.currentLoanBalance || 0).toLocaleString()}.\nEnter amount:`);
        } else {
          session.data.repayAmount = repayAmount;
          responseText = buildUssdResponse(`You are about to repay Ksh ${repayAmount.toLocaleString()}.\n1. Confirm\n2. Cancel`);
          session.step = "repay_confirm";
        }
        break;

      case "repay_confirm":
        if (currentInput === "1") {
          const userForConfirm = await getUserByPhone(env, session.phoneNumber);
          const activeLoan = await env.DB.prepare(
            "SELECT * FROM loans WHERE user_id = ? AND status IN ('disbursed', 'under_review') ORDER BY created_at DESC LIMIT 1"
          )
            .bind(userForConfirm?.id || "")
            .first<Record<string, unknown>>();

          if (!activeLoan) {
            responseText = buildUssdResponse("No active loan found.", true);
            isEnd = true;
            break;
          }

          const now = new Date().toISOString();
          await env.DB.prepare(
            `INSERT INTO transactions (id, user_id, loan_id, type, amount, status, reference, created_at)
             VALUES (?, ?, ?, 'repayment', ?, 'pending', ?, ?)`
          )
            .bind(generateId(), userForConfirm!.id, (activeLoan as any).id, session.data.repayAmount, (activeLoan as any).loan_number || (activeLoan as any).id, now)
            .run();

          const currentBalance = await getUserBalance(env, userForConfirm!.id);
          const newBalance = Math.max(0, currentBalance - session.data.repayAmount);
          await env.DB.prepare(
            "UPDATE users SET current_loan_balance = ? WHERE id = ?"
          ).bind(newBalance, userForConfirm!.id).run();

          await recordLedgerEntry(env, userForConfirm!.id, (activeLoan as any).id, "repayment", session.data.repayAmount, "credit", newBalance, `ussd:${(activeLoan as any).id}`, undefined, undefined, { action: "ussd_repay_pending", note: "Awaiting M-Pesa verification" });

          const updatedUser = await getUserById(env, userForConfirm!.id);
          if (updatedUser && updatedUser.currentLoanBalance <= 0) {
            await env.DB.prepare(
              "UPDATE loans SET status = 'closed' WHERE id = ?"
            ).bind((activeLoan as any).id).run();
          }

          await logAudit(env, "ussd.loan.repay", userForConfirm!.id, userForConfirm!.email, "loan", (activeLoan as any).id, { amount: session.data.repayAmount, status: "pending" }, ip);

          responseText = buildUssdResponse(`You have paid Ksh ${(session.data.repayAmount as number).toLocaleString()} for loan No ${(activeLoan as any).loan_number || (activeLoan as any).id}. Your balance is Ksh ${(updatedUser?.currentLoanBalance || 0).toLocaleString()}.`, true);
          isEnd = true;
        } else if (currentInput === "2") {
          responseText = buildUssdResponse("Repayment cancelled. Thank you.", true);
          isEnd = true;
        } else {
          responseText = buildUssdResponse("Invalid option.\n1. Confirm\n2. Cancel");
        }
        break;

      default:
        responseText = buildUssdResponse("Session expired. Dial again.", true);
        isEnd = true;
    }

    if (isEnd) {
      await deleteUssdSession(env, transactionId);
    } else {
      await saveUssdSession(env, session);
    }

    await logAudit(env, "ussd.response", undefined, phoneNumber, "ussd", transactionId, { step: session.step, input: currentInput }, ip);

    return new Response(responseText, {
      headers: { "Content-Type": "text/plain" },
    });
  } catch (err) {
    console.error("USSD error:", err);
    return new Response("END System error. Please try again later.", {
      headers: { "Content-Type": "text/plain" },
    });
  }
}

// ──── Penalty Cron Job ────────────────────────────────────────────────

async function applyOverduePenalties(env: Env): Promise<void> {
  try {
    const now = new Date().toISOString();
    const overdueLoans = await env.DB.prepare(
      `SELECT * FROM loans WHERE due_date IS NOT NULL AND due_date < ? AND status = 'disbursed'`
    ).bind(now).all<Record<string, unknown>>();

    for (const loan of overdueLoans.results || []) {
      const userId = (loan as any).user_id as string;
      const loanId = (loan as any).id as string;
      const principal = (loan as any).principal as number;
      const penaltyAmount = Math.round(principal * 0.05);

      await env.DB.prepare(
        `UPDATE loans SET penalty_amount = penalty_amount + ? WHERE id = ?`
      ).bind(penaltyAmount, loanId).run();

      await env.DB.prepare(
        `INSERT INTO transactions (id, user_id, loan_id, type, amount, status, reference, created_at)
         VALUES (?, ?, ?, 'penalty', ?, 'success', ?, ?)`
      ).bind(generateId(), userId, loanId, penaltyAmount, `penalty:${loanId}`, now);

      const currentBalance = await getUserBalance(env, userId);
      const newBalance = currentBalance + penaltyAmount;
      await env.DB.prepare(
        "UPDATE users SET current_loan_balance = ? WHERE id = ?"
      ).bind(newBalance, userId).run();

      await recordLedgerEntry(env, userId, loanId, "penalty", penaltyAmount, "debit", newBalance, `penalty:${loanId}`, undefined, undefined, { reason: "Overdue repayment", daysOverdue: Math.floor((Date.now() - new Date((loan as any).due_date as string).getTime()) / (1000 * 60 * 60 * 24)) });

      const user = await getUserById(env, userId);
      if (user) {
        await logAudit(env, "penalty.applied", user.id, user.email, "loan", loanId, { loanId, penaltyAmount, reason: "Overdue repayment" }, undefined);

        if (user.telephone) {
          const daysOverdue = Math.floor((Date.now() - new Date((loan as any).due_date as string).getTime()) / (1000 * 60 * 60 * 24));
          await sendOverdueSms(env, user.telephone, loanId, daysOverdue, penaltyAmount);
        }
        if (user.email) {
          const daysOverdue = Math.floor((Date.now() - new Date((loan as any).due_date as string).getTime()) / (1000 * 60 * 60 * 24));
          await sendOverdueEmail(env, user.email, loanId, daysOverdue, penaltyAmount);
        }
      }
    }
  } catch (err) {
    console.error("Penalty cron error:", err);
  }
}

// ──── Auth Token Helper ──────────────────────────────────────────────────────

function getBearerToken(request: Request): string | null {
  const auth = request.headers.get("Authorization");
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
}

// ──── Main Fetch Handler ─────────────────────────────────────────────────────

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    currentRequestOrigin = request.headers.get("Origin") || "";
    const url = new URL(request.url);

    try {
      if (request.method === "OPTIONS") {
        const origin = request.headers.get("Origin") || "*";
        return new Response(null, { headers: getCorsHeaders(origin) });
      }

      if (isCircuitOpen() && url.pathname !== "/api/healthz") {
        return jsonResponse({ error: "Service temporarily unavailable. Please retry shortly." }, 503);
      }

      await ensureDatabaseInitialized(env);

      if (url.pathname === "/api/healthz" && request.method === "GET") {
        return handleHealth();
      }

      if (url.pathname === "/api/mpesa/stk" && request.method === "POST") {
        return handleMpesaStk(request, env);
      }

      if (url.pathname === "/api/mpesa/callback" && request.method === "POST") {
        return handleMpesaCallback(request, env);
      }

      if (url.pathname === "/api/mpesa/status" && request.method === "GET") {
        return handleMpesaStatus(request, env);
      }

      if (url.pathname === "/ussd" && request.method === "POST") {
        return handleUssd(request, env);
      }

      if (url.pathname === "/api/auth/signup" && request.method === "POST") {
        return handleSignup(request, env);
      }

      if (url.pathname === "/api/auth/login" && request.method === "POST") {
        return handleLogin(request, env);
      }

      if (url.pathname === "/api/auth/otp-login" && request.method === "POST") {
        return handleOtpLogin(request, env);
      }

      if (url.pathname === "/api/auth/refresh" && request.method === "POST") {
        return handleRefresh(request, env);
      }

      if (url.pathname === "/api/auth/me" && request.method === "GET") {
        const token = getBearerToken(request);
        return handleMe(token, env);
      }

      if (url.pathname === "/api/auth/logout" && request.method === "POST") {
        const token = getBearerToken(request);
        if (!token) return unauthorized();
        return handleLogout(request, env, token);
      }

      if (url.pathname === "/api/auth/profile" && request.method === "PUT") {
        const token = getBearerToken(request);
        if (!token) return unauthorized();
        return handleUpdateProfile(request, env, token);
      }

      if (url.pathname === "/api/auth/account" && request.method === "DELETE") {
        const token = getBearerToken(request);
        if (!token) return unauthorized();
        return handleDeleteAccount(request, env, token);
      }

      if (url.pathname === "/api/auth/forgot-password" && request.method === "POST") {
        return handleForgotPassword(request, env);
      }

      if (url.pathname === "/api/auth/reset-password" && request.method === "POST") {
        return handleResetPassword(request, env);
      }

      if (url.pathname === "/api/admin/users" && request.method === "POST") {
        const token = getBearerToken(request);
        if (!token) return unauthorized();
        return handleAdminListUsers(request, env, token);
      }

      if (url.pathname === "/api/admin/search" && request.method === "GET") {
        const token = getBearerToken(request);
        if (!token) return unauthorized();
        return handleAdminSearch(request, env, token);
      }

      if (url.pathname === "/api/admin/users/suspend" && request.method === "POST") {
        const token = getBearerToken(request);
        if (!token) return unauthorized();
        return handleAdminSuspendUser(request, env, token);
      }

      if (url.pathname === "/api/admin/users/unsuspend" && request.method === "POST") {
        const token = getBearerToken(request);
        if (!token) return unauthorized();
        return handleAdminUnsuspendUser(request, env, token);
      }

      if (url.pathname === "/api/admin/users/delete" && request.method === "POST") {
        const token = getBearerToken(request);
        if (!token) return unauthorized();
        return handleAdminDeleteUser(request, env, token);
      }

      if (url.pathname === "/api/admin/users/role" && request.method === "POST") {
        const token = getBearerToken(request);
        if (!token) return unauthorized();
        return handleAdminUpdateUserRole(request, env, token);
      }

      if (url.pathname === "/api/admin/test/email" && request.method === "POST") {
        const token = getBearerToken(request);
        if (!token) return unauthorized();
        return handleAdminTestEmail(request, env, token);
      }

      if (url.pathname === "/api/admin/reports/loans" && request.method === "GET") {
        const token = getBearerToken(request);
        if (!token) return unauthorized();
        return handleAdminReportsLoans(request, env, token);
      }

      if (url.pathname === "/api/admin/reports/repayments" && request.method === "GET") {
        const token = getBearerToken(request);
        if (!token) return unauthorized();
        return handleAdminReportsRepayments(request, env, token);
      }

      if (url.pathname === "/api/admin/bulk-sms" && request.method === "POST") {
        const token = getBearerToken(request);
        if (!token) return unauthorized();
        return handleAdminBulkSms(request, env, token);
      }

      if (url.pathname === "/api/admin/settings" && (request.method === "GET" || request.method === "POST")) {
        const token = getBearerToken(request);
        if (!token) return unauthorized();
        return handleAdminSettings(request, env, token);
      }

      if (url.pathname === "/api/otp/send" && request.method === "POST") {
        return handleOtpSend(request, env);
      }

      if (url.pathname === "/api/otp/verify" && request.method === "POST") {
        return handleOtpVerify(request, env);
      }

      if (url.pathname === "/api/otp/resend" && request.method === "POST") {
        return handleOtpResend(request, env);
      }

      if (url.pathname === "/api/qualification" && request.method === "POST") {
        const token = getBearerToken(request);
        if (!token) return unauthorized();
        return handleQualification(request, env, token);
      }

if (url.pathname === "/api/qualification" && request.method === "GET") {
         const token = getBearerToken(request);
         if (!token) return unauthorized();
         return handleGetQualification(env, token);
       }

       if (url.pathname === "/api/kyc/verify" && request.method === "POST") {
         const token = getBearerToken(request);
         if (!token) return unauthorized();
         return handleKycVerify(request, env, token);
       }

        if (url.pathname === "/api/kyc/status" && request.method === "GET") {
          const token = getBearerToken(request);
          if (!token) return unauthorized();
          return handleKycStatus(request, env, token);
        }

        if (url.pathname === "/api/loans" && request.method === "POST") {
          const token = getBearerToken(request);
          if (!token) return unauthorized();
          return handleLoanApply(request, env, token);
        }

        if (url.pathname === "/api/loans" && request.method === "GET") {
          const token = getBearerToken(request);
          if (!token) return unauthorized();
          return handleGetLoans(request, env, token);
        }

        if (url.pathname === "/api/loans/my-info" && request.method === "GET") {
          const token = getBearerToken(request);
          if (!token) return unauthorized();
          return handleGetMyLoanInfo(request, env, token);
        }

        if (url.pathname.match(/^\/api\/loans\/[^/]+\/approve$/) && request.method === "POST") {
          const token = getBearerToken(request);
          if (!token) return unauthorized();
          return handleLoanApprove(request, env, token);
        }

        if (url.pathname.match(/^\/api\/loans\/[^/]+\/decline$/) && request.method === "POST") {
          const token = getBearerToken(request);
          if (!token) return unauthorized();
          return handleLoanDecline(request, env, token);
        }

        if (url.pathname.match(/^\/api\/loans\/[^/]+\/disburse$/) && request.method === "POST") {
          const token = getBearerToken(request);
          if (!token) return unauthorized();
          return handleLoanDisburse(request, env, token);
        }

        if (url.pathname.match(/^\/api\/loans\/[^/]+\/status$/) && request.method === "PATCH") {
          const token = getBearerToken(request);
          if (!token) return unauthorized();
          return handleUpdateLoanStatus(request, env, token);
        }

        if (url.pathname.match(/^\/api\/loans\/[^/]+\/repay$/) && request.method === "POST") {
          const token = getBearerToken(request);
          if (!token) return unauthorized();
          return handleLoanRepay(request, env, token);
        }

        if (url.pathname.match(/^\/api\/loans\/[^/]+\/statement$/) && request.method === "GET") {
          const token = getBearerToken(request);
          if (!token) return unauthorized();
          return handleLoanStatement(request, env, token);
        }

  if (url.pathname === "/api/files/upload" && request.method === "POST") {
    const token = getBearerToken(request);
    if (!token) return unauthorized();
    return handleFileUpload(request, env, token);
  }

  if (url.pathname === "/api/users" && request.method === "GET") {
    const token = getBearerToken(request);
    if (!token) return unauthorized();
    return handleListUsers(request, env, token);
  }

  if (url.pathname.match(/^\/api\/files\/.+/) && request.method === "GET") {
           const key = url.pathname.replace("/api/files/", "");
           return handleFileDownload(request, env, key);
         }

         if (url.pathname === "/api/admin/reports/monthly" && request.method === "GET") {
           const token = getBearerToken(request);
           if (!token) return unauthorized();
           return handleMonthlyReports(request, env, token);
         }

          if (url.pathname === "/api/admin/audit" && request.method === "GET") {
            const token = getBearerToken(request);
            if (!token) return unauthorized();
            return handleAuditLogs(request, env, token);
          }

          if (url.pathname === "/api/admin/backup" && request.method === "POST") {
            const token = getBearerToken(request);
            if (!token) return unauthorized();
            return handleBackup(request, env, token);
          }

       if (url.pathname === "/" && request.method === "GET") {
        return jsonResponse({ status: "ok" });
      }

      // ──── Dashboard Stats ────────────────────────────────────

            if (url.pathname === "/api/admin/stats" && request.method === "GET") {
              const token = getBearerToken(request);
              if (!token) return unauthorized();
              const user = await requireAuth(request, env);
              if (!user) return unauthorized();

              if (!hasAccess(user.role, 'Supervisor')) {
                return jsonResponse({ error: "Insufficient permissions" }, 403);
              }

              const totalCustomers = await env.DB.prepare("SELECT COUNT(*) as count FROM users WHERE role != 'Manager'").first<{ count: number }>();
              const totalApplications = await env.DB.prepare("SELECT COUNT(*) as count FROM loans").first<{ count: number }>();
              const totalRepayments = await env.DB.prepare("SELECT COALESCE(SUM(amount), 0) as total FROM transactions WHERE type = 'repayment' AND status = 'success'").first<{ total: number }>();
              const activeLoans = await env.DB.prepare("SELECT COUNT(*) as count FROM loans WHERE status IN ('disbursed', 'under_review')").first<{ count: number }>();

              return jsonResponse({
                totalCustomers: (totalCustomers?.count || 0),
                totalApplications: (totalApplications?.count || 0),
                totalRepayments: (totalRepayments?.total || 0),
                activeLoans: (activeLoans?.count || 0),
              });
            }

            // ──── Customer Management ─────────────────────────────────

            if (url.pathname === "/api/customers" && request.method === "GET") {
              const token = getBearerToken(request);
              if (!token) return unauthorized();
              const user = await requireAuth(request, env);
              if (!user) return unauthorized();
              if (!hasAccess(user.role, 'Officer')) {
                return jsonResponse({ error: "Insufficient permissions" }, 403);
              }
              const reqUrl = new URL(request.url);
              const cursor = reqUrl.searchParams.get("cursor") ?? "";
              const maxCreatedAt = cursor || new Date(Date.now() + 86400000).toISOString();
              const limit = 200;
              const customers = await env.DB.prepare("SELECT * FROM customers WHERE created_at < ? ORDER BY created_at DESC LIMIT ?").bind(maxCreatedAt, limit).all<Record<string, unknown>>();
              const nextCursor = customers.results.length > 0 ? customers.results[customers.results.length - 1]?.created_at ?? "" : "";
              return jsonResponse({ customers: (customers.results || []).map((r) => toCamelCase(r)), nextCursor });
            }

            if (url.pathname === "/api/customers" && request.method === "POST") {
              const token = getBearerToken(request);
              if (!token) return unauthorized();
              const user = await requireAuth(request, env);
              if (!user) return unauthorized();
              if (!hasAccess(user.role, 'Officer')) {
                return jsonResponse({ error: "Insufficient permissions" }, 403);
              }
              const body = (await request.json()) as Record<string, unknown>;
              const customerId = generateId();
              const now = new Date().toISOString();
              await env.DB.prepare(
                `INSERT INTO customers (id, customer_type, name, phone, id_number, county, subcounty, ward, village, chief_name, marital_status, spouse_name, spouse_phone, economic_activity, monthly_income, credit_officer, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
              ).bind(
                customerId,
                (body.customerType as string) || "",
                (body.name as string) || "",
                (body.phone as string) || "",
                (body.idNumber as string) || "",
                (body.county as string) || "",
                (body.subcounty as string) || "",
                (body.ward as string) || "",
                (body.village as string) || "",
                (body.chiefName as string) || "",
                (body.maritalStatus as string) || "",
                (body.spouseName as string) || null,
                (body.spousePhone as string) || null,
                (body.economicActivity as string) || "",
                (body.monthlyIncome as number) || 0,
                user.fullName,
                now
              ).run();
              await logAudit(env, "customer.created", user.id, user.email, "customer", customerId, { name: body.name as string }, requestIp(request));
              return jsonResponse({ customer: { id: customerId, ...body, createdAt: now } }, 201);
            }

            // ──── Inquiries ───────────────────────────────────────────

            if (url.pathname === "/api/inquiries" && request.method === "GET") {
              const token = getBearerToken(request);
              if (!token) return unauthorized();
              const user = await requireAuth(request, env);
              if (!user) return unauthorized();
              if (!hasAccess(user.role, 'Officer')) {
                return jsonResponse({ error: "Insufficient permissions" }, 403);
              }
              const reqUrl = new URL(request.url);
              const cursor = reqUrl.searchParams.get("cursor") ?? "";
              const maxCreatedAt = cursor || new Date(Date.now() + 86400000).toISOString();
              const limit = 200;
              const inquiries = await env.DB.prepare("SELECT * FROM inquiries WHERE created_at < ? ORDER BY created_at DESC LIMIT ?").bind(maxCreatedAt, limit).all<Record<string, unknown>>();
              const nextCursor = inquiries.results.length > 0 ? inquiries.results[inquiries.results.length - 1]?.created_at ?? "" : "";
              return jsonResponse({ inquiries: (inquiries.results || []).map((r) => toCamelCase(r)), nextCursor });
            }

            if (url.pathname === "/api/inquiries" && request.method === "POST") {
              const token = getBearerToken(request);
              if (!token) return unauthorized();
              const user = await requireAuth(request, env);
              if (!user) return unauthorized();
              if (!hasAccess(user.role, 'Officer')) {
                return jsonResponse({ error: "Insufficient permissions" }, 403);
              }
              const body = (await request.json()) as Record<string, unknown>;
              const inquiryId = generateId();
              const now = new Date().toISOString();
              await env.DB.prepare(
                `INSERT INTO inquiries (id, name, telephone, email, county, location, inquiry_type, description, status, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'new', ?)`
              ).bind(
                inquiryId,
                (body.name as string) || "",
                (body.telephone as string) || "",
                (body.email as string) || null,
                (body.county as string) || "",
                (body.location as string) || "",
                (body.inquiryType as string) || "Loan Limit",
                (body.description as string) || "",
                now
              ).run();
              await logAudit(env, "inquiry.created", user.id, user.email, "inquiry", inquiryId, { name: body.name as string }, requestIp(request));
              return jsonResponse({ inquiry: { id: inquiryId, ...body, status: "new", createdAt: now } }, 201);
            }

        const origin = request.headers.get("Origin") || "*";
        return new Response("Not Found", { status: 404, headers: getCorsHeaders(origin) });
    } catch (err) {
      console.error("Worker error:", err);
      return serverError();
    }
  },
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    try {
      if (event.cron === "0 * * * *") {
        await ensureDatabaseInitialized(env);
        await processRetryQueue(env).catch(() => {});
        await applyOverduePenalties(env);
      }
      if (event.cron === "0 0 * * *") {
        await ensureDatabaseInitialized(env);
        await reconcileData(env);
        await scheduledBackup(env);
      }
    } catch (err) {
      console.error("Scheduled task error:", err);
    }
  },
};

async function reconcileData(env: Env): Promise<void> {
  try {
    const orphanedLoans = await env.DB.prepare(
      `SELECT l.id FROM loans l LEFT JOIN transactions t ON l.id = t.loan_id AND t.type = 'loan' WHERE l.status IN ('approved', 'disbursed') AND t.id IS NULL`
    ).all<{ id: string }>();
    for (const loan of (orphanedLoans.results || [])) {
      console.warn("[reconcile] loan missing transaction:", loan.id);
      await logAudit(env, "reconcile.orphaned_loan", undefined, undefined, "loan", loan.id, { issue: "missing_transaction" }, undefined);
    }

    const disbursedWithoutTx = await env.DB.prepare(
      `SELECT l.id FROM loans l LEFT JOIN transactions t ON l.id = t.loan_id AND t.type = 'disbursement' WHERE l.status = 'disbursed' AND t.id IS NULL`
    ).all<{ id: string }>();
    for (const loan of (disbursedWithoutTx.results || [])) {
      console.warn("[reconcile] disbursed loan missing disbursement tx:", loan.id);
      await logAudit(env, "reconcile.missing_disbursement_tx", undefined, undefined, "loan", loan.id, { issue: "missing_disbursement_tx" }, undefined);
    }

    const pendingMpesa = await env.DB.prepare(
      `SELECT checkout_request_id, phone, amount, created_at FROM mpesa_payments WHERE status = 'pending' AND created_at < ?`
    ).bind(new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()).all<Record<string, unknown>>();
    for (const payment of (pendingMpesa.results || [])) {
      console.warn("[reconcile] stale mpesa pending:", payment.checkout_request_id);
      await logAudit(env, "reconcile.stale_mpesa", undefined, (payment.phone as string) || undefined, "payment", (payment.checkout_request_id as string), { amount: payment.amount, age_hours: 24 }, undefined);
    }
  } catch (err) {
    console.error("Reconciliation error:", err);
  }
}

async function scheduledBackup(env: Env): Promise<void> {
  try {
    const tables = ["users", "loans", "transactions", "ledger_entries", "retry_queue", "audit_logs", "admin_logs", "mpesa_payments", "customers", "inquiries", "ussd_sessions", "otp_codes", "refresh_tokens", "qualification_answers", "id_verifications", "settings", "files"];
    const backup: Record<string, unknown> = {};
    for (const table of tables) {
      try {
        const rows = await env.DB.prepare(`SELECT * FROM ${table}`).all<Record<string, unknown>>();
        backup[table] = rows.results || [];
      } catch {
        backup[table] = [];
      }
    }

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const key = `backups/${new Date().toISOString().slice(0, 10)}.json`;
    await env.R2.put(key, blob, { httpMetadata: { contentType: "application/json" } });

    await logAudit(env, "backup.scheduled", undefined, undefined, "system", undefined, { key, tables: tables.length }, undefined);
  } catch (err) {
    console.error("Scheduled backup error:", err);
  }
}

async function handleBackup(request: Request, env: Env, token: string): Promise<Response> {
  try {
    const admin = await requireAuth(request, env);
    if (!admin || !hasAccess(admin.role, 'Manager')) {
      return jsonResponse({ error: "Forbidden" }, 403);
    }

    const tables = ["users", "loans", "transactions", "retry_queue", "audit_logs", "admin_logs", "mpesa_payments", "customers", "inquiries", "ussd_sessions", "otp_codes", "refresh_tokens", "qualification_answers", "id_verifications", "settings", "files"];
    const backup: Record<string, unknown> = {};
    for (const table of tables) {
      try {
        const rows = await env.DB.prepare(`SELECT * FROM ${table}`).all<Record<string, unknown>>();
        backup[table] = rows.results || [];
      } catch {
        backup[table] = [];
      }
    }

    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const key = `backups/${new Date().toISOString().slice(0, 10)}.json`;
    await env.R2.put(key, blob, { httpMetadata: { contentType: "application/json" } });

    await logAudit(env, "backup.created", admin.id, admin.email, "system", undefined, { key, tables: tables.length }, requestIp(request));
    return jsonResponse({ success: true, key, tables: tables.length });
  } catch (err) {
    console.error("Backup error:", err);
    return serverError();
  }
}

