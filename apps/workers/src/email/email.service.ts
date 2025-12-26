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
  secure: false,              // ✅ MUST be false for port 587
  auth: {
    user: SMTP_USER || '9ec830001@smtp-brevo.com',
    pass: SMTP_PASS,          // xkeysib-...
  },
  requireTLS: true,           // ✅ Explicit STARTTLS
  tls: {
    rejectUnauthorized: false // ✅ avoids cert edge cases
  }
});

export async function sendEmail(
  to: string,
  subject: string,
  html: string
) {
  await transporter.sendMail({
    from: EMAIL_FROM || 'Contract to Cozy <no-reply@contracttocozy.com>',
    to,
    subject,
    html,
  });
}
