import { NextResponse } from 'next/server'
import { resolveServiceBuildIdentity } from '@/lib/buildIdentity'

export async function GET() {
  return NextResponse.json({ 
    status: 'healthy',
    service: 'frontend',
    timestamp: new Date().toISOString(),
    build: resolveServiceBuildIdentity(),
  })
}
