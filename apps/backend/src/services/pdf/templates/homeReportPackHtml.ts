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
  
  export function buildHomeReportPackHtml(snapshot: any) {
    const p = snapshot.property ?? {};
    const address = [p.addressLine1, p.addressLine2, `${p.city ?? ''} ${p.state ?? ''} ${p.zipCode ?? ''}`]
      .filter(Boolean)
      .join(', ');
  
    const inventoryItems = snapshot.inventory?.items ?? [];
    const tasks = snapshot.maintenance?.tasks ?? [];
    const policies = snapshot.coverage?.insurancePolicies ?? [];
    const warranties = snapshot.coverage?.warranties ?? [];
  
    return `
  <!doctype html>
  <html>
  <head>
    <meta charset="utf-8"/>
    <title>Home Report</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: -apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Arial, sans-serif; color: #111; }
      .muted { color: #555; }
      .section { margin-top: 18px; }
      .h1 { font-size: 20px; font-weight: 700; margin: 0; }
      .h2 { font-size: 14px; font-weight: 700; margin: 0 0 8px 0; }
      .card { border: 1px solid #e5e7eb; border-radius: 10px; padding: 12px; margin-top: 10px; }
      .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
      table { width: 100%; border-collapse: collapse; margin-top: 8px; }
      th, td { border-bottom: 1px solid #eee; padding: 8px; text-align: left; vertical-align: top; font-size: 12px; }
      th { font-size: 12px; color: #333; }
      .pill { display: inline-block; padding: 2px 8px; border-radius: 999px; background: #f3f4f6; font-size: 11px; }
      .footer { margin-top: 18px; font-size: 10px; color: #666; }
    </style>
  </head>
  <body>
  
    <div class="card">
      <div class="h1">Home Report Pack</div>
      <div class="muted" style="margin-top:6px;">${address || '—'}</div>
      <div class="muted" style="margin-top:6px;">Generated: ${fmtDate(snapshot.meta?.generatedAt)}</div>
    </div>
  
    <div class="section card">
      <div class="h2">Inventory</div>
      <div class="muted">${inventoryItems.length} items</div>
      <table>
        <thead>
          <tr>
            <th>Item</th>
            <th>Room</th>
            <th>Category</th>
            <th>Purchase</th>
            <th>Replacement</th>
          </tr>
        </thead>
        <tbody>
          ${inventoryItems.slice(0, 200).map((i: any) => `
            <tr>
              <td>
                <div><b>${i.name}</b></div>
                <div class="muted">${[i.brand, i.modelNumber, i.serialNumber].filter(Boolean).join(' • ')}</div>
              </td>
              <td>${i.room?.name ?? '—'}</td>
              <td><span class="pill">${i.category ?? '—'}</span></td>
              <td>${moneyFromCents(i.purchaseCostCents)}</td>
              <td>${moneyFromCents(i.replacementCostCents)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      ${inventoryItems.length > 200 ? `<div class="muted" style="margin-top:8px;">Showing first 200 items.</div>` : ``}
    </div>
  
    <div class="section card">
      <div class="h2">Maintenance Outlook</div>
      <div class="muted">${tasks.length} tasks</div>
      <table>
        <thead>
          <tr>
            <th>Task</th>
            <th>Status</th>
            <th>Priority</th>
            <th>Next Due</th>
            <th>Last Done</th>
          </tr>
        </thead>
        <tbody>
          ${tasks.slice(0, 200).map((t: any) => `
            <tr>
              <td>
                <div><b>${t.title}</b></div>
                <div class="muted">${[t.assetType, t.frequency, t.riskLevel].filter(Boolean).join(' • ')}</div>
              </td>
              <td><span class="pill">${t.status ?? '—'}</span></td>
              <td><span class="pill">${t.priority ?? '—'}</span></td>
              <td>${fmtDate(t.nextDueDate)}</td>
              <td>${fmtDate(t.lastCompletedDate)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  
    <div class="section card">
      <div class="h2">Coverage Snapshot</div>
  
      <div class="grid">
        <div class="card">
          <div class="h2">Insurance</div>
          <table>
            <thead>
              <tr><th>Provider</th><th>Policy #</th><th>Expiry</th></tr>
            </thead>
            <tbody>
              ${policies.map((p: any) => `
                <tr>
                  <td><b>${p.providerName ?? '—'}</b></td>
                  <td>${p.policyNumber ?? '—'}</td>
                  <td>${fmtDate(p.expiryDate)}</td>
                </tr>
              `).join('') || `<tr><td colspan="3" class="muted">No insurance policies on file.</td></tr>`}
            </tbody>
          </table>
        </div>
  
        <div class="card">
          <div class="h2">Warranties</div>
          <table>
            <thead>
              <tr><th>Provider</th><th>Contract/Policy</th><th>Expiry</th></tr>
            </thead>
            <tbody>
              ${warranties.map((w: any) => `
                <tr>
                  <td><b>${w.providerName ?? '—'}</b></td>
                  <td>${w.policyNumber ?? '—'}</td>
                  <td>${fmtDate(w.expiryDate)}</td>
                </tr>
              `).join('') || `<tr><td colspan="3" class="muted">No warranties on file.</td></tr>`}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  
    <div class="footer">
      This report is an informational snapshot generated by Contract-to-Cozy. Verify coverage terms and replacement values with your providers.
    </div>
  
  </body>
  </html>
    `;
  }
  