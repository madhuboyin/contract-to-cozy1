// apps/backend/src/services/pdf/renderHomeReportPackPdf.ts
import { chromium } from 'playwright';
import { buildHomeReportPackHtml } from './templates/homeReportPackHtml';

export async function renderHomeReportPackPdf(snapshot: any): Promise<Buffer> {
  const html = buildHomeReportPackHtml(snapshot);

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'networkidle' });

    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      margin: { top: '20mm', right: '15mm', bottom: '20mm', left: '15mm' },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
