import { NextResponse } from 'next/server';

export async function GET() {
  // read .pending-acks.json or interact with daemon
  return NextResponse.json({ pending: [] });
}
