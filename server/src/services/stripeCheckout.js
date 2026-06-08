import Stripe from "stripe";
import { config } from "../config.js";
import { HttpError } from "../utils/httpError.js";
import {
  attachCheckoutSession,
  clearCheckoutSession,
  getInvoice
} from "./invoices.js";

let stripeClient;

function isPlaceholder(value) {
  const normalized = String(value || "").trim().toLowerCase();

  return (
    !normalized ||
    normalized.includes("replace_me") ||
    normalized.includes("replace-with") ||
    normalized.endsWith("_")
  );
}

function hasSecretPrefix(value, prefixes) {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

function assertStripeSecretKey() {
  const key = String(config.stripeSecretKey || "").trim();

  if (
    isPlaceholder(key) ||
    !hasSecretPrefix(key, ["sk_test_", "sk_live_"]) ||
    key.length < 16
  ) {
    throw new HttpError(
      400,
      "Stripe secret key is not configured. Set STRIPE_SECRET_KEY in .env to your full Stripe secret key."
    );
  }

  return key;
}

function assertStripeWebhookSecret() {
  const secret = String(config.stripeWebhookSecret || "").trim();

  if (isPlaceholder(secret) || !secret.startsWith("whsec_") || secret.length < 16) {
    throw new HttpError(
      400,
      "Stripe webhook secret is not configured. Set STRIPE_WEBHOOK_SECRET in .env from the Stripe webhook signing secret."
    );
  }

  return secret;
}

export function stripe() {
  const secretKey = assertStripeSecretKey();

  if (!stripeClient) {
    stripeClient = new Stripe(secretKey);
  }

  return stripeClient;
}

function addUrlParams(url, params) {
  const parsed = new URL(url);

  for (const [key, value] of Object.entries(params)) {
    parsed.searchParams.set(key, value);
  }

  return parsed.toString();
}

function hasUsablePaymentUrl(invoice) {
  if (!invoice.stripePaymentUrl || !invoice.stripePaymentUrlExpiresAt) {
    return false;
  }

  const expiresAt = new Date(invoice.stripePaymentUrlExpiresAt).getTime();
  const fiveMinutesFromNow = Date.now() + 5 * 60 * 1000;

  return Number.isFinite(expiresAt) && expiresAt > fiveMinutesFromNow;
}

export async function createInvoicePaymentLink(userId, invoiceId) {
  const invoice = await getInvoice(userId, invoiceId);

  if (invoice.status === "paid") {
    throw new HttpError(409, "Paid invoices do not need a payment link");
  }

  if (invoice.totalCents <= 0) {
    throw new HttpError(409, "Invoice total must be greater than zero");
  }

  if (hasUsablePaymentUrl(invoice)) {
    return {
      invoice,
      paymentUrl: invoice.stripePaymentUrl,
      sessionId: invoice.stripeCheckoutSessionId,
      reused: true
    };
  }

  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    customer_email: invoice.clientEmail,
    success_url: addUrlParams(config.stripeSuccessUrl, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumberDisplay
    }),
    cancel_url: addUrlParams(config.stripeCancelUrl, {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumberDisplay
    }),
    line_items: [
      {
        price_data: {
          currency: invoice.currency.toLowerCase(),
          unit_amount: invoice.totalCents,
          product_data: {
            name: `Invoice ${invoice.invoiceNumberDisplay}`,
            description: `Payment for ${invoice.clientName}`
          }
        },
        quantity: 1
      }
    ],
    metadata: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumberDisplay,
      userId
    }
  });

  const expiresAt = session.expires_at
    ? new Date(session.expires_at * 1000).toISOString()
    : null;

  await attachCheckoutSession(invoice.id, session.id, session.url, expiresAt);

  return {
    invoice: await getInvoice(userId, invoiceId),
    paymentUrl: session.url,
    sessionId: session.id,
    reused: false
  };
}

export async function deleteInvoicePaymentLink(userId, invoiceId) {
  const invoice = await getInvoice(userId, invoiceId);

  if (invoice.status === "paid") {
    throw new HttpError(409, "Completed payments cannot be deleted");
  }

  if (invoice.stripeCheckoutSessionId) {
    try {
      const session = await stripe().checkout.sessions.retrieve(
        invoice.stripeCheckoutSessionId
      );

      if (session.payment_status === "paid") {
        throw new HttpError(
          409,
          "This Stripe session is already paid and cannot be deleted"
        );
      }

      if (session.status === "open") {
        await stripe().checkout.sessions.expire(invoice.stripeCheckoutSessionId);
      }
    } catch (error) {
      if (error instanceof HttpError) {
        throw error;
      }

      if (error?.statusCode !== 404) {
        throw error;
      }
    }
  }

  await clearCheckoutSession(userId, invoiceId);

  return getInvoice(userId, invoiceId);
}

export function constructStripeWebhookEvent(body, signature) {
  const webhookSecret = assertStripeWebhookSecret();

  return stripe().webhooks.constructEvent(body, signature, webhookSecret);
}
