import type { Handler } from '@netlify/functions';
import Stripe from 'stripe';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

const PLAN_METADATA: Record<string, { name: string; mode: 'payment' | 'subscription' }> = {
  [process.env.NEXT_PUBLIC_STRIPE_PRICE_SCAN   ?? 'price_jeci_scan']:   { name: 'JECI Scan',   mode: 'payment' },
  [process.env.NEXT_PUBLIC_STRIPE_PRICE_SWEEP  ?? 'price_jeci_sweep']:  { name: 'JECI Sweep',  mode: 'payment' },
  [process.env.NEXT_PUBLIC_STRIPE_PRICE_REPAIR ?? 'price_jeci_repair']: { name: 'JECI Repair', mode: 'subscription' },
  [process.env.NEXT_PUBLIC_STRIPE_PRICE_BOOST  ?? 'price_jeci_boost']:  { name: 'JECI Boost',  mode: 'payment' },
};

export const handler: Handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const { priceId, planName } = JSON.parse(event.body ?? '{}');
    if (!priceId) return { statusCode: 400, body: JSON.stringify({ error: 'Missing priceId' }) };

    const meta = PLAN_METADATA[priceId];
    const mode = meta?.mode ?? 'payment';
    const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${baseUrl}/dashboard?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${baseUrl}/?canceled=true`,
      metadata: { plan: planName ?? meta?.name ?? priceId, priceId },
      allow_promotion_codes: true,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('[JECI/stripe-checkout]', message);
    return { statusCode: 500, body: JSON.stringify({ error: message }) };
  }
};
