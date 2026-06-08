import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { getCompanyProfile } from "../services/companyProfiles.js";
import { sendInvoiceEmail } from "../services/invoiceEmail.js";
import { generateInvoicePdf } from "../services/invoicePdf.js";
import {
  changeInvoiceStatus,
  createInvoice,
  deleteInvoice,
  getInvoice,
  listInvoices,
  recordInvoiceEmail,
  sendInvoice,
  updateInvoice
} from "../services/invoices.js";
import { createInvoicePaymentLink } from "../services/stripeCheckout.js";

const router = Router();

router.use(requireAuth);

router.get("/", async (req, res, next) => {
  try {
    const invoices = await listInvoices(req.user.id, req.query.status);
    res.json({ invoices });
  } catch (error) {
    next(error);
  }
});

router.post("/", async (req, res, next) => {
  try {
    const invoice = await createInvoice(req.user.id, req.body);
    res.status(201).json({ invoice });
  } catch (error) {
    next(error);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const invoice = await getInvoice(req.user.id, req.params.id);
    res.json({ invoice });
  } catch (error) {
    next(error);
  }
});

router.get("/:id/pdf", async (req, res, next) => {
  try {
    let invoice = await getInvoice(req.user.id, req.params.id);
    const companyProfile = await getCompanyProfile(req.user.id);
    let paymentUrl = "";

    if (invoice.status !== "paid") {
      const paymentLink = await createInvoicePaymentLink(req.user.id, req.params.id);
      invoice = paymentLink.invoice;
      paymentUrl = paymentLink.paymentUrl;
    }

    const pdf = await generateInvoicePdf({
      invoice,
      companyProfile,
      paymentUrl
    });
    const filename = `invoice-${invoice.invoiceNumberDisplay}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Length", pdf.length);
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    res.send(pdf);
  } catch (error) {
    next(error);
  }
});

router.put("/:id", async (req, res, next) => {
  try {
    const invoice = await updateInvoice(req.user.id, req.params.id, req.body);
    res.json({ invoice });
  } catch (error) {
    next(error);
  }
});

router.patch("/:id/status", async (req, res, next) => {
  try {
    const invoice = await changeInvoiceStatus(
      req.user.id,
      req.params.id,
      req.body.status
    );
    res.json({ invoice });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/send", async (req, res, next) => {
  try {
    const invoice = await sendInvoice(req.user.id, req.params.id);
    const companyProfile = await getCompanyProfile(req.user.id);
    res.json({ invoice, companyProfile });
  } catch (error) {
    next(error);
  }
});

router.post("/:id/email", async (req, res, next) => {
  try {
    let invoice = await getInvoice(req.user.id, req.params.id);
    const companyProfile = await getCompanyProfile(req.user.id);
    let paymentUrl = "";

    if (invoice.status !== "paid") {
      const paymentLink = await createInvoicePaymentLink(req.user.id, req.params.id);
      invoice = paymentLink.invoice;
      paymentUrl = paymentLink.paymentUrl;
    }

    const emailInvoice =
      invoice.status === "paid"
        ? invoice
        : {
            ...invoice,
            status: "sent",
            sendCount: invoice.sendCount + 1,
            lastSentAt: new Date().toISOString()
          };

    const emailResult = await sendInvoiceEmail({
      invoice: emailInvoice,
      companyProfile,
      paymentUrl
    });

    if (invoice.status !== "paid") {
      invoice = await sendInvoice(req.user.id, req.params.id);
    }

    invoice = await recordInvoiceEmail(req.user.id, req.params.id);

    res.json({
      invoice,
      companyProfile,
      paymentUrl,
      email: {
        messageId: emailResult.messageId
      }
    });
  } catch (error) {
    next(error);
  }
});

router.delete("/:id", async (req, res, next) => {
  try {
    await deleteInvoice(req.user.id, req.params.id);
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
