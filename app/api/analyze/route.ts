import { NextResponse } from 'next/server';
import { v4 as uuidv4 } from 'uuid';
import { supabaseAdmin } from '@/utils/supabase/admin';
import { extractPDFText, parseCreditReportText } from '@/lib/pdf/reportParser';
import { adaptParsedReport } from '@/lib/pdf/reportAdapter';
import { buildDisputeZip } from '@/lib/zip/letterPackager';
import type { Bureau, DisputeItem } from '../../../src/types/index.js';

export const maxDuration = 60;

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const pdfFile = formData.get('pdf') as File | null;
    const clientName = (formData.get('client_name') as string) || 'Unknown Client';
    const clientAddress = (formData.get('client_address') as string) || '';
    const clientCity = (formData.get('client_city') as string) || '';
    const clientState = (formData.get('client_state') as string) || '';
    const clientZip = (formData.get('client_zip') as string) || '';
    const sessionId = (formData.get('session_id') as string) || null;

    if (!pdfFile) {
      return NextResponse.json({ error: 'No PDF file provided' }, { status: 400 });
    }

    const analysisId = uuidv4();
    const arrayBuffer = await pdfFile.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // 1. Extract text from PDF
    const rawText = await extractPDFText(buffer);
    if (!rawText || rawText.trim().length < 100) {
      return NextResponse.json(
        { error: 'Could not extract text from PDF. Please ensure this is a text-based credit report (not a scanned image).' },
        { status: 422 }
      );
    }

    // 2. Claude parses raw text → structured report
    const parsedRaw = await parseCreditReportText(rawText);

    // Override personal info with what the client entered in the form
    if (clientName !== 'Unknown Client') parsedRaw.personal.name = clientName;
    if (clientAddress) parsedRaw.personal.address = clientAddress;
    if (clientCity) parsedRaw.personal.city = clientCity;
    if (clientState) parsedRaw.personal.state = clientState;
    if (clientZip) parsedRaw.personal.zip = clientZip;

    // 3. Adapt to CreditReport type for the rules engine
    const creditReport = adaptParsedReport(parsedRaw, analysisId);

    // 4. Run FCRA/FDCPA rules engine
    const { analyzeReport, groupDisputesByBureau } = await import('../../../src/tools/reportAnalyzer.js');
    const analysis = analyzeReport(creditReport);
    const disputesByBureau = groupDisputesByBureau(analysis.disputeItems);

    // 5. Generate dispute letters per bureau via Claude
    const { generateLettersForRound } = await import('../../../src/tools/letterGenerator.js');
    const letterParams = {
      clientName: creditReport.personalInfo.name,
      clientAddress: [
        creditReport.personalInfo.address,
        `${creditReport.personalInfo.city}, ${creditReport.personalInfo.state} ${creditReport.personalInfo.zip}`,
      ]
        .filter(Boolean)
        .join('\n'),
      ssn: creditReport.personalInfo.ssn,
      bureau: 'Equifax' as Bureau,
      items: [],
    };

    const letters = await generateLettersForRound(
      letterParams,
      disputesByBureau,
      1
    );

    // 6. Build ZIP package
    const packagedLetters = letters.map((l) => ({
      bureau: l.bureau as 'Experian' | 'Equifax' | 'TransUnion',
      round: l.round,
      content: l.letterContent,
    }));
    const zipBuffer = await buildDisputeZip(packagedLetters, creditReport.personalInfo.name);

    // 7. Upload ZIP to Supabase Storage
    const zipPath = `analyses/${analysisId}/dispute-package.zip`;
    await supabaseAdmin.storage
      .from('dispute-packages')
      .upload(zipPath, zipBuffer, {
        contentType: 'application/zip',
        upsert: false,
      });

    // 8. Store results in Supabase
    const resultsPayload = {
      id: analysisId,
      client_name: creditReport.personalInfo.name,
      client_address: `${creditReport.personalInfo.address}, ${creditReport.personalInfo.city}, ${creditReport.personalInfo.state} ${creditReport.personalInfo.zip}`,
      session_id: sessionId,
      total_items: analysis.totalNegativeItems,
      quick_wins: analysis.quickWins.length,
      estimated_points: analysis.estimatedPointRecovery,
      dispute_items: analysis.disputeItems as unknown as Record<string, unknown>[],
      letters_generated: packagedLetters.map((l) => ({
        bureau: l.bureau,
        round: l.round,
        preview: l.content.slice(0, 500),
        full_content: l.content,
      })),
      zip_path: zipPath,
      scores: parsedRaw.scores,
      bureaus_affected: [...new Set(letters.map((l) => l.bureau))],
      categories: summarizeCategories(analysis.disputeItems as DisputeItem[]),
    };

    await supabaseAdmin.from('analyses').insert(resultsPayload);

    return NextResponse.json({
      analysisId,
      totalItems: analysis.totalNegativeItems,
      quickWins: analysis.quickWins.length,
      estimatedPoints: analysis.estimatedPointRecovery,
      lettersGenerated: letters.length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[Credora/analyze]', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function summarizeCategories(items: DisputeItem[]) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const category = reasonToCategory(item.reason);
    counts[category] = (counts[category] ?? 0) + 1;
  }
  return counts;
}

function reasonToCategory(reason: string): string {
  if (reason.includes('7_YEAR') || reason.includes('10_YEAR')) return 'Obsolete Accounts';
  if (reason.includes('DUPLICATE')) return 'Duplicate Accounts';
  if (reason.includes('MEDICAL')) return 'Medical Debt';
  if (reason.includes('INQUIRY')) return 'Inquiries';
  if (reason.includes('PAID') || reason.includes('BALANCE')) return 'Incorrect Status';
  if (reason.includes('BANKRUPTCY') || reason.includes('PUBLIC_RECORD')) return 'Public Records';
  if (reason.includes('IDENTITY') || reason.includes('NOT_MINE')) return 'Identity Errors';
  if (reason.includes('COLLECTION')) return 'Collections';
  return 'Other Violations';
}
