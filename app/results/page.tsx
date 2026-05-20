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
    <div className="min-h-screen bg-jeci-bg">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 md:px-12 py-4 border-b border-jeci-border">
        <a href="/" className="flex items-center gap-3">
          <div className="w-1.5 h-5 bg-jeci-gold" />
          <span className="font-display font-bold text-jeci-text">JECI Credit</span>
        </a>
        <span className="font-mono text-xs text-jeci-success">[✓] ANALYSIS_COMPLETE</span>
      </nav>

      <div className="max-w-3xl mx-auto px-6 py-16 space-y-10 animate-fade-in">

        {/* Header */}
        <div>
          <p className="font-mono text-xs text-jeci-muted mb-4">// DISPUTE_PACKAGE_READY</p>
          <h1 className="font-display text-4xl font-bold text-jeci-text mb-3">
            Your Letters Are Ready
          </h1>
          <p className="font-mono text-sm text-jeci-muted">
            client: <span className="text-jeci-text">{analysis.client_name}</span>
            {' '}·{' '}
            generated: <span className="text-jeci-text">
              {new Date(analysis.created_at).toLocaleDateString('en-US', {
                month: 'short', day: 'numeric', year: 'numeric',
              })}
            </span>
            {' '}·{' '}
            id: <span className="text-jeci-muted/60">{analysisId.slice(0, 12)}...</span>
          </p>
        </div>

        {/* Summary */}
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
            <p className="terminal-label">// GENERATED_LETTERS</p>
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

        {/* Download */}
        <div className="card-elevated space-y-5">
          <div>
            <p className="terminal-label mb-3">// DOWNLOAD_PACKAGE</p>
            <h2 className="font-display text-xl font-bold text-jeci-text mb-2">
              Complete Dispute Package
            </h2>
            <p className="text-jeci-muted text-sm">
              All letters, mailing instructions, bureau addresses, and your FCRA rights guide — bundled as a ZIP.
            </p>
          </div>

          <a
            href={`/api/download?id=${analysisId}`}
            className="btn-gold inline-flex items-center gap-3 py-3.5 px-8"
            download
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            DOWNLOAD_PACKAGE.ZIP
          </a>

          <div className="flex flex-wrap gap-4 font-mono text-xs text-jeci-muted">
            <span>[✓] Bureau-specific letters</span>
            <span>[✓] Legal citations</span>
            <span>[✓] Mailing guide</span>
            <span>[✓] FCRA rights summary</span>
          </div>
        </div>

        {/* Next steps */}
        <div className="card space-y-4">
          <p className="terminal-label">// NEXT_STEPS</p>
          <div className="space-y-3">
            {[
              'Print and sign each letter where indicated.',
              'Include copies of 2 forms of ID (ID + utility bill).',
              'Send via Certified Mail with Return Receipt to each bureau.',
              'Bureaus must respond within 30 days per FCRA law.',
              'Upload responses here for Round 2 analysis.',
            ].map((step, i) => (
              <div key={i} className="terminal-line">
                <span className="font-mono text-xs text-jeci-gold flex-shrink-0 w-6">
                  {String(i + 1).padStart(2, '0')}.
                </span>
                <span className="text-jeci-muted text-sm">{step}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="text-center">
          <a href="/dashboard" className="btn-outline text-xs py-2.5 px-6">
            ANALYZE_ANOTHER_REPORT
          </a>
        </div>
      </div>
    </div>
  );
}
