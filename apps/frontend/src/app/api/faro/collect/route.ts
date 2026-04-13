import { type NextRequest, NextResponse } from 'next/server';

const ALLOY_FARO_URL = 'http://alloy-faro.monitoring.svc.cluster.local:12347/collect';

export async function POST(req: NextRequest) {
  const body = await req.text();

  const response = await fetch(ALLOY_FARO_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });

  return new NextResponse(null, { status: response.status });
}
