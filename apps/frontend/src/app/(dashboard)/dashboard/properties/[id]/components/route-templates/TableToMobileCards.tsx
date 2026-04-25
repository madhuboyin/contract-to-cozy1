'use client';

import { ReactNode } from 'react';

interface TableColumn<Row> {
  key: string;
  label: string;
  render: (row: Row) => ReactNode;
}

interface TableToMobileCardsProps<Row> {
  rows: Row[];
  getRowKey: (row: Row) => string;
  title: (row: Row) => ReactNode;
  subtitle?: (row: Row) => ReactNode;
  columns: TableColumn<Row>[];
}

export default function TableToMobileCards<Row>({
  rows,
  getRowKey,
  title,
  subtitle,
  columns,
}: TableToMobileCardsProps<Row>) {
  return (
    <>
      <div className="hidden md:block overflow-x-auto rounded-2xl border border-slate-200 bg-white">
        <table className="w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/80">
              <th className="px-4 py-3 text-left text-xs font-semibold tracking-normal text-slate-500">Item</th>
              {columns.map((column) => (
                <th key={column.key} className="px-4 py-3 text-left text-xs font-semibold tracking-normal text-slate-500">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={getRowKey(row)} className="border-b border-slate-100 last:border-b-0">
                <td className="px-4 py-3 align-top">
                  <p className="mb-0 text-sm font-semibold text-slate-900">{title(row)}</p>
                  {subtitle ? <p className="mt-1 mb-0 text-xs text-slate-500">{subtitle(row)}</p> : null}
                </td>
                {columns.map((column) => (
                  <td key={`${getRowKey(row)}-${column.key}`} className="px-4 py-3 align-top text-slate-700">
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="space-y-3 md:hidden">
        {rows.map((row) => (
          <article key={getRowKey(row)} className="rounded-2xl border border-slate-200 bg-white p-4">
            <p className="mb-0 text-sm font-semibold text-slate-900">{title(row)}</p>
            {subtitle ? <p className="mt-1 mb-0 text-xs text-slate-500">{subtitle(row)}</p> : null}
            <div className="mt-3 space-y-2">
              {columns.map((column) => (
                <div key={`${getRowKey(row)}-mobile-${column.key}`} className="rounded-xl bg-slate-50 px-3 py-2">
                  <p className="mb-1 text-[11px] font-semibold tracking-normal text-slate-500">{column.label}</p>
                  <div className="text-sm text-slate-800">{column.render(row)}</div>
                </div>
              ))}
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
