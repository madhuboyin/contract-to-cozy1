// apps/backend/src/services/pdf/renderHomeReportPackPdf.ts
import { chromium } from 'playwright';
import { buildHomeReportPackHtml } from './templates/homeReportPackHtml';

type RenderOptions = {
  generatedAtIso?: string;
  propertyLabel?: string; // e.g. "123 Main St, Austin TX"
};

export async function renderHomeReportPackPdf(
  snapshot: any,
  opts: RenderOptions = {}
): Promise<Buffer> {
  const html = buildHomeReportPackHtml(snapshot);

  const generatedAt = opts.generatedAtIso || snapshot?.meta?.generatedAt || new Date().toISOString();
  const propertyLabel =
    opts.propertyLabel ||
    snapshot?.meta?.propertyLabel ||
    snapshot?.property?.addressLine1 ||
    'Home Report';

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();

    await page.setContent(html, { waitUntil: 'networkidle' });

    // Optional: ensure fonts/images are loaded
    await page.evaluateHandle('document.fonts.ready');

    const headerTemplate = `
      <div style="width:100%; font-size:9px; padding:0 12mm; color:#6b7280; display:flex; justify-content:space-between;">
        <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:70%;">
          Contract-to-Cozy • ${escapeHtml(propertyLabel)}
        </div>
        <div>${escapeHtml(new Date(generatedAt).toLocaleDateString('en-US'))}</div>
      </div>
    `;

    const footerTemplate = `
      <div style="width:100%; font-size:9px; padding:0 12mm; color:#6b7280; display:flex; justify-content:space-between;">
        <div>Confidential • For informational purposes</div>
        <div>
          Page <span class="pageNumber"></span> of <span class="totalPages"></span>
        </div>
      </div>
    `;

    const pdf = await page.pdf({
      format: 'Letter',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      margin: {
        top: '20mm',
        right: '15mm',
        bottom: '20mm',
        left: '15mm',
      },
    });

    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}

function escapeHtml(s: string) {
  return String(s)  
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
