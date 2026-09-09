// ---------------------------------------------------------------------------
// M-Pesa (Safaricom Daraja) STK Push integration
// ---------------------------------------------------------------------------
// Supports both the sandbox and production Daraja environments. Credentials are
// read from the worker bindings defined in wrangler.toml:
//   - vars:      MPESA_ENV, MPESA_BASE_URL, MPESA_CONSUMER_KEY, MPESA_SHORTCODE,
//                MPESA_PASSKEY, MPESA_PARTY_BF, MPESA_INITIATOR_NAME,
//                MPESA_QUEUE_TIMEOUT_URL, MPESA_RESULT_URL, MPESA_CALLBACK_URL,
//                MPESA_ACCOUNT_REFERENCE
//   - secrets:   MPESA_CONSUMER_SECRET, MPESA_INITIATOR_PASSWORD,
//                MPESA_CALLBACK_TOKEN
// ---------------------------------------------------------------------------

export interface MpesaEnv {
  MPESA_ENV: string;
  MPESA_BASE_URL: string;
  MPESA_CONSUMER_KEY: string;
  MPESA_CONSUMER_SECRET: string;
  MPESA_SHORTCODE: string;
  MPESA_PASSKEY: string;
  MPESA_PARTY_BF: string;
  MPESA_INITIATOR_NAME: string;
  MPESA_QUEUE_TIMEOUT_URL: string;
  MPESA_RESULT_URL: string;
  MPESA_CALLBACK_URL: string;
  MPESA_ACCOUNT_REFERENCE: string;
  MPESA_INITIATOR_PASSWORD: string;
  MPESA_CALLBACK_TOKEN: string;
}

export interface StkPushRequest {
  phone: string;
  amount: number;
  reference?: string;
  description?: string;
}

export interface StkPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

function btoaSafe(input: string): string {
  // Cloudflare Workers provide `btoa` globally.
  return btoa(input);
}

function timestamp(now = new Date()): string {
  const y = now.getUTCFullYear();
  const m = String(now.getUTCMonth() + 1).padStart(2, "0");
  const d = String(now.getUTCDate()).padStart(2, "0");
  const h = String(now.getUTCHours()).padStart(2, "0");
  const min = String(now.getUTCMinutes()).padStart(2, "0");
  const s = String(now.getUTCSeconds()).padStart(2, "0");
  return `${y}${m}${d}${h}${min}${s}`;
}

async function getAccessToken(env: MpesaEnv): Promise<string> {
  const auth = btoaSafe(`${env.MPESA_CONSUMER_KEY}:${env.MPESA_CONSUMER_SECRET}`);
  const url = `${env.MPESA_BASE_URL}/oauth/v1/generate?grant_type=client_credentials`;
  
  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { Authorization: `Basic ${auth}` },
        signal: AbortSignal.timeout(10000),
      });
      if (res.ok) {
        const data = (await res.json()) as { access_token: string };
        return data.access_token;
      }
      lastError = new Error(`M-Pesa token request failed: ${res.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("Token fetch failed");
    }
    if (attempt < 2) {
      await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
  throw lastError || new Error("M-Pesa token request failed after retries");
}

function password(env: MpesaEnv, ts: string): string {
  return btoaSafe(`${env.MPESA_SHORTCODE}${env.MPESA_PASSKEY}${ts}`);
}

function normalizePhone(phone: string): string {
  const digits = phone.replace(/\D/g, "");
  // Convert 07... / 01... -> 2547... / 2541...
  if (digits.startsWith("0")) return `254${digits.slice(1)}`;
  if (digits.startsWith("254")) return digits;
  if (digits.startsWith("+254")) return digits.slice(1);
  return digits;
}

export async function stkPush(
  env: MpesaEnv,
  req: StkPushRequest,
): Promise<StkPushResponse> {
  const missing = [
    env.MPESA_CONSUMER_KEY,
    env.MPESA_CONSUMER_SECRET,
    env.MPESA_SHORTCODE,
    env.MPESA_PASSKEY,
  ].filter((v) => !v || v.trim() === "");
  if (missing.length > 0) {
    throw new Error(
      "M-Pesa is not configured. Set MPESA_CONSUMER_KEY, MPESA_CONSUMER_SECRET, MPESA_SHORTCODE and MPESA_PASSKEY in wrangler.toml / secrets.",
    );
  }

  const token = await getAccessToken(env);
  const ts = timestamp();
  const body = {
    BusinessShortCode: env.MPESA_SHORTCODE,
    Password: password(env, ts),
    Timestamp: ts,
    TransactionType: "CustomerPayBillOnline",
    Amount: Math.round(req.amount),
    PartyA: normalizePhone(req.phone),
    PartyB: env.MPESA_SHORTCODE,
    PhoneNumber: normalizePhone(req.phone),
    CallBackURL: env.MPESA_CALLBACK_URL,
    AccountReference: req.reference ?? env.MPESA_ACCOUNT_REFERENCE,
    TransactionDesc: req.description ?? "Loan repayment",
  };

  let lastError: Error | null = null;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(`${env.MPESA_BASE_URL}/mpesa/stkpush/v1/processrequest`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15000),
      });

      const data = (await res.json()) as StkPushResponse;
      if (res.ok && data.ResponseCode === "0") {
        return data;
      }
      lastError = new Error(data.ResponseDescription || `STK push failed: ${res.status}`);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error("STK push failed");
    }
    if (attempt < 1) {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  throw lastError || new Error("STK push failed after retries");
}

export function expectedCallbackToken(env: MpesaEnv): string {
  return env.MPESA_CALLBACK_TOKEN;
}
