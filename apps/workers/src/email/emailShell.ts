// apps/workers/src/email/emailShell.ts
//
// Shared branded wrapper (page background, white card, green header/footer
// bands) for every outbound notification email. Extracted so the digest
// emails (buildDigestHtml.ts) and the immediate-send email
// (sendEmailNotification.job.ts) render with the same identity instead of
// each hand-rolling its own copy — previously only the immediate-send email
// had this wrapper; the digest emails were a bare unstyled <div>.
export function renderEmailShell(args: {
  title: string;
  subtitle?: string;
  bodyHtml: string;
  footerHtml: string;
  width?: number;
}): string {
  const width = args.width ?? 600;
  return `
<!DOCTYPE html>
<html>
<body style="margin:0;background:#f4f5f7;font-family:Arial,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0">
<tr>
<td align="center" style="padding:24px;">
<table width="${width}" style="background:#ffffff;border-radius:8px;">
<tr>
<td style="padding:20px;border-bottom:1px solid #eee;">
<h2 style="margin:0;color:#2e7d32;">${args.title}</h2>
${args.subtitle ? `<p style="margin:6px 0 0;color:#555;font-size:14px;">${args.subtitle}</p>` : ''}
</td>
</tr>
<tr>
<td style="padding:20px;">
${args.bodyHtml}
</td>
</tr>
<tr>
<td style="padding:16px;color:#777;font-size:12px;border-top:1px solid #eee;">
${args.footerHtml}
</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>
`;
}
