import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

const {
  SMTP_HOST,
  SMTP_PORT,
  SMTP_USER,
  SMTP_PASS,
  EMAIL_FROM,
} = process.env;

let _transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (_transporter) return _transporter;

  if (!SMTP_HOST || !SMTP_PASS) {
    throw new Error('SMTP configuration missing (SMTP_HOST and SMTP_PASS are required)');
  }

  _transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT || 587),
    secure: false,              // MUST be false for port 587
    auth: {
      user: SMTP_USER || '9ec830001@smtp-brevo.com',
      pass: SMTP_PASS,
    },
    requireTLS: true,
    tls: {
      rejectUnauthorized: process.env.SMTP_TLS_REJECT_UNAUTHORIZED !== 'false',
    }
  });

  return _transporter;
}

export async function sendEmail(
  to: string,
  subject: string,
  html: string
) {
  await getTransporter().sendMail({
    from: EMAIL_FROM || 'Contract to Cozy <no-reply@contracttocozy.com>',
    to,
    subject,
    html,
  });
}
