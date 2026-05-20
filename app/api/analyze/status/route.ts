import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase/admin';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'Missing id' }, { status: 400 });
  }

  const { data } = await supabaseAdmin
    .from('analyses')
    .select('id, created_at, total_items')
    .eq('id', id)
    .single();

  if (!data) {
    return NextResponse.json({ status: 'processing' });
  }

  return NextResponse.json({ status: 'complete', analysisId: data.id });
}
