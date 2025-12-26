// apps/workers/src/email/email.service.ts

import nodemailer from 'nodemailer';

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  EMAIL_FROM,
} = process.env;

if (!SMTP_HOST || !SMTP_PASS) {
  throw new Error('SMTP configuration missing');
}

export const transporter = nodemailer.createTransport({
  host: SMTP_HOST,                       // smtp-relay.brevo.com
  port: Number(SMTP_PORT || 587),        // 587
  secure: false,                         // MUST be false for STARTTLS
  auth: {
    user: SMTP_USER || 'apikey',         // MUST be literally "apikey"
    pass: SMTP_PASS,                     // xsmtpsib-****
  },
  tls: {
    rejectUnauthorized: false,           // ✅ REQUIRED for Brevo
  },
  pool: true,
  maxConnections: 3,
  maxMessages: 50,
});

export async function sendEmail(
  to: string,
  subject: string,
  html: string
) {
  await transporter.sendMail({
    from: EMAIL_FROM || 'no-reply@contracttocozy.com',
    to,
    subject,
    html,
  });
}
