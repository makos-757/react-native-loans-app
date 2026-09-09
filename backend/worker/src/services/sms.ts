// ---------------------------------------------------------------------------
// Africa's Talking SMS Service - Production Ready
// ---------------------------------------------------------------------------
// Only for critical financial communication: OTP, loan approval, disbursement,
// repayment confirmation, payment failure, penalty notices.
// DO NOT send SMS for frontend errors or non-critical notifications.
// ---------------------------------------------------------------------------

import type { D1Database } from "@cloudflare/workers-types";

export interface MpesaEnv {
  AT_API_KEY: string;
  AT_USERNAME: string;
  AT_SENDER_ID: string;
  DB: D1Database;
}

export interface SmsResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

// Generate unique ID
function generateId(): string {
  return crypto.randomUUID();
}

// Core SMS sending function with DB logging
export async function sendSms(
  env: MpesaEnv & { DB: D1Database },
  to: string,
  message: string,
  userId?: string
): Promise<SmsResult> {
  const url = "https://api.africastalking.com/version1/messaging";
  const { AT_API_KEY, AT_USERNAME, AT_SENDER_ID } = env;

  // Skip if not configured (sandbox/dev mode)
  if (!AT_API_KEY || !AT_USERNAME || AT_API_KEY === "YOUR_API_KEY" || AT_USERNAME === "sandbox") {
    console.log(`[SMS] Dev mode - To: ${to} | Message: ${message}`);
    return { success: true, messageId: "dev-mode" };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        apiKey: AT_API_KEY,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        username: AT_USERNAME,
        to,
        message,
        from: AT_SENDER_ID,
      }),
      signal: AbortSignal.timeout(10000),
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      console.error("[SMS] API error:", data);
      // Log failed SMS
      if (userId) {
        await logSms(env.DB, userId, to, message, "failed", undefined);
      }
      return { success: false, error: (data.errorMessage as string) || `HTTP ${response.status}` };
    }

    const smsMessageData = data.SMSMessageData as Record<string, unknown> | undefined;
    const recipients = (smsMessageData?.Recipients as Array<Record<string, unknown>>) ?? [];

    if (recipients.length > 0) {
      const recipient = recipients[0];
      const statusCode = recipient.statusCode as number | undefined;
      const messageId = recipient.messageId as string | undefined;

      if (statusCode === 101 || statusCode === 100) {
        // Log successful SMS
        if (userId) {
          await logSms(env.DB, userId, to, message, "sent", messageId);
        }
        return { success: true, messageId };
      }
      // Log failed SMS
      if (userId) {
        await logSms(env.DB, userId, to, message, "failed", messageId);
      }
      return { success: false, error: recipient.status as string || "Failed" };
    }

    return { success: false, error: "No recipients in response" };
  } catch (err) {
    console.error("[SMS] Exception:", err);
    // Log failed SMS
    if (userId) {
      await logSms(env.DB, userId, to, message, "failed", undefined);
    }
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// Log SMS to database for audit trail
async function logSms(
  db: D1Database,
  userId: string,
  phone: string,
  message: string,
  status: string,
  messageId?: string
): Promise<void> {
  try {
    await db.prepare(
      `INSERT INTO sms_logs (id, user_id, phone, message, status, message_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(generateId(), userId, phone, message, status, messageId || null, new Date().toISOString())
      .run();
  } catch (err) {
    console.error("[SMS] Failed to log SMS:", err);
    // Best effort - don't fail the request
  }
}

// ---------------------------------------------------------------------------
// Critical Financial SMS Templates
// ---------------------------------------------------------------------------

// OTP Verification (already exists in index.ts, kept for reference)
export function buildOtpMessage(code: string): string {
  return `Your Vaultiline verification code is ${code}. Expires in 5 minutes. Do not share.`;
}

// Loan Application Submitted
export function buildLoanApplicationMessage(loanNumber: string, amount: number): string {
  return `Loan ${loanNumber} for Ksh ${amount.toLocaleString()} submitted. Under review.`;
}

// Loan Approved
export function buildLoanApprovedMessage(loanNumber: string, amount: number): string {
  return `Dear Customer,\nYour loan of Ksh ${amount.toLocaleString()} has been approved.\nLoan No: ${loanNumber}.`;
}

// Loan Disbursed
export function buildLoanDisbursedMessage(loanNumber: string, amount: number, dueDate: string): string {
  return `Loan ${loanNumber} disbursed: Ksh ${amount.toLocaleString()}. Due: ${dueDate}. Repay on time.`;
}

// Loan Declined
export function buildLoanDeclinedMessage(loanNumber: string, reason: string): string {
  return `Loan ${loanNumber} declined: ${reason}. Contact support for details.`;
}

// Repayment Received
export function buildRepaymentMessage(loanNumber: string, amount: number, balance: number): string {
  return `Dear Customer,\nYou have paid Ksh ${amount.toLocaleString()} to Vaultiline.\nLoan No: ${loanNumber}\nBalance: Ksh ${balance.toLocaleString()}`;
}

// Repayment Failed
export function buildRepaymentFailedMessage(loanNumber: string, amount: number): string {
  return `Repayment Ksh ${amount.toLocaleString()} for ${loanNumber} failed. Please retry or contact support.`;
}

// Payment Overdue / Penalty
export function buildOverdueMessage(loanNumber: string, daysOverdue: number, penalty: number): string {
  return `Payment overdue ${daysOverdue} days for ${loanNumber}. Penalty: Ksh ${penalty.toLocaleString()}. Pay now to avoid more fees.`;
}

// M-Pesa STK Push Prompt
export function buildStkPromptMessage(amount: number, reference: string): string {
  return `Enter M-Pesa PIN to pay Ksh ${amount.toLocaleString()} for ${reference}.`;
}

// Account Suspended
export function buildSuspensionMessage(reason: string): string {
  return `Your Vaultiline account has been suspended: ${reason}. Contact support.`;
}

// Password Reset
export function buildPasswordResetMessage(code: string): string {
  return `Your Vaultiline password reset code: ${code}. Expires in 10 minutes. Do not share.`;
}

// ---------------------------------------------------------------------------
// High-level SMS Functions for Business Events
// ---------------------------------------------------------------------------

export async function sendOtpSms(env: MpesaEnv, phone: string, code: string): Promise<SmsResult> {
  return sendSms(env, phone, buildOtpMessage(code));
}

export async function sendLoanApplicationSms(env: MpesaEnv, phone: string, loanNumber: string, amount: number): Promise<SmsResult> {
  return sendSms(env, phone, buildLoanApplicationMessage(loanNumber, amount));
}

export async function sendLoanApprovedSms(env: MpesaEnv, phone: string, loanNumber: string, amount: number): Promise<SmsResult> {
  return sendSms(env, phone, buildLoanApprovedMessage(loanNumber, amount));
}

export async function sendLoanDisbursedSms(env: MpesaEnv, phone: string, loanNumber: string, amount: number, dueDate: string): Promise<SmsResult> {
  return sendSms(env, phone, buildLoanDisbursedMessage(loanNumber, amount, dueDate));
}

export async function sendLoanDeclinedSms(env: MpesaEnv, phone: string, loanNumber: string, reason: string): Promise<SmsResult> {
  return sendSms(env, phone, buildLoanDeclinedMessage(loanNumber, reason));
}

export async function sendRepaymentSms(env: MpesaEnv, phone: string, loanNumber: string, amount: number, balance: number): Promise<SmsResult> {
  return sendSms(env, phone, buildRepaymentMessage(loanNumber, amount, balance));
}

export async function sendRepaymentFailedSms(env: MpesaEnv, phone: string, loanNumber: string, amount: number): Promise<SmsResult> {
  return sendSms(env, phone, buildRepaymentFailedMessage(loanNumber, amount));
}

export async function sendOverdueSms(env: MpesaEnv, phone: string, loanNumber: string, daysOverdue: number, penalty: number): Promise<SmsResult> {
  return sendSms(env, phone, buildOverdueMessage(loanNumber, daysOverdue, penalty));
}

export async function sendStkPromptSms(env: MpesaEnv, phone: string, amount: number, reference: string): Promise<SmsResult> {
  return sendSms(env, phone, buildStkPromptMessage(amount, reference));
}

export async function sendSuspensionSms(env: MpesaEnv, phone: string, reason: string): Promise<SmsResult> {
  return sendSms(env, phone, buildSuspensionMessage(reason));
}

export async function sendPasswordResetSms(env: MpesaEnv, phone: string, code: string): Promise<SmsResult> {
  return sendSms(env, phone, buildPasswordResetMessage(code));
}