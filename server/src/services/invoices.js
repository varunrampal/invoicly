import { z } from "zod";
import { query, withTransaction } from "../db.js";
import { config } from "../config.js";
import { HttpError, notFound } from "../utils/httpError.js";
import { fromCents, toCents } from "../utils/money.js";

const statusValues = ["draft", "sent", "paid"];
const statusTransitions = {
  draft: ["sent"],
  sent: ["paid"],
  paid: []
};

export const invoiceSchema = z.object({
  clientName: z.string().trim().min(1, "Client name is required"),
  clientEmail: z.string().trim().email("Valid client email is required"),
  dueDate: z.string().optional().nullable(),
  notes: z.string().optional().default(""),
  currency: z.string().trim().length(3).optional(),
  taxRate: z.coerce.number().min(0).max(100).optional().default(0),
  lineItems: z
    .array(
      z.object({
        description: z.string().trim().min(1, "Line item description is required"),
        quantity: z.coerce.number().positive("Quantity must be greater than zero"),
        unitPrice: z.coerce.number().min(0, "Unit price cannot be negative")
      })
    )
    .min(1, "At least one line item is required")
});

export const statusSchema = z.object({
  status: z.enum(statusValues)
});

function normalizeDueDate(value) {
  if (!value) {
    return null;
  }

  return value;
}

function normalizeCurrency(value) {
  return (value || config.defaultCurrency).toUpperCase();
}

function calculateLineItems(lineItems) {
  return lineItems.map((item, index) => {
    const unitPriceCents = toCents(item.unitPrice);
    const amountCents = Math.round(Number(item.quantity) * unitPriceCents);

    return {
      description: item.description,
      quantity: Number(item.quantity),
      unitPriceCents,
      amountCents,
      position: index
    };
  });
}

function calculateTotals(lineItems, taxRate) {
  const subtotalCents = lineItems.reduce(
    (sum, item) => sum + item.amountCents,
    0
  );
  const taxCents = Math.round(subtotalCents * (Number(taxRate) / 100));

  return {
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents
  };
}

function formatInvoiceNumber(value) {
  return String(value || 0).padStart(4, "0");
}

export function toApiInvoice(row, lineItems = [], activities = []) {
  const sentHistory = activities
    .filter((activity) => activity.event_type === "sent")
    .map((activity) => ({
      id: activity.id,
      at: activity.occurred_at
    }));
  const emailedHistory = activities
    .filter((activity) => activity.event_type === "emailed")
    .map((activity) => ({
      id: activity.id,
      at: activity.occurred_at
    }));
  const paidActivity = activities
    .filter((activity) => activity.event_type === "paid")
    .at(-1);

  return {
    id: row.id,
    invoiceNumber: Number(row.invoice_number),
    invoiceNumberDisplay: formatInvoiceNumber(row.invoice_number),
    clientName: row.client_name,
    clientEmail: row.client_email,
    dueDate: row.due_date,
    notes: row.notes || "",
    status: row.status,
    currency: row.currency,
    taxRate: Number(row.tax_rate || 0),
    subtotalCents: row.subtotal_cents,
    taxCents: row.tax_cents,
    totalCents: row.total_cents,
    subtotal: fromCents(row.subtotal_cents),
    tax: fromCents(row.tax_cents),
    total: fromCents(row.total_cents),
    itemCount: Number(row.item_count || lineItems.length || 0),
    sendCount: Number(row.sent_count || 0),
    lastSentAt: row.last_sent_at,
    stripeCheckoutSessionId: row.stripe_checkout_session_id,
    stripePaymentUrl: row.stripe_payment_url,
    stripePaymentUrlExpiresAt: row.stripe_payment_url_expires_at,
    emailedCount: Number(row.emailed_count || 0),
    lastEmailedAt: row.last_emailed_at,
    sentHistory,
    emailedHistory,
    paidAt: paidActivity?.occurred_at || row.paid_at,
    paidAmountCents:
      paidActivity?.amount_cents ??
      (row.status === "paid" ? row.total_cents : null),
    paymentDeletable:
      row.status === "paid" && row.payment_source !== "stripe",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    lineItems: lineItems.map((item) => ({
      id: item.id,
      description: item.description,
      quantity: Number(item.quantity),
      unitPriceCents: item.unit_price_cents,
      amountCents: item.amount_cents,
      unitPrice: fromCents(item.unit_price_cents),
      amount: fromCents(item.amount_cents),
      position: item.position
    }))
  };
}

async function fetchInvoiceRows(client, userId, invoiceId) {
  const invoiceResult = await client.query(
    `SELECT *
     FROM invoices
     WHERE id = $1 AND user_id = $2`,
    [invoiceId, userId]
  );

  const invoice = invoiceResult.rows[0];

  if (!invoice) {
    return null;
  }

  const lineItemResult = await client.query(
    `SELECT *
     FROM line_items
     WHERE invoice_id = $1
     ORDER BY position ASC, created_at ASC`,
    [invoiceId]
  );

  const activityResult = await client.query(
    `SELECT *
     FROM invoice_activities
     WHERE invoice_id = $1
     ORDER BY occurred_at ASC, created_at ASC, id ASC`,
    [invoiceId]
  );

  return toApiInvoice(invoice, lineItemResult.rows, activityResult.rows);
}

export async function listInvoices(userId, status) {
  const params = [userId];
  const where = ["i.user_id = $1"];

  if (status) {
    if (!statusValues.includes(status)) {
      throw new HttpError(400, "Invalid invoice status filter");
    }

    params.push(status);
    where.push(`i.status = $${params.length}`);
  }

  const result = await query(
    `SELECT i.*, COUNT(li.id)::int AS item_count
     FROM invoices i
     LEFT JOIN line_items li ON li.invoice_id = i.id
     WHERE ${where.join(" AND ")}
     GROUP BY i.id
     ORDER BY i.created_at DESC`,
    params
  );

  return result.rows.map((row) => toApiInvoice(row));
}

export async function getInvoice(userId, invoiceId) {
  return withTransaction(async (client) => {
    const invoice = await fetchInvoiceRows(client, userId, invoiceId);

    if (!invoice) {
      throw notFound("Invoice not found");
    }

    return invoice;
  });
}

export async function createInvoice(userId, payload) {
  const input = invoiceSchema.parse(payload);
  const lineItems = calculateLineItems(input.lineItems);
  const totals = calculateTotals(lineItems, input.taxRate);

  return withTransaction(async (client) => {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1::text))", [
      userId
    ]);

    const invoiceNumberResult = await client.query(
      `SELECT COALESCE(MAX(invoice_number), 0) + 1 AS invoice_number
       FROM invoices
       WHERE user_id = $1`,
      [userId]
    );
    const invoiceNumber = Number(invoiceNumberResult.rows[0].invoice_number);

    if (invoiceNumber > 9999) {
      throw new HttpError(409, "Invoice number limit reached");
    }

    const invoiceResult = await client.query(
      `INSERT INTO invoices (
         user_id,
         invoice_number,
         client_name,
         client_email,
         due_date,
         notes,
         currency,
         tax_rate,
         subtotal_cents,
         tax_cents,
         total_cents
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [
        userId,
        invoiceNumber,
        input.clientName,
        input.clientEmail.toLowerCase(),
        normalizeDueDate(input.dueDate),
        input.notes || "",
        normalizeCurrency(input.currency),
        input.taxRate,
        totals.subtotalCents,
        totals.taxCents,
        totals.totalCents
      ]
    );

    const invoiceId = invoiceResult.rows[0].id;

    for (const item of lineItems) {
      await client.query(
        `INSERT INTO line_items (
           invoice_id,
           description,
           quantity,
           unit_price_cents,
           amount_cents,
           position
         )
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          invoiceId,
          item.description,
          item.quantity,
          item.unitPriceCents,
          item.amountCents,
          item.position
        ]
      );
    }

    return fetchInvoiceRows(client, userId, invoiceId);
  });
}

export async function updateInvoice(userId, invoiceId, payload) {
  const input = invoiceSchema.parse(payload);
  const lineItems = calculateLineItems(input.lineItems);
  const totals = calculateTotals(lineItems, input.taxRate);

  return withTransaction(async (client) => {
    const existing = await client.query(
      `SELECT status, stripe_payment_url
       FROM invoices
       WHERE id = $1 AND user_id = $2`,
      [invoiceId, userId]
    );

    if (!existing.rows[0]) {
      throw notFound("Invoice not found");
    }

    if (
      existing.rows[0].status !== "paid" &&
      existing.rows[0].stripe_payment_url
    ) {
      throw new HttpError(
        409,
        "Remove the payment link before editing this invoice"
      );
    }

    await client.query(
      `UPDATE invoices
       SET client_name = $1,
           client_email = $2,
           due_date = $3,
           notes = $4,
           currency = $5,
           tax_rate = $6,
           subtotal_cents = $7,
           tax_cents = $8,
           total_cents = $9
       WHERE id = $10 AND user_id = $11`,
      [
        input.clientName,
        input.clientEmail.toLowerCase(),
        normalizeDueDate(input.dueDate),
        input.notes || "",
        normalizeCurrency(input.currency),
        input.taxRate,
        totals.subtotalCents,
        totals.taxCents,
        totals.totalCents,
        invoiceId,
        userId
      ]
    );

    await client.query("DELETE FROM line_items WHERE invoice_id = $1", [
      invoiceId
    ]);

    for (const item of lineItems) {
      await client.query(
        `INSERT INTO line_items (
           invoice_id,
           description,
           quantity,
           unit_price_cents,
           amount_cents,
           position
         )
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          invoiceId,
          item.description,
          item.quantity,
          item.unitPriceCents,
          item.amountCents,
          item.position
        ]
      );
    }

    return fetchInvoiceRows(client, userId, invoiceId);
  });
}

export async function changeInvoiceStatus(userId, invoiceId, nextStatus) {
  const { status } = statusSchema.parse({ status: nextStatus });

  return withTransaction(async (client) => {
    const invoiceResult = await client.query(
      `SELECT status
       FROM invoices
       WHERE id = $1 AND user_id = $2`,
      [invoiceId, userId]
    );

    const invoice = invoiceResult.rows[0];

    if (!invoice) {
      throw notFound("Invoice not found");
    }

    if (status === "sent") {
      if (!["draft", "sent"].includes(invoice.status)) {
        throw new HttpError(
          409,
          `Invalid status change from ${invoice.status} to ${status}`
        );
      }

      await client.query(
        `UPDATE invoices
         SET status = 'sent',
             sent_count = sent_count + 1,
             last_sent_at = now()
         WHERE id = $1 AND user_id = $2`,
        [invoiceId, userId]
      );

      await client.query(
        `INSERT INTO invoice_activities (invoice_id, event_type, occurred_at)
         SELECT id, 'sent', last_sent_at
         FROM invoices
         WHERE id = $1 AND user_id = $2`,
        [invoiceId, userId]
      );

      return fetchInvoiceRows(client, userId, invoiceId);
    }

    if (invoice.status === status) {
      return fetchInvoiceRows(client, userId, invoiceId);
    }

    if (!statusTransitions[invoice.status].includes(status)) {
      throw new HttpError(
        409,
        `Invalid status change from ${invoice.status} to ${status}`
      );
    }

    const statusResult = await client.query(
      `UPDATE invoices
       SET status = $1,
           paid_at = CASE WHEN $1 = 'paid' THEN now() ELSE paid_at END,
           payment_source = CASE
             WHEN $1 = 'paid' THEN 'manual'
             ELSE payment_source
           END
       WHERE id = $2 AND user_id = $3`,
      [status, invoiceId, userId]
    );

    if (status === "paid" && statusResult.rowCount > 0) {
      await client.query(
        `INSERT INTO invoice_activities (
           invoice_id,
           event_type,
           amount_cents,
           occurred_at
         )
         SELECT id, 'paid', total_cents, paid_at
         FROM invoices
         WHERE id = $1 AND user_id = $2`,
        [invoiceId, userId]
      );
    }

    return fetchInvoiceRows(client, userId, invoiceId);
  });
}

export function sendInvoice(userId, invoiceId) {
  return changeInvoiceStatus(userId, invoiceId, "sent");
}

export async function deleteInvoice(userId, invoiceId) {
  const result = await query(
    `DELETE FROM invoices
     WHERE id = $1 AND user_id = $2 AND status <> 'paid'
     RETURNING id`,
    [invoiceId, userId]
  );

  if (!result.rows[0]) {
    const exists = await query(
      `SELECT id, status
       FROM invoices
       WHERE id = $1 AND user_id = $2`,
      [invoiceId, userId]
    );

    if (!exists.rows[0]) {
      throw notFound("Invoice not found");
    }

    throw new HttpError(409, "Paid invoices cannot be deleted");
  }
}

export async function attachCheckoutSession(
  invoiceId,
  sessionId,
  paymentUrl,
  paymentUrlExpiresAt
) {
  await query(
    `UPDATE invoices
     SET stripe_checkout_session_id = $1,
         stripe_payment_url = $2,
         stripe_payment_url_expires_at = $3
     WHERE id = $4`,
    [sessionId, paymentUrl, paymentUrlExpiresAt, invoiceId]
  );
}

export async function clearCheckoutSession(userId, invoiceId) {
  const result = await query(
    `UPDATE invoices
     SET stripe_checkout_session_id = NULL,
         stripe_payment_url = NULL,
         stripe_payment_url_expires_at = NULL
     WHERE id = $1 AND user_id = $2 AND status <> 'paid'
     RETURNING id`,
    [invoiceId, userId]
  );

  if (!result.rows[0]) {
    const invoice = await query(
      `SELECT status
       FROM invoices
       WHERE id = $1 AND user_id = $2`,
      [invoiceId, userId]
    );

    if (!invoice.rows[0]) {
      throw notFound("Invoice not found");
    }

    throw new HttpError(409, "Completed payments cannot be deleted");
  }
}

export async function deleteInvoicePayment(userId, invoiceId) {
  return withTransaction(async (client) => {
    const invoiceResult = await client.query(
      `SELECT status, sent_count, payment_source
       FROM invoices
       WHERE id = $1 AND user_id = $2`,
      [invoiceId, userId]
    );
    const invoice = invoiceResult.rows[0];

    if (!invoice) {
      throw notFound("Invoice not found");
    }

    if (invoice.status !== "paid") {
      throw new HttpError(409, "This invoice does not have a recorded payment");
    }

    if (invoice.payment_source === "stripe") {
      throw new HttpError(
        409,
        "Completed Stripe payments cannot be deleted here"
      );
    }

    await client.query(
      `UPDATE invoices
       SET status = CASE WHEN sent_count > 0 THEN 'sent' ELSE 'draft' END,
           paid_at = NULL,
           payment_source = NULL
       WHERE id = $1 AND user_id = $2`,
      [invoiceId, userId]
    );
    await client.query(
      `DELETE FROM invoice_activities
       WHERE invoice_id = $1 AND event_type = 'paid'`,
      [invoiceId]
    );

    return fetchInvoiceRows(client, userId, invoiceId);
  });
}

export async function markPaidFromCheckoutSession(invoiceId, sessionId) {
  return withTransaction(async (client) => {
    const params = [sessionId];
    const where = invoiceId
      ? "id = $2"
      : "stripe_checkout_session_id = $1";

    if (invoiceId) {
      params.push(invoiceId);
    }

    const result = await client.query(
      `UPDATE invoices
       SET status = 'paid',
           paid_at = COALESCE(paid_at, now()),
           payment_source = 'stripe',
           stripe_checkout_session_id = COALESCE(stripe_checkout_session_id, $1)
       WHERE ${where}
         AND status <> 'paid'
       RETURNING id, total_cents, paid_at`,
      params
    );
    const paidInvoice = result.rows[0];

    if (!paidInvoice) {
      return false;
    }

    await client.query(
      `INSERT INTO invoice_activities (
         invoice_id,
         event_type,
         amount_cents,
         occurred_at
       )
       VALUES ($1, 'paid', $2, $3)`,
      [paidInvoice.id, paidInvoice.total_cents, paidInvoice.paid_at]
    );

    return true;
  });
}

export async function recordInvoiceEmail(userId, invoiceId) {
  return withTransaction(async (client) => {
    const result = await client.query(
      `UPDATE invoices
       SET emailed_count = emailed_count + 1,
           last_emailed_at = now()
       WHERE id = $1 AND user_id = $2
       RETURNING *`,
      [invoiceId, userId]
    );

    if (!result.rows[0]) {
      throw notFound("Invoice not found");
    }

    await client.query(
      `INSERT INTO invoice_activities (invoice_id, event_type, occurred_at)
       VALUES ($1, 'emailed', $2)`,
      [invoiceId, result.rows[0].last_emailed_at]
    );

    return fetchInvoiceRows(client, userId, invoiceId);
  });
}
