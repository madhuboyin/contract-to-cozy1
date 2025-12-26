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

/**
 * Brevo (Sendinblue) SMTP requires:
 * - STARTTLS on port 587
 * - AUTH only AFTER TLS
 * - Explicit TLS enforcement
 */
export const transporter = nodemailer.createTransport({
  host: SMTP_HOST,                           // smtp-relay.brevo.com
  port: Number(SMTP_PORT || 587),
  secure: false,                             // MUST be false for 587
  auth: {
    user: SMTP_USER || 'apikey',             // Brevo requires literal "apikey"
    pass: SMTP_PASS,                         // xsmtpsib-xxxx
  },

  /**
   * 🔑 CRITICAL BREVO FIXES
   */
  requireTLS: true,                          // Force STARTTLS before AUTH
  tls: {
    rejectUnauthorized: false,               // Brevo shared IP certs
  },

  /**
   * Connection pooling (good, keep it)
   */
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
});

export async function sendEmail(
  to: string,
  subject: string,
  html: string
) {
  await transporter.sendMail({
    from: EMAIL_FROM || 'Contract 2 Cozy <no-reply@contracttocozy.com>',
    to,
    subject,
    html,
  });
}
