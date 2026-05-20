'use client';

import { useState } from 'react';
import PricingCard from './components/PricingCard';

const PLANS = [
  {
    name: 'Credora Scan',
    price: '$97',
    type: 'one-time',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_SCAN ?? 'price_credora_scan',
    description: 'One complete credit report analysis with dispute-ready letters.',
    features: [
      'Full 3-bureau report analysis',
      'AI-generated dispute letters',
      'Downloadable ZIP package',
      'FCRA/FDCPA legal citations',
      '30-day mailing guide included',
    ],
    cta: 'Get My Letters — $97',
    highlighted: false,
  },
  {
    name: 'Credora Sweep',
    price: '$297',
    type: 'one-time',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_SWEEP ?? 'price_credora_sweep',
    description: 'Full 3-round dispute campaign managed start to finish.',
    features: [
      'Everything in Scan, plus:',
      '3-round dispute pipeline',
      'Bureau response analysis',
      'Round 2 & 3 letter generation',
      'Deletion outcome tracking',
      'Priority support',
    ],
    cta: 'Start My Sweep — $297',
    highlighted: true,
  },
  {
    name: 'Credora Repair',
    price: '$127',
    type: 'recurring',
    priceId: process.env.NEXT_PUBLIC_STRIPE_PRICE_REPAIR ?? 'price_credora_repair',
    description: 'Ongoing monthly credit repair with continuous dispute management.',
    features: [
      'Everything in Sweep, plus:',
      'Monthly score tracking',
      'Continuous dispute management',
      'Score improvement roadmap',
      'Dedicated repair specialist',
      'Cancel anytime',
    ],
    cta: 'Start Repair — $127/mo',
    highlighted: false,
  },
];

const STATS = [
  { value: '18+', label: 'FCRA/FDCPA Rules' },
  { value: '97%', label: 'Avg. Deletion Rate' },
  { value: '3', label: 'Bureau Coverage' },
  { value: '<10 min', label: 'Analysis Time' },
];

export default function LandingPage() {
  const [loadingPlan, setLoadingPlan] = useState<string | null>(null);

  const handleCheckout = async (priceId: string, planName: string) => {
    setLoadingPlan(planName);
    try {
      const res = await fetch('/.netlify/functions/stripe-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ priceId, planName }),
      });
      if (!res.ok) throw new Error('Checkout failed');
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      alert('Something went wrong starting checkout. Please try again.');
      setLoadingPlan(null);
    }
  };

  return (
    <main className="min-h-screen bg-credora-bg">
      {/* Nav */}
      <nav className="sticky top-0 z-50 flex items-center justify-between px-6 md:px-12 py-5 border-b border-credora-border bg-credora-bg/90 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-credora-gold to-credora-gold/60" />
          <span className="font-display text-xl font-bold text-credora-text">Credora AI</span>
        </div>
        <div className="hidden md:flex items-center gap-8 text-credora-muted text-sm">
          <a href="#how-it-works" className="hover:text-credora-text transition-colors">How It Works</a>
          <a href="#pricing" className="hover:text-credora-text transition-colors">Pricing</a>
        </div>
        <a
          href="#pricing"
          className="btn-gold text-sm py-2 px-5"
        >
          Get Started
        </a>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 md:px-12 pt-24 pb-20 text-center animate-fade-in">
        <div className="inline-flex items-center gap-2.5 bg-credora-gold/10 border border-credora-gold/25 rounded-full px-4 py-2 mb-10">
          <span className="w-2 h-2 rounded-full bg-credora-gold animate-pulse-gold" />
          <span className="text-credora-gold text-sm font-medium tracking-wide">
            Powered by Claude AI · FCRA Compliant
          </span>
        </div>

        <h1 className="font-display text-5xl md:text-7xl font-bold text-credora-text leading-[1.1] mb-6">
          Your Credit Report<br />
          <span className="text-credora-gold">Has Errors.</span><br />
          AI Finds Them in Minutes.
        </h1>

        <p className="text-credora-muted text-lg md:text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
          Upload your credit report. Credora AI scans every line for FCRA violations,
          generates bureau-specific dispute letters, and delivers a ready-to-mail package
          — automatically.
        </p>

        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mb-16">
          <a href="#pricing" className="btn-gold text-base px-8 py-4 rounded-xl">
            Start Disputing Today
          </a>
          <a href="#how-it-works" className="btn-outline text-base px-8 py-4 rounded-xl">
            See How It Works
          </a>
        </div>

        {/* Stats strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 max-w-2xl mx-auto">
          {STATS.map((s) => (
            <div key={s.label} className="text-center">
              <div className="font-display text-3xl font-bold text-credora-gold mb-1">{s.value}</div>
              <div className="text-credora-muted text-xs uppercase tracking-wider">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="max-w-4xl mx-auto px-6 md:px-12 py-20">
        <p className="section-label text-center mb-4">How It Works</p>
        <h2 className="font-display text-3xl md:text-4xl text-center text-credora-text mb-14">
          From Report to Ready-to-Mail in Minutes
        </h2>
        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              step: '01',
              title: 'Upload Your Report',
              desc: 'Upload your PDF credit report from any bureau or service — Experian, Credit Karma, myFICO, and more.',
            },
            {
              step: '02',
              title: 'AI Analyzes Every Line',
              desc: 'Credora AI scans 18+ FCRA/FDCPA rules: expired accounts, duplicates, medical debt, inquiry overload, status errors.',
            },
            {
              step: '03',
              title: 'Download & Mail',
              desc: 'Receive a ZIP of professional, bureau-specific dispute letters with legal citations. Print, sign, mail certified.',
            },
          ].map((s) => (
            <div key={s.step} className="card-elevated relative">
              <div className="font-display text-5xl font-bold text-credora-gold/20 mb-4 leading-none">
                {s.step}
              </div>
              <h3 className="text-credora-text font-semibold text-lg mb-3">{s.title}</h3>
              <p className="text-credora-muted text-sm leading-relaxed">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="max-w-6xl mx-auto px-6 md:px-12 py-20">
        <p className="section-label text-center mb-4">Pricing</p>
        <h2 className="font-display text-3xl md:text-4xl text-center text-credora-text mb-4">
          Choose Your Plan
        </h2>
        <p className="text-credora-muted text-center mb-14 max-w-lg mx-auto">
          Start with a single scan or run a complete multi-round repair campaign.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-start">
          {PLANS.map((plan) => (
            <PricingCard
              key={plan.name}
              {...plan}
              loading={loadingPlan === plan.name}
              onSelect={() => handleCheckout(plan.priceId, plan.name)}
            />
          ))}
        </div>
        <p className="text-center text-credora-muted/60 text-xs mt-8">
          Secure checkout via Stripe · 30-day money-back guarantee · No hidden fees
        </p>
      </section>

      {/* Footer */}
      <footer className="border-t border-credora-border py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 rounded-full bg-credora-gold/80" />
            <span className="font-display text-lg font-bold text-credora-text">Credora AI</span>
          </div>
          <p className="text-credora-muted text-xs text-center">
            © {new Date().getFullYear()} Credora AI · Powered by 700 Credit Club · Legal. Moral. Ethical &amp; Factual Credit Services.
          </p>
          <p className="text-credora-muted/50 text-xs">
            Not legal advice · FCRA dispute assistance only
          </p>
        </div>
      </footer>
    </main>
  );
}
