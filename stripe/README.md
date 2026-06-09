# Stripe Integration — Setup Guide

Connect Stripe billing to your Vercel-deployed vibe-gate API.

---

## 1. Create a Stripe Account

- Go to [dashboard.stripe.com/register](https://dashboard.stripe.com/register)
- Sign up with your email and verify.
- Switch to **Test Mode** (toggle in top-right of Stripe dashboard) while developing.

---

## 2. Get Your API Keys

1. Go to [Stripe Dashboard → Developers → API keys](https://dashboard.stripe.com/test/apikeys)
2. Copy your **Secret key** (starts with `sk_`)
3. Keep the **Publishable key** (`pk_test_...`) — you'll use it in the frontend.

---

## 3. Set Vercel Environment Variables

In your Vercel project dashboard (or via CLI):

```bash
vercel env add STRIPE_SECRET_KEY
# Paste: YOUR_STRIPE_SECRET_KEY_HERE

vercel env add STRIPE_WEBHOOK_SECRET
# You'll get this in step 4 below
```

Also add an API key for the `/api/submit` endpoint:

```bash
vercel env add VIBE_GATE_API_KEY
# Use a strong random string, e.g.: openssl rand -hex 32
```

Redeploy after setting env vars:

```bash
vercel --prod
```

---

## 4. Create Products & Prices in Stripe

The `/api/plans` endpoint returns plan metadata for display. You must also create the corresponding **products and recurring prices** in the Stripe dashboard so `/api/checkout` can create sessions:

1. Go to [Stripe Dashboard → Products](https://dashboard.stripe.com/test/products)
2. Click **+ Add product**
3. For each plan below, create a product with a recurring price:

| Plan       | Price (USD/month) | Product Name          |
|------------|-------------------|-----------------------|
| Pro        | $29.00            | Vibe Gate Pro         |
| Growth     | $79.00            | Vibe Gate Growth      |
| Enterprise | Custom            | Vibe Gate Enterprise  |

4. After creating each price, copy the **Price ID** (starts with `price_...`). You'll pass it to `/api/checkout` as `priceId`.

---

## 5. Configure the Webhook Endpoint

1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/test/webhooks)
2. Click **Add endpoint**
3. **Endpoint URL**: `https://your-project.vercel.app/api/webhook`
4. **Events to send** (select these):
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `customer.subscription.paused`
   - `invoice.payment_failed`
5. Click **Add endpoint**
6. Reveal the **Signing secret** (`whsec_...`) and add it as `STRIPE_WEBHOOK_SECRET` in Vercel env vars (step 3).

---

## 6. Test Locally

Install the Stripe CLI and forward webhooks to your local dev server:

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe          # macOS
scoop install stripe                           # Windows

# Login
stripe login

# Forward webhooks to local Vercel dev server
stripe listen --forward-to localhost:3000/api/webhook

# The CLI will print a webhook signing secret — use it locally:
# STRIPE_WEBHOOK_SECRET=whsec_... vercel dev
```

Trigger a test event:

```bash
stripe trigger checkout.session.completed
```

---

## 7. Go Live

1. Switch Stripe dashboard from **Test** to **Live** mode
2. Copy your **live** secret key and webhook secret
3. Create products/prices in live mode
4. Update Vercel env vars with live keys
5. Update the webhook endpoint URL in Stripe to your production Vercel URL
6. Redeploy: `vercel --prod`

---

## Environment Variables Reference

| Variable               | Description                        | Example                  |
|------------------------|------------------------------------|--------------------------|
| `STRIPE_SECRET_KEY`    | Stripe secret API key              | `sk_live_...`            |
| `STRIPE_WEBHOOK_SECRET`| Stripe webhook signing secret      | `whsec_...`              |
| `VIBE_GATE_API_KEY`    | API key for /api/submit auth       | (random hex string)      |

---

## Troubleshooting

| Problem                              | Fix                                                                 |
|--------------------------------------|---------------------------------------------------------------------|
| `No such price` error on checkout    | Verify the `priceId` exists in Stripe dashboard and mode matches    |
| Webhook returns 400                  | Ensure `STRIPE_WEBHOOK_SECRET` matches the endpoint's signing secret|
| CORS errors in browser               | All endpoints set `Access-Control-Allow-Origin: *` — should work    |
| `Missing API key`                    | Add `STRIPE_SECRET_KEY` to Vercel environment variables             |
