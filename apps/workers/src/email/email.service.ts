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
  host: SMTP_HOST,
  port: Number(SMTP_PORT || 587),
  secure: false, // STARTTLS
  auth: {
    user: SMTP_USER || 'apikey', // Brevo requires "apikey"
    pass: SMTP_PASS,
  },
  pool: true,
  maxConnections: 5,
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
