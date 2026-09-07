import { NextRequest, NextResponse } from 'next/server';
import { registerBusiness } from '@/lib/business';

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const name = typeof body?.name === 'string' ? body.name : undefined;
  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  try {
    const business = registerBusiness(name);
    return NextResponse.json(business, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
