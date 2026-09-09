// ---------------------------------------------------------------------------
// Brevo Email Service - Production Ready
// ---------------------------------------------------------------------------
// Handles all transactional emails: OTP, welcome, loan events, repayment,
// overdue, suspension, password reset.
// ---------------------------------------------------------------------------

export interface BrevoEnv {
  BREVO_API_KEY: string;
  EMAIL_FROM: string;
  DB: D1Database;
}

export interface BrevoResult {
  success: boolean;
  messageId?: string;
  error?: string;
}

function generateId(): string {
  return crypto.randomUUID();
}

async function logEmail(
  db: D1Database,
  userId: string | undefined,
  email: string,
  subject: string,
  status: string,
  messageId?: string
): Promise<void> {
  try {
    await db.prepare(
      `INSERT INTO email_logs (id, user_id, email, subject, status, message_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
      .bind(generateId(), userId || null, email, subject, status, messageId || null, new Date().toISOString())
      .run();
  } catch (err) {
    console.error("[EMAIL] Failed to log email:", err);
  }
}

async function sendBrevoEmail(
  env: BrevoEnv,
  to: string | string[],
  subject: string,
  htmlContent: string,
  userId?: string
): Promise<BrevoResult> {
  const apiKey = env.BREVO_API_KEY;
  const from = env.EMAIL_FROM || "noreply@example.com";
  const senderName = "Vaultiline";

  if (!apiKey) {
    console.log(`[EMAIL] Dev mode - To: ${JSON.stringify(to)} | Subject: ${subject}`);
    return { success: true, messageId: "dev-mode" };
  }

  try {
    const recipients = Array.isArray(to) ? to : [to];
    const body = {
      sender: { name: senderName, email: from },
      to: recipients.map((email) => ({ email })),
      subject,
      htmlContent,
    };

    const response = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    const data = (await response.json()) as Record<string, unknown>;

    if (!response.ok) {
      console.error("[EMAIL] API error:", data);
      if (userId) {
        await logEmail(env.DB, userId, Array.isArray(to) ? to[0] : to, subject, "failed");
      }
      return { success: false, error: (data.message as string) || `HTTP ${response.status}` };
    }

    const messageId = (data.messageId as string) || undefined;
    if (userId) {
      await logEmail(env.DB, userId, Array.isArray(to) ? to[0] : to, subject, "sent", messageId);
    }
    return { success: true, messageId };
  } catch (err) {
    console.error("[EMAIL] Exception:", err);
    if (userId) {
      await logEmail(env.DB, userId, Array.isArray(to) ? to[0] : to, subject, "failed");
    }
    return { success: false, error: err instanceof Error ? err.message : "Unknown error" };
  }
}

// ---------------------------------------------------------------------------
// Email Templates
// ---------------------------------------------------------------------------

export function buildOtpEmail(code: string): { subject: string; html: string } {
  return {
    subject: "Your Vaultiline Verification Code",
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937;">
        <h2 style="color: #4f46e5; margin-bottom: 8px;">Vaultiline</h2>
        <p>Your verification code is:</p>
        <div style="background: #eef2ff; border: 2px dashed #4f46e5; border-radius: 12px; padding: 16px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #4f46e5; margin: 16px 0;">
          ${code}
        </div>
        <p style="color: #6b7280; font-size: 14px;">This code expires in <strong>5 minutes</strong>. Do not share it with anyone.</p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">If you did not request this code, please ignore this email.</p>
      </div>
    `,
  };
}

export function buildWelcomeEmail(name: string): { subject: string; html: string } {
  return {
    subject: "Welcome to Vaultiline - Apply for Loans Today",
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937;">
        <h2 style="color: #4f46e5; margin-bottom: 8px;">Welcome to Vaultiline, ${name}!</h2>
        <p>We are excited to have you on board. Vaultiline provides accessible micro-loans to help you grow your business and achieve your goals.</p>
        <h3 style="color: #4f46e5; margin-top: 24px;">Getting Started</h3>
        <ul style="line-height: 1.8;">
          <li>Complete your profile and qualification assessment</li>
          <li>Apply for a loan in just a few steps</li>
          <li>Track your application status in real-time</li>
          <li>Receive funds directly to your M-Pesa</li>
        </ul>
        <p style="margin-top: 24px;">Ready to apply? Log in to the app and tap <strong>"Apply for Loan"</strong> to get started.</p>
        <div style="background: #eef2ff; border-radius: 12px; padding: 16px; margin-top: 24px; text-align: center;">
          <p style="margin: 0; color: #4f46e5; font-weight: 600;">Need help? Contact our support team anytime.</p>
        </div>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">This is a test email from the Vaultiline platform.</p>
      </div>
    `,
  };
}

export function buildLoanApprovedEmail(loanNumber: string, amount: number): { subject: string; html: string } {
  return {
    subject: `Loan ${loanNumber} Approved`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937;">
        <h2 style="color: #10b981; margin-bottom: 8px;">Loan Approved!</h2>
        <p>Great news! Your loan application has been approved.</p>
        <div style="background: #ecfdf5; border-radius: 12px; padding: 16px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Loan Number:</strong> ${loanNumber}</p>
          <p style="margin: 4px 0;"><strong>Amount:</strong> Ksh ${amount.toLocaleString()}</p>
        </div>
        <p>Our team will contact you shortly with disbursement details. Funds will be sent directly to your M-Pesa.</p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">This is a test email from the Vaultiline platform.</p>
      </div>
    `,
  };
}

export function buildLoanDeclinedEmail(loanNumber: string, reason: string): { subject: string; html: string } {
  return {
    subject: `Loan ${loanNumber} Update`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937;">
        <h2 style="color: #ef4444; margin-bottom: 8px;">Loan Application Update</h2>
        <p>We regret to inform you that your loan application <strong>${loanNumber}</strong> has not been approved at this time.</p>
        <div style="background: #fef2f2; border-radius: 12px; padding: 16px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Reason:</strong> ${reason}</p>
        </div>
        <p>You may reapply after addressing the concerns above. If you have questions, please contact our support team.</p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">This is a test email from the Vaultiline platform.</p>
      </div>
    `,
  };
}

export function buildLoanDisbursedEmail(loanNumber: string, amount: number, dueDate: string): { subject: string; html: string } {
  return {
    subject: `Loan ${loanNumber} Disbursed`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937;">
        <h2 style="color: #10b981; margin-bottom: 8px;">Loan Disbursed Successfully</h2>
        <p>Your loan has been disbursed to your M-Pesa account.</p>
        <div style="background: #ecfdf5; border-radius: 12px; padding: 16px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Loan Number:</strong> ${loanNumber}</p>
          <p style="margin: 4px 0;"><strong>Amount:</strong> Ksh ${amount.toLocaleString()}</p>
          <p style="margin: 4px 0;"><strong>Due Date:</strong> ${dueDate}</p>
        </div>
        <p>Please make timely repayments to maintain a good credit score. You can make repayments via the app.</p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">This is a test email from the Vaultiline platform.</p>
      </div>
    `,
  };
}

export function buildRepaymentEmail(
  loanNumber: string,
  amount: number,
  balance: number,
  nextPaymentDate: string
): { subject: string; html: string } {
  return {
    subject: `Repayment Confirmed - ${loanNumber}`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937;">
        <h2 style="color: #10b981; margin-bottom: 8px;">Repayment Received</h2>
        <p>Thank you for your repayment. Here are the details:</p>
        <div style="background: #ecfdf5; border-radius: 12px; padding: 16px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Loan Number:</strong> ${loanNumber}</p>
          <p style="margin: 4px 0;"><strong>Amount Paid:</strong> Ksh ${amount.toLocaleString()}</p>
          <p style="margin: 4px 0;"><strong>Remaining Balance:</strong> Ksh ${balance.toLocaleString()}</p>
          <p style="margin: 4px 0;"><strong>Next Payment:</strong> ${nextPaymentDate}</p>
        </div>
        <p>Keep up the good work! On-time repayments improve your credit score.</p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">This is a test email from the Vaultiline platform.</p>
      </div>
    `,
  };
}

export function buildOverdueEmail(
  loanNumber: string,
  daysOverdue: number,
  penalty: number
): { subject: string; html: string } {
  return {
    subject: `Payment Overdue - ${loanNumber}`,
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937;">
        <h2 style="color: #ef4444; margin-bottom: 8px;">Payment Overdue</h2>
        <p>Your loan payment is overdue. Please make the payment as soon as possible to avoid additional penalties.</p>
        <div style="background: #fef2f2; border-radius: 12px; padding: 16px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Loan Number:</strong> ${loanNumber}</p>
          <p style="margin: 4px 0;"><strong>Days Overdue:</strong> ${daysOverdue}</p>
          <p style="margin: 4px 0;"><strong>Penalty:</strong> Ksh ${penalty.toLocaleString()}</p>
        </div>
        <p>Log in to the app to make your payment now.</p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">This is a test email from the Vaultiline platform.</p>
      </div>
    `,
  };
}

export function buildSuspensionEmail(reason: string): { subject: string; html: string } {
  return {
    subject: "Account Suspended - Vaultiline",
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937;">
        <h2 style="color: #ef4444; margin-bottom: 8px;">Account Suspended</h2>
        <p>Your Vaultiline account has been suspended.</p>
        <div style="background: #fef2f2; border-radius: 12px; padding: 16px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Reason:</strong> ${reason}</p>
        </div>
        <p>Please contact our support team if you believe this is an error or to appeal the suspension.</p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">This is a test email from the Vaultiline platform.</p>
      </div>
    `,
  };
}

export function buildPasswordResetEmail(code: string): { subject: string; html: string } {
  return {
    subject: "Password Reset - Vaultiline",
    html: `
      <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937;">
        <h2 style="color: #4f46e5; margin-bottom: 8px;">Password Reset Request</h2>
        <p>Use the following code to reset your password:</p>
        <div style="background: #eef2ff; border: 2px dashed #4f46e5; border-radius: 12px; padding: 16px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #4f46e5; margin: 16px 0;">
          ${code}
        </div>
        <p style="color: #6b7280; font-size: 14px;">This code expires in <strong>10 minutes</strong>. Do not share it with anyone.</p>
        <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">If you did not request a password reset, please ignore this email.</p>
      </div>
    `,
  };
}

// ---------------------------------------------------------------------------
// High-level Email Functions
// ---------------------------------------------------------------------------

export async function sendOtpEmail(env: BrevoEnv, email: string, code: string): Promise<BrevoResult> {
  const { subject, html } = buildOtpEmail(code);
  return sendBrevoEmail(env, email, subject, html);
}

export async function sendWelcomeEmail(env: BrevoEnv, email: string, name: string): Promise<BrevoResult> {
  const { subject, html } = buildWelcomeEmail(name);
  return sendBrevoEmail(env, email, subject, html);
}

export async function sendLoanApprovedEmail(
  env: BrevoEnv,
  email: string,
  loanNumber: string,
  amount: number
): Promise<BrevoResult> {
  const { subject, html } = buildLoanApprovedEmail(loanNumber, amount);
  return sendBrevoEmail(env, email, subject, html);
}

export async function sendLoanDeclinedEmail(
  env: BrevoEnv,
  email: string,
  loanNumber: string,
  reason: string
): Promise<BrevoResult> {
  const { subject, html } = buildLoanDeclinedEmail(loanNumber, reason);
  return sendBrevoEmail(env, email, subject, html);
}

export async function sendLoanDisbursedEmail(
  env: BrevoEnv,
  email: string,
  loanNumber: string,
  amount: number,
  dueDate: string
): Promise<BrevoResult> {
  const { subject, html } = buildLoanDisbursedEmail(loanNumber, amount, dueDate);
  return sendBrevoEmail(env, email, subject, html);
}

export async function sendRepaymentEmail(
  env: BrevoEnv,
  email: string,
  loanNumber: string,
  amount: number,
  balance: number,
  nextPaymentDate: string
): Promise<BrevoResult> {
  const { subject, html } = buildRepaymentEmail(loanNumber, amount, balance, nextPaymentDate);
  return sendBrevoEmail(env, email, subject, html);
}

export async function sendOverdueEmail(
  env: BrevoEnv,
  email: string,
  loanNumber: string,
  daysOverdue: number,
  penalty: number
): Promise<BrevoResult> {
  const { subject, html } = buildOverdueEmail(loanNumber, daysOverdue, penalty);
  return sendBrevoEmail(env, email, subject, html);
}

export async function sendSuspensionEmail(env: BrevoEnv, email: string, reason: string): Promise<BrevoResult> {
  const { subject, html } = buildSuspensionEmail(reason);
  return sendBrevoEmail(env, email, subject, html);
}

export async function sendPasswordResetEmail(env: BrevoEnv, email: string, code: string): Promise<BrevoResult> {
  const { subject, html } = buildPasswordResetEmail(code);
  return sendBrevoEmail(env, email, subject, html);
}

export async function sendTestEmail(
  env: BrevoEnv,
  to: string | string[],
  subject?: string
): Promise<BrevoResult> {
  const recipients = Array.isArray(to) ? to : [to];
  const testSubject = subject || "Test Email - Vaultiline Platform";
  const html = `
    <div style="font-family: Inter, Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; color: #1f2937;">
      <h2 style="color: #4f46e5; margin-bottom: 8px;">Test Email - Vaultiline</h2>
      <p>This is a <strong>test email</strong> from the Vaultiline platform.</p>
      <p>If you received this, Brevo email delivery is working correctly.</p>
      <div style="background: #eef2ff; border-radius: 12px; padding: 16px; margin-top: 16px;">
        <p style="margin: 4px 0;"><strong>Sent to:</strong> ${recipients.join(", ")}</p>
        <p style="margin: 4px 0;"><strong>Timestamp:</strong> ${new Date().toISOString()}</p>
      </div>
      <p style="color: #9ca3af; font-size: 12px; margin-top: 24px;">Welcome to Vaultiline — apply for loans and grow your business.</p>
    </div>
  `;
  return sendBrevoEmail(env, to, testSubject, html);
}
