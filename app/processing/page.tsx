'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import ProgressRing from '../components/ProgressRing';

const STEPS = [
  'Reading your credit report…',
  'Identifying negative items…',
  'Checking FCRA 7-year limits…',
  'Detecting duplicate accounts…',
  'Analyzing medical debt rules…',
  'Reviewing hard inquiries…',
  'Generating Experian letter…',
  'Generating Equifax letter…',
  'Generating TransUnion letter…',
  'Building download package…',
];

export default function ProcessingPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const analysisId = searchParams.get('id');
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!analysisId) {
      router.replace('/dashboard');
      return;
    }

    // Advance through visual steps
    const interval = setInterval(() => {
      setStep((s) => {
        if (s >= STEPS.length - 1) return s;
        return s + 1;
      });
    }, 1800);

    // Poll for completion
    const pollInterval = setInterval(async () => {
      try {
        const res = await fetch(`/api/analyze/status?id=${analysisId}`);
        if (res.ok) {
          const { status } = await res.json();
          if (status === 'complete') {
            clearInterval(interval);
            clearInterval(pollInterval);
            router.push(`/results?id=${analysisId}`);
          }
        }
      } catch {
        // keep polling
      }
    }, 3000);

    return () => {
      clearInterval(interval);
      clearInterval(pollInterval);
    };
  }, [analysisId, router]);

  return (
    <div className="min-h-screen bg-credora-bg flex flex-col">
      <nav className="flex items-center px-6 md:px-12 py-5 border-b border-credora-border">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-full bg-credora-gold" />
          <span className="font-display text-lg font-bold text-credora-text">Credora AI</span>
        </div>
      </nav>

      <div className="flex-1 flex items-center justify-center px-6 py-20">
        <div className="text-center max-w-md animate-fade-in">
          <div className="mb-10">
            <ProgressRing
              step={step + 1}
              totalSteps={STEPS.length}
              label={STEPS[step]}
            />
          </div>

          <h1 className="font-display text-3xl font-bold text-credora-text mb-4">
            Credora AI is analyzing your report
          </h1>
          <p className="text-credora-muted mb-10">
            Our AI is scanning every account, inquiry, and public record against 18+ FCRA rules. Please don't close this tab.
          </p>

          {/* Step checklist */}
          <div className="space-y-2 text-left max-w-xs mx-auto">
            {STEPS.map((s, i) => (
              <div
                key={s}
                className={`flex items-center gap-3 text-sm transition-all duration-300 ${
                  i < step
                    ? 'text-credora-gold'
                    : i === step
                    ? 'text-credora-text'
                    : 'text-credora-muted/40'
                }`}
              >
                {i < step ? (
                  <span className="text-credora-gold flex-shrink-0">✓</span>
                ) : i === step ? (
                  <span className="w-1.5 h-1.5 rounded-full bg-credora-gold animate-pulse flex-shrink-0 mt-0.5" />
                ) : (
                  <span className="w-1.5 h-1.5 rounded-full bg-credora-border flex-shrink-0 mt-0.5" />
                )}
                {s}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
