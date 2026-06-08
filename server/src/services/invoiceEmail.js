import nodemailer from "nodemailer";
import { config } from "../config.js";
import { HttpError } from "../utils/httpError.js";
import { generateInvoicePdf } from "./invoicePdf.js";

function money(cents, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency
  }).format((Number(cents) || 0) / 100);
}

function invoiceNumber(invoice) {
  return invoice.invoiceNumberDisplay || String(invoice.invoiceNumber || "").padStart(4, "0");
}

function formatDate(value) {
  if (!value) {
    return "Not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium"
  }).format(new Date(value));
}

function cleanLines(lines) {
  return lines.map((line) => String(line || "").trim()).filter(Boolean);
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function isConfigured(value) {
  const normalized = String(value || "").trim().toLowerCase();

  return (
    normalized &&
    normalized !== "replace_me" &&
    !normalized.includes("example.com")
  );
}

function assertMailConfig(from) {
  if (!isConfigured(config.smtpHost) || !isConfigured(from)) {
    throw new HttpError(
      400,
      "Email is not configured. Set SMTP_HOST and MAIL_FROM in .env."
    );
  }

  if (
    (config.smtpUser || config.smtpPass) &&
    (!isConfigured(config.smtpUser) || !isConfigured(config.smtpPass))
  ) {
    throw new HttpError(
      400,
      "Email SMTP auth is incomplete. Set both SMTP_USER and SMTP_PASS in .env."
    );
  }
}

function transporter() {
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort,
    secure: config.smtpSecure,
    auth: config.smtpUser
      ? {
          user: config.smtpUser,
          pass: config.smtpPass
        }
      : undefined
  });
}

function companySignature(companyProfile) {
  return cleanLines([
    companyProfile.companyName,
    companyProfile.addressLine1,
    companyProfile.addressLine2,
    cleanLines([
      companyProfile.city,
      companyProfile.state,
      companyProfile.postalCode
    ]).join(", "),
    companyProfile.country,
    companyProfile.contactEmail,
    companyProfile.contactPhone,
    companyProfile.website
  ]);
}

function buildText({ invoice, companyProfile, paymentUrl }) {
  return cleanLines([
    `Hello ${invoice.clientName},`,
    "",
    `${companyProfile.companyName || "Invoicly"} sent invoice #${invoiceNumber(invoice)}.`,
    `Total: ${money(invoice.totalCents, invoice.currency)}`,
    `Due date: ${formatDate(invoice.dueDate)}`,
    paymentUrl && invoice.status !== "paid" ? `Pay online: ${paymentUrl}` : "",
    invoice.status === "paid" ? "This invoice has been marked paid." : "",
    "",
    "The invoice PDF is attached.",
    "",
    ...companySignature(companyProfile)
  ]).join("\n");
}

function buildHtml({ invoice, companyProfile, paymentUrl }) {
  const sender = companyProfile.companyName || "Invoicly";
  const paymentHtml =
    paymentUrl && invoice.status !== "paid"
      ? `<p><a href="${escapeHtml(paymentUrl)}">Pay invoice online</a></p>`
      : "";
  const paidHtml =
    invoice.status === "paid" ? "<p>This invoice has been marked paid.</p>" : "";
  const signature = companySignature(companyProfile)
    .map((line) => escapeHtml(line))
    .join("<br>");

  return `
    <div style="font-family: Arial, sans-serif; color: #17202a; line-height: 1.5;">
      <p>Hello ${escapeHtml(invoice.clientName)},</p>
      <p>${escapeHtml(sender)} sent invoice #${escapeHtml(invoiceNumber(invoice))}.</p>
      <p>
        <strong>Total:</strong> ${escapeHtml(money(invoice.totalCents, invoice.currency))}<br>
        <strong>Due date:</strong> ${escapeHtml(formatDate(invoice.dueDate))}
      </p>
      ${paymentHtml}
      ${paidHtml}
      <p>The invoice PDF is attached.</p>
      ${signature ? `<p>${signature}</p>` : ""}
    </div>
  `;
}

export async function sendInvoiceEmail({ invoice, companyProfile, paymentUrl = "" }) {
  const from = config.mailFrom || companyProfile.contactEmail;

  assertMailConfig(from);

  if (!invoice.clientEmail) {
    throw new HttpError(400, "Invoice client email is required");
  }

  const pdf = await generateInvoicePdf({ invoice, companyProfile, paymentUrl });
  const subject = `Invoice #${invoiceNumber(invoice)} from ${
    companyProfile.companyName || "Invoicly"
  }`;

  return transporter().sendMail({
    from,
    to: invoice.clientEmail,
    subject,
    text: buildText({ invoice, companyProfile, paymentUrl }),
    html: buildHtml({ invoice, companyProfile, paymentUrl }),
    attachments: [
      {
        filename: `invoice-${invoiceNumber(invoice)}.pdf`,
        content: pdf,
        contentType: "application/pdf"
      }
    ]
  });
}
