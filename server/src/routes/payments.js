import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import {
  deleteInvoicePayment,
  markPaidFromCheckoutSession
} from "../services/invoices.js";
import {
  constructStripeWebhookEvent,
  createInvoicePaymentLink,
  deleteInvoicePaymentLink
} from "../services/stripeCheckout.js";

const router = Router();

router.post(
  "/invoices/:id/payment-link",
  requireAuth,
  async (req, res, next) => {
    try {
      const paymentLink = await createInvoicePaymentLink(req.user.id, req.params.id);
      res.status(paymentLink.reused ? 200 : 201).json(paymentLink);
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  "/invoices/:id/payment-link",
  requireAuth,
  async (req, res, next) => {
    try {
      const invoice = await deleteInvoicePaymentLink(
        req.user.id,
        req.params.id
      );
      res.json({ invoice });
    } catch (error) {
      next(error);
    }
  }
);

router.delete(
  "/invoices/:id/payment",
  requireAuth,
  async (req, res, next) => {
    try {
      const invoice = await deleteInvoicePayment(req.user.id, req.params.id);
      res.json({ invoice });
    } catch (error) {
      next(error);
    }
  }
);

router.post(
  "/invoices/:id/checkout-session",
  requireAuth,
  async (req, res, next) => {
    try {
      const paymentLink = await createInvoicePaymentLink(req.user.id, req.params.id);
      res.status(paymentLink.reused ? 200 : 201).json({
        url: paymentLink.paymentUrl,
        paymentUrl: paymentLink.paymentUrl,
        sessionId: paymentLink.sessionId,
        invoice: paymentLink.invoice
      });
    } catch (error) {
      next(error);
    }
  }
);

export async function handleStripeWebhook(req, res, next) {
  try {
    const signature = req.get("stripe-signature");
    const event = constructStripeWebhookEvent(req.body, signature);

    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const invoiceId = session.metadata?.invoiceId;

      await markPaidFromCheckoutSession(invoiceId, session.id);
    }

    res.json({ received: true });
  } catch (error) {
    next(error);
  }
}

export default router;
