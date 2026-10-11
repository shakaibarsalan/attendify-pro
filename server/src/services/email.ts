import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp-relay.brevo.com',
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  // Fail fast instead of hanging if the SMTP relay is unreachable from the host.
  connectionTimeout: 10_000,
  greetingTimeout: 10_000,
  socketTimeout: 15_000,
});

async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
    console.log('[Email] SMTP not configured — skipping:', subject, '→', to);
    return false;
  }
  await transporter.sendMail({
    // The SMTP login (SMTP_USER) is a Brevo relay identifier, not a valid
    // sender. The From must be a verified sender / authenticated domain, set
    // via SMTP_FROM.
    from: `"${process.env.SMTP_FROM_NAME || 'Attendify'}" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
    to,
    subject,
    html,
  });
  return true;
}

async function sendPasswordReset(to: string, _token: string, resetUrl: string) {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #4F46E5; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="color: #fff; margin: 0; font-size: 24px;">Attendify</h1>
      </div>
      <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 32px; border-radius: 0 0 8px 8px;">
        <h2 style="color: #111827; margin-top: 0;">Password Reset Request</h2>
        <p style="color: #374151;">You requested a password reset for your Attendify account.</p>
        <p style="color: #374151;">Click the button below to reset your password. This link expires in <strong>1 hour</strong>.</p>
        <div style="text-align: center; margin: 32px 0;">
          <a href="${resetUrl}" style="background-color: #4F46E5; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Reset Password</a>
        </div>
        <p style="color: #6b7280; font-size: 13px;">If you did not request this, you can safely ignore this email.</p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">Attendify Smart Attendance System</p>
      </div>
    </div>
  `;
  await sendMail(to, 'Attendify — Reset Your Password', html);
}

async function sendFraudAlertToOrgAdmin(to: string, alert: { type: string; message: string; severity: string; studentName?: string }) {
  const severityColor = alert.severity === 'critical' ? '#DC2626' : alert.severity === 'high' ? '#EA580C' : '#CA8A04';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: #DC2626;">⚠️ Fraud Alert — ${alert.type}</h2>
      <div style="border-left: 4px solid ${severityColor}; padding-left: 12px; margin: 16px 0;">
        <p><strong>Severity:</strong> <span style="color: ${severityColor}; text-transform: uppercase;">${alert.severity}</span></p>
        ${alert.studentName ? `<p><strong>Student:</strong> ${alert.studentName}</p>` : ''}
        <p><strong>Details:</strong> ${alert.message}</p>
      </div>
      <p style="color: #666;">Please review this alert in the Attendify admin dashboard.</p>
    </div>
  `;
  await sendMail(to, `Attendify — Fraud Alert [${alert.severity.toUpperCase()}]`, html);
}

async function sendWelcome(to: string, loginEmail: string, tempPassword: string): Promise<boolean> {
  const loginUrl = (process.env.FRONTEND_URL || 'https://attendify.pro').replace(/\/$/, '') + '/login';
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #4F46E5; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="color: #fff; margin: 0; font-size: 24px;">Welcome to Attendify</h1>
      </div>
      <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 32px; border-radius: 0 0 8px 8px;">
        <p style="color: #374151;">Your account has been created. Here are your login credentials:</p>
        <div style="background-color: #F3F4F6; padding: 16px; border-radius: 6px; margin: 16px 0;">
          <p style="margin: 4px 0;"><strong>Login email:</strong> ${loginEmail}</p>
          <p style="margin: 4px 0;"><strong>Temporary password:</strong> <code style="background: #E5E7EB; padding: 2px 6px; border-radius: 3px;">${tempPassword}</code></p>
        </div>
        <div style="text-align: center; margin: 24px 0;">
          <a href="${loginUrl}" style="background-color: #4F46E5; color: #ffffff; padding: 12px 26px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Log in</a>
        </div>
        <p style="color: #DC2626; font-weight: 600;">For your security, please log in and change this temporary password right away.</p>
      </div>
    </div>
  `;
  return sendMail(to, 'Welcome to Attendify — Your Login Details', html);
}

async function sendDemoInvite(
  to: string,
  contactName: string,
  organizationName: string,
  schedulingUrl: string,
  confirmedSlot?: string | Date | null,
) {
  const slotText = confirmedSlot
    ? new Date(confirmedSlot).toLocaleString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
      })
    : null;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #4F46E5; padding: 20px; border-radius: 8px 8px 0 0;">
        <h1 style="color: #fff; margin: 0; font-size: 24px;">Attendify</h1>
      </div>
      <div style="background: #fff; border: 1px solid #e5e7eb; border-top: none; padding: 32px; border-radius: 0 0 8px 8px;">
        <h2 style="color: #111827; margin-top: 0;">${slotText ? 'Your Attendify demo is confirmed' : "Let's schedule your Attendify demo"}</h2>
        <p style="color: #374151;">Hi ${contactName || 'there'},</p>
        <p style="color: #374151;">Thanks for your interest in Attendify for <strong>${organizationName}</strong>. We'd love to walk you through the platform live and answer your questions.</p>
        ${slotText ? `
        <div style="background:#EEF2FF; border:1px solid #C7D2FE; border-radius:8px; padding:16px; margin:20px 0;">
          <p style="margin:0; color:#4338CA;"><strong>Proposed time:</strong></p>
          <p style="margin:6px 0 0; color:#111827; font-size:16px; font-weight:600;">${slotText} (30 minutes)</p>
        </div>
        <p style="color: #374151;">Please confirm and add this meeting to your calendar using the link below. If this time no longer works, you can pick another slot there too:</p>
        ` : `<p style="color: #374151;">Pick a time that works for you using the link below:</p>`}
        <div style="text-align: center; margin: 32px 0;">
          <a href="${schedulingUrl}" style="background-color: #4F46E5; color: #ffffff; padding: 14px 28px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">${slotText ? 'Confirm on Calendly' : 'Book a Demo'}</a>
        </div>
        <p style="color: #6b7280; font-size: 13px;">If the button doesn't work, copy this link into your browser:<br/><span style="color:#4F46E5;">${schedulingUrl}</span></p>
        <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        <p style="color: #9ca3af; font-size: 12px; margin: 0;">Attendify Smart Attendance System</p>
      </div>
    </div>
  `;
  await sendMail(to, slotText ? 'Attendify — Your Demo is Scheduled' : 'Attendify — Schedule Your Demo', html);
}

// Operational alert (service degraded / recovered) to the ops inbox. Reuses the
// same SMTP relay. Recipient comes from ALERT_EMAIL (falls back to SMTP_FROM).
async function sendOpsAlert(subject: string, lines: string[], color = '#DC2626') {
  const to = process.env.ALERT_EMAIL || process.env.SMTP_FROM || '';
  if (!to) {
    console.warn('[alert] ALERT_EMAIL/SMTP_FROM not set — cannot send ops alert:', subject);
    return;
  }
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <h2 style="color: ${color}; margin-top: 0;">Attendify — ${subject}</h2>
      <ul style="color: #374151; line-height: 1.6;">
        ${lines.map((l) => `<li>${l}</li>`).join('')}
      </ul>
      <p style="color: #6b7280; font-size: 13px;">Sent automatically by the Attendify health monitor (${new Date().toISOString()}).</p>
    </div>
  `;
  await sendMail(to, `Attendify ALERT — ${subject}`, html);
}

// Escape user-supplied text so a lead's free-text cannot inject HTML into the email.
function esc(v: unknown): string {
  return String(v ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export interface OrgLead {
  requestType?: string;
  organizationName?: string;
  organizationCode?: string;
  domain?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string;
  expectedStudents?: number;
  message?: string;
  createdAt?: string | Date;
}

// Notify the owner / sales inboxes the moment a "Get Started" or "Book a Demo"
// lead is submitted on either landing site. Recipients come from
// LEAD_NOTIFY_EMAILS (comma-separated); when unset, no notification is sent.
// Non-fatal by design: callers fire-and-forget so a mail hiccup never blocks
// the visitor's submission.
async function sendLeadNotification(lead: OrgLead): Promise<boolean> {
  const recipients = (
    process.env.LEAD_NOTIFY_EMAILS || ''
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .join(',');
  if (!recipients) return false;

  const kind = lead.requestType === 'signup' ? 'Get Started (sign-up)' : 'Book a Demo';
  const row = (label: string, value: unknown) =>
    value || value === 0
      ? `<tr><td style="padding:6px 12px;color:#64748b;font-weight:600;white-space:nowrap;vertical-align:top">${esc(
          label
        )}</td><td style="padding:6px 12px;color:#0f172a">${esc(value).replace(/\n/g, '<br>')}</td></tr>`
      : '';

  const html = `
    <div style="font-family:Arial,Helvetica,sans-serif;max-width:600px;margin:0 auto">
      <h2 style="color:#0d9488;margin:0 0 4px">New ${esc(kind)} lead</h2>
      <p style="color:#64748b;margin:0 0 16px">A new lead just came in from the Attendify website.</p>
      <table style="border-collapse:collapse;width:100%;background:#f8fafc;border-radius:8px;overflow:hidden">
        ${row('Organization', lead.organizationName)}
        ${row('Org Code', lead.organizationCode)}
        ${row('Email Domain', lead.domain)}
        ${row('Contact Name', lead.contactName)}
        ${row('Contact Email', lead.contactEmail)}
        ${row('Phone', lead.contactPhone)}
        ${row('Expected Size', lead.expectedStudents)}
        ${row('Message', lead.message)}
        ${row('Received', lead.createdAt ? new Date(lead.createdAt).toLocaleString() : new Date().toLocaleString())}
      </table>
      <p style="color:#94a3b8;font-size:12px;margin-top:16px">Reply directly to ${esc(
        lead.contactEmail || 'the lead'
      )} to follow up.</p>
    </div>`;

  return sendMail(
    recipients,
    `New ${kind} lead: ${lead.organizationName || lead.contactName || 'Attendify'}`,
    html
  );
}

export const emailService = {
  sendPasswordReset,
  sendFraudAlertToOrgAdmin,
  sendWelcome,
  sendDemoInvite,
  sendOpsAlert,
  sendLeadNotification,
};
