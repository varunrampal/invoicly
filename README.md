# Invoicly

Invoice and payment app built with React, Node.js, PostgreSQL, JWT authentication, and Stripe Checkout.

## Phase 1

- User registration and login with JWT auth
- Company profile setup for logo, name, address, and contact details
- Create, edit, and delete invoices
- Automatic per-user 4-digit invoice numbers, starting at `0001`
- Add line items and calculate totals automatically on the server
- Invoice status flow: Draft -> Sent -> Paid
- Send and resend invoices, with send count and latest sent timestamp tracked
- Export saved invoices to PDF
- Stripe payment links for saved invoices
- Email invoices to clients with Nodemailer, including the PDF attachment and payment link
- Stripe webhook handler marks checkout-completed invoices as paid

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Create a PostgreSQL database named `invoicly`.

3. Copy `.env.example` to `.env` and update the values.

4. Initialize the database:

   ```bash
   npm run db:init
   ```

5. Start the app:

   ```bash
   npm run dev
   ```

The React app runs on `http://localhost:5173`.

The API runs on `http://localhost:4000`. Its health check is `http://localhost:4000/api/health`, and the API root returns a small JSON status response.

## PDF Export

Authenticated users can download a saved invoice PDF from `GET /api/invoices/:id/pdf`. For unpaid invoices, PDF export creates or reuses a Stripe Checkout link and renders a clickable Pay Now button plus a backup URL. The PDF also includes invoice details, line items, totals, notes, and the saved company profile. Uploaded logos are embedded when saved as the app-generated JPEG logo.

## Company Profile

Authenticated users can save sender details at `PUT /api/company-profile`. The profile supports a hosted logo URL and an uploaded logo saved as a cropped, resized `512 x 512` image data URL. The invoice send endpoint returns the saved `companyProfile` with the invoice so the email invoice template can render the logo, company name, address, and contact details.

## Stripe Webhook

Saved invoices can create or reuse a Stripe Checkout payment link through `POST /api/payments/invoices/:id/payment-link`. The older `POST /api/payments/invoices/:id/checkout-session` endpoint is still available for compatibility.

For local testing, forward Stripe webhook events to the API:

```bash
stripe listen --forward-to localhost:4000/api/payments/webhook
```

Use the webhook signing secret from the Stripe CLI output as `STRIPE_WEBHOOK_SECRET`.

## Email Invoices

Configure SMTP values in `.env`, then use `POST /api/invoices/:id/email` or the Email button in the app. Emailing a draft or sent invoice creates or reuses its Stripe payment link, sends the invoice PDF to the client with that link included, marks the invoice as sent, and records the email count.

Required SMTP values:

```bash
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=replace_me
SMTP_PASS=replace_me
MAIL_FROM="Invoicly <billing@example.com>"
```
