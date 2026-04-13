import { NextRequest, NextResponse } from 'next/server';

// PREVIEW_KEY is a server-only env var (no NEXT_PUBLIC_ prefix).
// It is never sent to the browser or included in the client bundle.
const PREVIEW_KEY = process.env.PREVIEW_KEY;

export async function POST(req: NextRequest) {
  if (!PREVIEW_KEY) {
    return NextResponse.json({ error: 'Preview access is not configured' }, { status: 403 });
  }

  let body: { key?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 });
  }

  if (!body.key || body.key !== PREVIEW_KEY) {
    return NextResponse.json({ error: 'Invalid access key' }, { status: 401 });
  }

  const res = NextResponse.json({ success: true });
  // Not httpOnly: PreviewModeWrapper (client component) reads this via
  // document.cookie to decide whether to render the real site.
  // The security value here is server-side key validation, not cookie flags.
  res.cookies.set('preview_mode', 'true', {
    path: '/',
    maxAge: 60 * 60 * 24 * 365, // 1 year
    sameSite: 'lax',
  });
  return res;
}
