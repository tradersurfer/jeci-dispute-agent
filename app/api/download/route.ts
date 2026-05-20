import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/utils/supabase/admin';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const analysisId = searchParams.get('id');

  if (!analysisId) {
    return NextResponse.json({ error: 'Missing analysis ID' }, { status: 400 });
  }

  const { data: analysis } = await supabaseAdmin
    .from('analyses')
    .select('zip_path, client_name')
    .eq('id', analysisId)
    .single();

  if (!analysis?.zip_path) {
    return NextResponse.json({ error: 'Analysis not found' }, { status: 404 });
  }

  const { data: fileData, error } = await supabaseAdmin.storage
    .from('dispute-packages')
    .download(analysis.zip_path);

  if (error || !fileData) {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }

  const arrayBuffer = await fileData.arrayBuffer();
  const safeName = analysis.client_name.replace(/[^a-zA-Z0-9]/g, '_');
  const filename = `Credora_Dispute_Package_${safeName}.zip`;

  return new NextResponse(arrayBuffer, {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
