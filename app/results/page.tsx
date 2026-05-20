import { notFound } from 'next/navigation';
import { supabaseAdmin } from '@/utils/supabase/admin';
import ResultsSummary from '../components/ResultsSummary';
import LetterPreviewCard from '../components/LetterPreviewCard';

interface PageProps {
  searchParams: Promise<{ id?: string }>;
}

export default async function ResultsPage({ searchParams }: PageProps) {
  const { id: analysisId } = await searchParams;

  if (!analysisId) notFound();

  const { data: analysis, error } = await supabaseAdmin
    .from('analyses')
    .select('*')
    .eq('id', analysisId)
    .single();

  if (error || !analysis) notFound();

  const letters: Array<{ bureau: string; round: number; preview: string }> =
    analysis.letters_generated ?? [];

  return (
    <div className="min-h-screen bg-credora-bg">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 md:px-12 py-5 border-b border-credora-border">
        <a href="/" className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-credora-gold" />
          <span className="font-display text-lg font-bold text-credora-text">Credora AI</span>
        </a>
        <span className="text-credora-muted text-sm">Analysis Complete</span>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-16 space-y-12 animate-fade-in">
        {/* Header */}
        <div>
          <div className="inline-flex items-center gap-2 bg-green-500/10 border border-green-500/20 rounded-full px-4 py-2 mb-6">
            <span className="text-green-400 text-sm">✓ Analysis Complete</span>
          </div>
          <h1 className="font-display text-4xl font-bold text-credora-text mb-3">
            Your Dispute Package is Ready
          </h1>
          <p className="text-credora-muted">
            Client: <span className="text-credora-text">{analysis.client_name}</span>
            {' · '}
            Generated: <span className="text-credora-text">
              {new Date(analysis.created_at).toLocaleDateString('en-US', {
                month: 'long', day: 'numeric', year: 'numeric',
              })}
            </span>
          </p>
        </div>

        {/* Summary stats + charts */}
        <ResultsSummary
          totalItems={analysis.total_items ?? 0}
          quickWins={analysis.quick_wins ?? 0}
          estimatedPoints={analysis.estimated_points ?? 0}
          lettersGenerated={letters.length}
          categories={analysis.categories ?? {}}
          bureausAffected={analysis.bureaus_affected ?? []}
          scores={analysis.scores ?? { equifax: null, experian: null, transunion: null }}
        />

        {/* Letter previews */}
        {letters.length > 0 && (
          <div className="space-y-4">
            <h2 className="font-display text-2xl font-bold text-credora-text">
              Generated Dispute Letters
            </h2>
            <p className="text-credora-muted text-sm">
              Click each bureau to preview the letter. Download the full package below.
            </p>
            <div className="space-y-3">
              {letters.map((letter) => (
                <LetterPreviewCard
                  key={letter.bureau}
                  bureau={letter.bureau}
                  round={letter.round}
                  preview={letter.preview}
                />
              ))}
            </div>
          </div>
        )}

        {/* Download section */}
        <div className="card-elevated text-center space-y-6">
          <div>
            <h2 className="font-display text-2xl font-bold text-credora-text mb-2">
              Download Your Complete Package
            </h2>
            <p className="text-credora-muted text-sm">
              Includes all dispute letters, a README with mailing instructions, and your FCRA rights guide.
            </p>
          </div>

          <a
            href={`/api/download?id=${analysisId}`}
            className="btn-gold inline-flex items-center gap-3 py-4 px-10 rounded-xl text-base"
            download
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download Dispute ZIP Package
          </a>

          <div className="flex items-center justify-center gap-6 text-credora-muted text-xs">
            <span>✓ Bureau-specific letters</span>
            <span>✓ Legal citations included</span>
            <span>✓ Mailing instructions</span>
          </div>
        </div>

        {/* Next steps */}
        <div className="card space-y-4">
          <h3 className="font-semibold text-credora-text">What Happens Next</h3>
          <ol className="space-y-3">
            {[
              'Print and sign each dispute letter.',
              'Send via Certified Mail with Return Receipt to each bureau.',
              'Bureaus must respond within 30 days under FCRA law.',
              'Upload their responses here for Round 2 analysis.',
            ].map((step, i) => (
              <li key={i} className="flex gap-4 text-sm text-credora-muted">
                <span className="text-credora-gold font-bold flex-shrink-0">{i + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
        </div>

        <div className="text-center">
          <a href="/dashboard" className="btn-outline text-sm py-2.5 px-6 rounded-lg inline-flex">
            Analyze Another Report
          </a>
        </div>
      </div>
    </div>
  );
}
