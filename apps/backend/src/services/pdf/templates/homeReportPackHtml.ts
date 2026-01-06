// apps/backend/src/services/pdf/templates/homeReportPackHtml.ts
function moneyFromCents(cents?: number | null) {
  if (cents == null) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
}

function fmtDate(d?: string | Date | null) {
  if (!d) return '—';
  const dt = typeof d === 'string' ? new Date(d) : d;
  if (Number.isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('en-US');
}

function safe(s?: string | null) {
  return (s ?? '').toString().replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function sumCents(items: any[], key: string) {
  return items.reduce((acc, it) => acc + (Number(it?.[key]) || 0), 0);
}

export function buildHomeReportPackHtml(snapshot: any) {
  const meta = snapshot.meta ?? {};
  const p = snapshot.property ?? {};

  const address = [p.address, `${p.city ?? ''} ${p.state ?? ''} ${p.zipCode ?? ''}`]
    .filter(Boolean)
    .join(', ');

  const inventoryItems = snapshot.inventory?.items ?? [];
  const tasks = snapshot.maintenance?.tasks ?? [];
  const policies = snapshot.coverage?.insurancePolicies ?? [];
  const warranties = snapshot.coverage?.warranties ?? [];

  const totalReplacementCents = sumCents(inventoryItems, 'replacementCostCents');
  const openTasks = tasks.filter((t: any) => (t.status ?? '').toString().toUpperCase() !== 'COMPLETED');
  const highRiskTasks = tasks.filter((t: any) => (t.riskLevel ?? '').toString().toUpperCase().includes('HIGH'));

  const generatedAt = meta.generatedAt ? new Date(meta.generatedAt) : new Date();

  const toc = [
    { id: 'toc', label: 'Table of Contents' },
    { id: 'summary', label: 'Home Summary' },
    { id: 'inventory', label: 'Inventory' },
    { id: 'maintenance', label: 'Maintenance Outlook' },
    { id: 'coverage', label: 'Coverage Snapshot' },
    { id: 'disclaimer', label: 'Disclaimers' },
  ];

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>Home Report Pack</title>
  <style>
    :root {
      --text: #111827;
      --muted: #6b7280;
      --border: #e5e7eb;
      --bg: #ffffff;
      --bg-soft: #f9fafb;
      --accent: #0ea5e9; /* teal-ish */
    }

    * { box-sizing: border-box; }
    html, body { padding: 0; margin: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif;
      color: var(--text);
      background: var(--bg);
      line-height: 1.35;
    }

    /* Print improvements */
    @page { margin: 0; }
    .page {
      padding: 18mm 15mm 18mm 15mm; /* margins handled by Playwright; this keeps spacing consistent in HTML */
    }

    a { color: inherit; text-decoration: none; }
    .muted { color: var(--muted); }
    .hr { height: 1px; background: var(--border); margin: 14px 0; }

    .h1 { font-size: 24px; font-weight: 800; letter-spacing: -0.02em; margin: 0; }
    .h2 { font-size: 14px; font-weight: 800; margin: 0 0 8px 0; }
    .h3 { font-size: 12px; font-weight: 800; margin: 0 0 6px 0; }

    .card {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 12px;
      background: #fff;
    }

    .chip {
      display: inline-block;
      font-size: 11px;
      padding: 2px 8px;
      border-radius: 999px;
      background: var(--bg-soft);
      border: 1px solid var(--border);
      color: #374151;
    }

    .grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
    .grid3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; }

    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    thead th {
      font-size: 11px;
      color: #374151;
      background: var(--bg-soft);
      border-bottom: 1px solid var(--border);
      padding: 8px;
      text-align: left;
    }
    tbody td {
      font-size: 11px;
      border-bottom: 1px solid #f1f5f9;
      padding: 8px;
      vertical-align: top;
      word-break: break-word;
    }
    tbody tr:nth-child(even) td { background: #fcfcfd; }

    .section {
      margin-top: 14px;
      page-break-inside: avoid;
    }

    .sectionTitle {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 6px;
    }

    .kpi {
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 10px;
      background: var(--bg-soft);
    }
    .kpi .label { font-size: 10px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.06em; }
    .kpi .value { font-size: 16px; font-weight: 800; margin-top: 4px; }

    /* Page breaks */
    .break-before { page-break-before: always; }
    .avoid-break { page-break-inside: avoid; }

    /* TOC */
    .tocItem { display:flex; justify-content:space-between; padding: 8px 0; border-bottom: 1px dashed #e5e7eb; font-size: 12px; }
    .tocItem:last-child { border-bottom: none; }
    .tocDot { color: #9ca3af; margin: 0 6px; flex:1; border-bottom: 1px dotted #d1d5db; transform: translateY(-4px); }
  </style>
</head>

<body>

  <!-- COVER -->
  <div class="page">
    <div class="card avoid-break" style="padding:16px;">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:12px;">
        <div>
          <div class="h1">Home Report Pack</div>
          <div class="muted" style="margin-top:6px; font-size:12px;">${safe(address) || '—'}</div>
          <div class="muted" style="margin-top:6px; font-size:12px;">
            Generated: ${safe(generatedAt.toLocaleString('en-US'))}
          </div>
        </div>
        <div class="chip" style="border-color: rgba(14,165,233,0.35); background: rgba(14,165,233,0.08); color:#0c4a6e;">
          Contract-to-Cozy
        </div>
      </div>

      <div class="hr"></div>

      <div class="grid3">
        <div class="kpi">
          <div class="label">Inventory Items</div>
          <div class="value">${inventoryItems.length}</div>
          <div class="muted" style="font-size:11px; margin-top:4px;">Replacement total: ${moneyFromCents(totalReplacementCents)}</div>
        </div>

        <div class="kpi">
          <div class="label">Open Maintenance</div>
          <div class="value">${openTasks.length}</div>
          <div class="muted" style="font-size:11px; margin-top:4px;">High-risk tasks: ${highRiskTasks.length}</div>
        </div>

        <div class="kpi">
          <div class="label">Coverage On File</div>
          <div class="value">${policies.length + warranties.length}</div>
          <div class="muted" style="font-size:11px; margin-top:4px;">Insurance: ${policies.length} • Warranties: ${warranties.length}</div>
        </div>
      </div>

      <div class="muted" style="margin-top:12px; font-size:11px;">
        Use this report for insurance applications, claims, resale packets, estate planning, and HOA/lender requests.
      </div>
    </div>
  </div>

  <!-- TOC -->
  <div class="page break-before" id="toc">
    <div class="h2">Table of Contents</div>
    <div class="card">
      ${toc
        .filter((t) => t.id !== 'toc')
        .map(
          (t) => `
        <div class="tocItem">
          <a href="#${t.id}" style="font-weight:700;">${safe(t.label)}</a>
          <span class="tocDot"></span>
          <span class="muted"> </span>
        </div>`
        )
        .join('')}
    </div>

    <div class="muted" style="margin-top:10px; font-size:11px;">
      Note: Page numbers appear in the footer. TOC entries are clickable.
    </div>
  </div>

  <!-- SUMMARY -->
  <div class="page break-before" id="summary">
    <div class="sectionTitle">
      <div class="h2">Home Summary</div>
      <div class="chip">${safe(p.propertyType ?? 'Property')}</div>
    </div>

    <div class="grid2">
      <div class="card">
        <div class="h3">Property</div>
        <div class="muted" style="font-size:11px;">
          ${safe(address) || '—'}<br/>
          Year built: ${safe(p.yearBuilt?.toString() ?? '—')}<br/>
          Living area: ${safe(p.livingAreaSqft?.toString() ?? '—')} sqft
        </div>
      </div>

      <div class="card">
        <div class="h3">Highlights</div>
        <div style="font-size:11px;">
          <div>• Inventory replacement total: <b>${moneyFromCents(totalReplacementCents)}</b></div>
          <div>• Open maintenance tasks: <b>${openTasks.length}</b></div>
          <div>• Coverage records on file: <b>${policies.length + warranties.length}</b></div>
        </div>
        <div class="muted" style="margin-top:8px; font-size:10px;">
          Tip: Keep inventory replacement values updated for smoother claims.
        </div>
      </div>
    </div>
  </div>

  <!-- INVENTORY -->
  <div class="page break-before" id="inventory">
    <div class="sectionTitle">
      <div class="h2">Inventory</div>
      <div class="muted" style="font-size:11px;">
        ${inventoryItems.length} items • Replacement total: ${moneyFromCents(totalReplacementCents)}
      </div>
    </div>

    <div class="card">
      <table>
        <thead>
          <tr>
            <th style="width:34%;">Item</th>
            <th style="width:16%;">Room</th>
            <th style="width:16%;">Category</th>
            <th style="width:17%;">Purchase</th>
            <th style="width:17%;">Replacement</th>
          </tr>
        </thead>
        <tbody>
          ${
            inventoryItems.length === 0
              ? `<tr><td colspan="5" class="muted">No inventory items on file.</td></tr>`
              : inventoryItems.slice(0, 250).map((i: any) => `
                <tr>
                  <td>
                    <div style="font-weight:800;">${safe(i.name)}</div>
                    <div class="muted" style="font-size:10px;">
                      ${safe([i.brand, i.modelNumber, i.serialNumber].filter(Boolean).join(' • '))}
                    </div>
                  </td>
                  <td>${safe(i.room?.name ?? '—')}</td>
                  <td><span class="chip">${safe(i.category ?? '—')}</span></td>
                  <td>${moneyFromCents(i.purchaseCostCents)}</td>
                  <td>${moneyFromCents(i.replacementCostCents)}</td>
                </tr>
              `).join('')
          }
        </tbody>
      </table>

      ${inventoryItems.length > 250 ? `<div class="muted" style="margin-top:8px; font-size:10px;">Showing first 250 items.</div>` : ``}
    </div>
  </div>

  <!-- MAINTENANCE -->
  <div class="page break-before" id="maintenance">
    <div class="sectionTitle">
      <div class="h2">Maintenance Outlook</div>
      <div class="muted" style="font-size:11px;">
        ${tasks.length} tasks • Open: ${openTasks.length} • High-risk: ${highRiskTasks.length}
      </div>
    </div>

    <div class="card">
      <table>
        <thead>
          <tr>
            <th style="width:40%;">Task</th>
            <th style="width:14%;">Status</th>
            <th style="width:14%;">Priority</th>
            <th style="width:16%;">Next Due</th>
            <th style="width:16%;">Last Done</th>
          </tr>
        </thead>
        <tbody>
          ${
            tasks.length === 0
              ? `<tr><td colspan="5" class="muted">No maintenance tasks on file.</td></tr>`
              : tasks.slice(0, 250).map((t: any) => `
                <tr>
                  <td>
                    <div style="font-weight:800;">${safe(t.title)}</div>
                    <div class="muted" style="font-size:10px;">
                      ${safe([t.assetType, t.frequency, t.riskLevel].filter(Boolean).join(' • '))}
                    </div>
                  </td>
                  <td><span class="chip">${safe(t.status ?? '—')}</span></td>
                  <td><span class="chip">${safe(t.priority ?? '—')}</span></td>
                  <td>${fmtDate(t.nextDueDate)}</td>
                  <td>${fmtDate(t.lastCompletedDate)}</td>
                </tr>
              `).join('')
          }
        </tbody>
      </table>
    </div>
  </div>

  <!-- COVERAGE -->
  <div class="page break-before" id="coverage">
    <div class="sectionTitle">
      <div class="h2">Coverage Snapshot</div>
      <div class="muted" style="font-size:11px;">
        Insurance: ${policies.length} • Warranties: ${warranties.length}
      </div>
    </div>

    <div class="grid2">
      <div class="card avoid-break">
        <div class="h3">Insurance Policies</div>
        <table>
          <thead>
            <tr><th>Provider</th><th>Policy #</th><th>Expiry</th></tr>
          </thead>
          <tbody>
            ${
              policies.length === 0
                ? `<tr><td colspan="3" class="muted">No insurance policies on file.</td></tr>`
                : policies.map((pol: any) => `
                  <tr>
                    <td style="font-weight:800;">${safe(pol.providerName ?? '—')}</td>
                    <td>${safe(pol.policyNumber ?? '—')}</td>
                    <td>${fmtDate(pol.expiryDate)}</td>
                  </tr>
                `).join('')
            }
          </tbody>
        </table>
      </div>

      <div class="card avoid-break">
        <div class="h3">Warranties</div>
        <table>
          <thead>
            <tr><th>Provider</th><th>Contract/Policy</th><th>Expiry</th></tr>
          </thead>
          <tbody>
            ${
              warranties.length === 0
                ? `<tr><td colspan="3" class="muted">No warranties on file.</td></tr>`
                : warranties.map((w: any) => `
                  <tr>
                    <td style="font-weight:800;">${safe(w.providerName ?? '—')}</td>
                    <td>${safe(w.policyNumber ?? '—')}</td>
                    <td>${fmtDate(w.expiryDate)}</td>
                  </tr>
                `).join('')
            }
          </tbody>
        </table>
      </div>
    </div>

    <div class="muted" style="margin-top:10px; font-size:10px;">
      Tip: Upload policy declarations and warranty contracts under Documents for quicker underwriting and claims.
    </div>
  </div>

  <!-- DISCLAIMERS -->
  <div class="page break-before" id="disclaimer">
    <div class="h2">Disclaimers</div>
    <div class="card">
      <div style="font-size:11px;">
        <div class="muted" style="margin-bottom:8px;">
          This report is an informational snapshot generated by Contract-to-Cozy.
        </div>
        <div>• Verify policy terms, coverage limits, and expiry dates with your providers.</div>
        <div>• Replacement values are estimates; validate with receipts or insurer requirements.</div>
        <div>• Maintenance recommendations are guidance and may not reflect local codes/conditions.</div>
      </div>
    </div>
  </div>

</body>
</html>`;
}
