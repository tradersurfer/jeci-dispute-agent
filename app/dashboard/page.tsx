'use client';

import { useState, useEffect, useCallback, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import UploadZone from '../components/UploadZone';

interface FormState {
  clientName: string;
  address: string;
  city: string;
  state: string;
  zip: string;
}

const PROGRESS_STEPS = [
  'Uploading report...',
  'Extracting credit data...',
  'Running FCRA rules engine...',
  'Checking 7-year limits...',
  'Detecting duplicates...',
  'Analyzing medical debt...',
  'Reviewing inquiries...',
  'Generating dispute letters...',
  'Building download package...',
];

function DashboardContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session_id') ?? '';

  const [pdf, setPdf] = useState<File | null>(null);
  const [form, setForm] = useState<FormState>({
    clientName: '', address: '', city: '', state: '', zip: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!submitting) return;
    let i = 0;
    const t = setInterval(() => {
      i = Math.min(i + 1, PROGRESS_STEPS.length - 1);
      setProgressStep(i);
    }, 3500);
    return () => clearInterval(t);
  }, [submitting]);

  const handleSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!pdf) { setError('No PDF uploaded.'); return; }
      if (!form.clientName.trim()) { setError('Full name is required.'); return; }

      setError('');
      setSubmitting(true);
      setProgressStep(0);

      const data = new FormData();
      data.append('pdf', pdf);
      data.append('client_name', form.clientName);
      data.append('client_address', form.address);
      data.append('client_city', form.city);
      data.append('client_state', form.state);
      data.append('client_zip', form.zip);
      if (sessionId) data.append('session_id', sessionId);

      try {
        const res = await fetch('/api/analyze', { method: 'POST', body: data });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error ?? 'Analysis failed');
        router.push(`/results?id=${json.analysisId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Analysis failed. Please try again.');
        setSubmitting(false);
      }
    },
    [pdf, form, sessionId, router]
  );

  const pct = Math.round(((progressStep + 1) / PROGRESS_STEPS.length) * 100);
  const barFilled = Math.floor(((progressStep + 1) / PROGRESS_STEPS.length) * 32);
  const barEmpty  = 32 - barFilled;

  return (
    <div className="min-h-screen bg-jeci-bg">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 md:px-12 py-4 border-b border-jeci-border">
        <a href="/" className="flex items-center gap-3">
          <div className="w-1.5 h-5 bg-jeci-gold" />
          <span className="font-display font-bold text-jeci-text">JECI Credit</span>
        </a>
        <span className="font-mono text-xs text-jeci-muted">UPLOAD_DASHBOARD</span>
      </nav>

      <div className="max-w-2xl mx-auto px-6 py-16">
        {submitting ? (
          /* ── Processing State ── */
          <div className="space-y-8 animate-fade-in">
            <div>
              <p className="font-mono text-xs text-jeci-muted mb-2">
                $ jeci-scan --analyze {pdf?.name ?? 'report.pdf'} --round 1
              </p>
              <div className="border-t border-jeci-border/60 mb-6" />
              <h2 className="font-display text-2xl font-bold text-jeci-text mb-2">
                JECI AI is analyzing your report...
              </h2>
              <p className="text-jeci-muted text-sm">Do not close this tab.</p>
            </div>

            {/* Terminal log */}
            <div className="card font-mono text-sm space-y-2">
              {PROGRESS_STEPS.map((step, i) => {
                const done   = i < progressStep;
                const active = i === progressStep;
                return (
                  <div
                    key={step}
                    className={`flex items-center gap-3 text-sm transition-opacity ${
                      done ? 'opacity-100' : active ? 'opacity-100' : 'opacity-20'
                    }`}
                  >
                    <span className={`w-14 text-xs flex-shrink-0 ${done ? 'text-jeci-success' : active ? 'text-jeci-gold' : 'text-jeci-border'}`}>
                      {done ? '[✓]' : active ? '[...]' : '[   ]'}
                    </span>
                    <span className={done ? 'text-jeci-muted' : active ? 'text-jeci-text' : 'text-jeci-muted/30'}>
                      {step}
                    </span>
                    {active && <span className="text-jeci-gold animate-blink">▋</span>}
                  </div>
                );
              })}
            </div>

            {/* Progress bar */}
            <div className="space-y-1.5">
              <div className="flex justify-between font-mono text-xs text-jeci-muted">
                <span>ANALYZING...</span>
                <span className="text-jeci-gold">{pct}%</span>
              </div>
              <p className="font-mono text-jeci-gold text-sm tracking-tight">
                {'█'.repeat(barFilled)}{'░'.repeat(barEmpty)}
              </p>
            </div>
          </div>
        ) : (
          /* ── Upload Form ── */
          <div className="animate-slide-up">
            <p className="font-mono text-xs text-jeci-muted mb-6">
              // REPORT_INTAKE
            </p>
            <h1 className="font-display text-3xl font-bold text-jeci-text mb-2">
              Upload Your Credit Report
            </h1>
            <p className="text-jeci-muted text-sm mb-10">
              JECI AI will scan for FCRA violations and generate dispute letters for all 3 bureaus.
            </p>

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Personal info */}
              <div className="card space-y-4">
                <p className="terminal-label">// CLIENT_INFO</p>
                <div className="grid grid-cols-2 gap-4">
                  {[
                    { key: 'clientName', label: 'FULL_NAME', placeholder: 'Jane Smith', span: 2 },
                    { key: 'address',    label: 'ADDRESS',   placeholder: '123 Main St', span: 2 },
                    { key: 'city',       label: 'CITY',      placeholder: 'Houston', span: 1 },
                    { key: 'state',      label: 'STATE',     placeholder: 'TX', span: 1 },
                    { key: 'zip',        label: 'ZIP',       placeholder: '77001', span: 1 },
                  ].map(({ key, label, placeholder, span }) => (
                    <div key={key} className={span === 2 ? 'col-span-2' : 'col-span-1'}>
                      <label className="font-mono text-xs text-jeci-muted block mb-1.5">{label}</label>
                      <input
                        type="text"
                        placeholder={placeholder}
                        value={form[key as keyof FormState]}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                        disabled={submitting}
                        className="w-full bg-jeci-bg border border-jeci-border rounded px-3 py-2.5 font-mono text-sm text-jeci-text placeholder-jeci-muted/40 focus:outline-none focus:border-jeci-gold/60 transition-colors disabled:opacity-50"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* PDF upload */}
              <div className="space-y-2">
                <p className="terminal-label">// REPORT_PDF</p>
                <UploadZone file={pdf} onFile={setPdf} />
              </div>

              {error && (
                <p className="font-mono text-jeci-red text-sm border border-jeci-red/20 bg-jeci-red/5 rounded px-4 py-3">
                  [ERROR] {error}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting || !pdf || !form.clientName}
                className="btn-gold w-full py-4"
              >
                RUN JECI AI SCAN →
              </button>

              <p className="font-mono text-jeci-muted/50 text-xs text-center">
                Report processed securely · Never shared · ~30–90 seconds
              </p>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-jeci-bg" />}>
      <DashboardContent />
    </Suspense>
  );
}
