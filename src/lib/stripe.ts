import Stripe from 'stripe';

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: '2026-06-24.dahlia',
  appInfo: {
    name: 'Mimic',
    version: '0.1.0',
  },
});
