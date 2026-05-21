'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import TerminalProgress from '../components/ProgressRing';

const STEPS = [
  'PDF loaded and verified',
  'Extracting personal information',
  'Parsing credit accounts',
  'Running 7-year FCRA limit checks',
  'Detecting duplicate entries',
  'Analyzing medical debt rules',
  'Reviewing hard inquiries',
  'Generating Experian letter',
  'Generating Equifax letter',
  'Generating TransUnion letter',
  'Building ZIP package',
  'Uploading to secure storage',
];

function ProcessingContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const analysisId = searchParams.get('id');
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!analysisId) { router.replace('/dashboard'); return; }

    const stepTimer = setInterval(() => {
      setStep((s) => Math.min(s + 1, STEPS.length - 1));
    }, 2000);

    const pollTimer = setInterval(async () => {
      try {
        const res = await fetch(`/api/analyze/status?id=${analysisId}`);
        if (res.ok) {
          const { status } = await res.json();
          if (status === 'complete') {
            clearInterval(stepTimer);
            clearInterval(pollTimer);
            router.push(`/results?id=${analysisId}`);
          }
        }
      } catch { /* keep polling */ }
    }, 3000);

    return () => { clearInterval(stepTimer); clearInterval(pollTimer); };
  }, [analysisId, router]);

  return (
    <div className="min-h-screen bg-jeci-bg flex flex-col">
      <nav className="flex items-center px-6 md:px-12 py-4 border-b border-jeci-border">
        <div className="flex items-center gap-3">
          <div className="w-1.5 h-5 bg-jeci-gold" />
          <span className="font-display font-bold text-jeci-text">JECI Credit</span>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="w-full max-w-lg animate-fade-in">
          <div className="mb-8">
            <h1 className="font-display text-2xl font-bold text-jeci-text mb-2">
              JECI AI is analyzing your report...
            </h1>
            <p className="text-jeci-muted text-sm font-mono">
              Do not close this tab · {analysisId ? `job_id: ${analysisId.slice(0, 8)}...` : ''}
            </p>
          </div>

          <TerminalProgress
            step={step}
            totalSteps={STEPS.length}
            label={STEPS[step]}
            steps={STEPS}
          />
        </div>
      </div>
    </div>
  );
}

export default function ProcessingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-jeci-bg" />}>
      <ProcessingContent />
    </Suspense>
  );
}
