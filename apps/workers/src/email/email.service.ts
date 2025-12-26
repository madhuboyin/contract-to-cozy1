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
  host: SMTP_HOST, // smtp-relay.brevo.com
  port: Number(SMTP_PORT || 587),
  secure: false,              // MUST be false for 587
  requireTLS: true,           // 🔴 IMPORTANT
  auth: {
    user: 'apikey',           // 🔴 MUST be literal
    pass: SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false,
    servername: SMTP_HOST,
    minVersion: 'TLSv1.2',    // 🔴 IMPORTANT for Brevo
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
