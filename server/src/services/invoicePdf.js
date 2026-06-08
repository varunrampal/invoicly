import PDFDocument from "pdfkit";

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

function logoBufferFromDataUrl(dataUrl) {
  const match = /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/.exec(
    dataUrl || ""
  );

  if (!match) {
    return null;
  }

  return Buffer.from(match[1], "base64");
}

function drawWrappedLines(doc, lines, x, y, options = {}) {
  let cursorY = y;
  const lineGap = options.lineGap ?? 2;

  for (const line of lines) {
    doc.text(line, x, cursorY, {
      width: options.width,
      align: options.align || "left",
      lineGap
    });
    cursorY += doc.heightOfString(line, {
      width: options.width,
      lineGap
    });
  }

  return cursorY;
}

function ensureSpace(doc, y, neededHeight) {
  const bottom = doc.page.height - 56;

  if (y + neededHeight <= bottom) {
    return y;
  }

  doc.addPage();
  return 56;
}

function drawTableHeader(doc, y) {
  const left = 50;
  const right = doc.page.width - 50;

  doc
    .rect(left, y, right - left, 28)
    .fill("#eef6f7")
    .fillColor("#17202a")
    .font("Helvetica-Bold")
    .fontSize(9);

  doc.text("Description", left + 10, y + 9, { width: 235 });
  doc.text("Qty", left + 260, y + 9, { width: 55, align: "right" });
  doc.text("Unit", left + 325, y + 9, { width: 80, align: "right" });
  doc.text("Amount", left + 415, y + 9, { width: 95, align: "right" });

  return y + 28;
}

function drawPayNowButton(doc, paymentUrl, x, y) {
  const buttonWidth = 142;
  const buttonHeight = 34;

  doc
    .roundedRect(x, y, buttonWidth, buttonHeight, 6)
    .fill("#166776");
  doc
    .fillColor("#ffffff")
    .font("Helvetica-Bold")
    .fontSize(12)
    .text("Pay Now", x, y + 10, {
      width: buttonWidth,
      align: "center"
    });
  doc.link(x, y, buttonWidth, buttonHeight, paymentUrl);

  return y + buttonHeight;
}

export function generateInvoicePdf({ invoice, companyProfile, paymentUrl = "" }) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: "LETTER",
      margin: 50,
      info: {
        Title: `Invoice ${invoiceNumber(invoice)}`,
        Author: companyProfile.companyName || "Invoicly"
      }
    });
    const chunks = [];

    doc.on("data", (chunk) => chunks.push(chunk));
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    const left = 50;
    const right = doc.page.width - 50;
    const contentWidth = right - left;
    let y = 50;

    const logoBuffer = logoBufferFromDataUrl(companyProfile.logoDataUrl);

    if (logoBuffer) {
      try {
        doc.image(logoBuffer, left, y, {
          fit: [86, 86],
          align: "center",
          valign: "center"
        });
      } catch {
        doc
          .roundedRect(left, y, 86, 86, 4)
          .strokeColor("#cfd6dd")
          .stroke();
      }
    } else {
      doc
        .roundedRect(left, y, 86, 86, 4)
        .strokeColor("#cfd6dd")
        .stroke()
        .fillColor("#66717d")
        .font("Helvetica-Bold")
        .fontSize(10)
        .text("LOGO", left, y + 36, { width: 86, align: "center" });
    }

    const companyLines = cleanLines([
      companyProfile.companyName,
      companyProfile.addressLine1,
      companyProfile.addressLine2,
      cleanLines([
        companyProfile.city,
        companyProfile.state,
        companyProfile.postalCode
      ]).join(", "),
      companyProfile.country,
      companyProfile.contactName,
      companyProfile.contactEmail,
      companyProfile.contactPhone,
      companyProfile.website,
      !logoBuffer && companyProfile.logoUrl ? `Logo: ${companyProfile.logoUrl}` : ""
    ]);

    doc
      .fillColor("#17202a")
      .font("Helvetica-Bold")
      .fontSize(16)
      .text(companyProfile.companyName || "Company profile not set", left + 106, y, {
        width: 235
      });
    doc.font("Helvetica").fontSize(9).fillColor("#4b5561");
    drawWrappedLines(doc, companyLines.slice(1), left + 106, y + 23, {
      width: 235
    });

    doc
      .fillColor("#17202a")
      .font("Helvetica-Bold")
      .fontSize(28)
      .text("INVOICE", right - 175, y, {
        width: 175,
        align: "right"
      });
    doc
      .font("Helvetica")
      .fontSize(10)
      .fillColor("#4b5561")
      .text(`#${invoiceNumber(invoice)}`, right - 175, y + 35, {
        width: 175,
        align: "right"
      })
      .text(`Status: ${invoice.status.toUpperCase()}`, right - 175, y + 52, {
        width: 175,
        align: "right"
      })
      .text(`Created: ${formatDate(invoice.createdAt)}`, right - 175, y + 69, {
        width: 175,
        align: "right"
      });

    y += 122;
    doc.moveTo(left, y).lineTo(right, y).strokeColor("#d9dee4").stroke();
    y += 24;

    doc.fillColor("#17202a").font("Helvetica-Bold").fontSize(11);
    doc.text("Bill to", left, y);
    doc.text("Invoice details", right - 220, y, { width: 220, align: "right" });
    y += 20;

    doc.font("Helvetica").fontSize(10).fillColor("#4b5561");
    const billToBottom = drawWrappedLines(
      doc,
      cleanLines([invoice.clientName, invoice.clientEmail]),
      left,
      y,
      { width: 245 }
    );
    const detailBottom = drawWrappedLines(
      doc,
      cleanLines([
        `Due date: ${formatDate(invoice.dueDate)}`,
        `Currency: ${invoice.currency}`,
        `Sent: ${invoice.sendCount || 0} time${invoice.sendCount === 1 ? "" : "s"}`,
        invoice.lastSentAt ? `Last sent: ${formatDate(invoice.lastSentAt)}` : ""
      ]),
      right - 220,
      y,
      { width: 220, align: "right" }
    );

    y = Math.max(billToBottom, detailBottom) + 28;
    y = drawTableHeader(doc, y);

    doc.font("Helvetica").fontSize(9);

    for (const item of invoice.lineItems) {
      const descriptionHeight = doc.heightOfString(item.description, {
        width: 235,
        lineGap: 2
      });
      const rowHeight = Math.max(34, descriptionHeight + 16);

      y = ensureSpace(doc, y, rowHeight + 42);

      if (y === 56) {
        y = drawTableHeader(doc, y);
      }

      doc
        .rect(left, y, contentWidth, rowHeight)
        .fill("#ffffff")
        .strokeColor("#edf0f3")
        .stroke()
        .fillColor("#17202a");

      doc.text(item.description, left + 10, y + 9, {
        width: 235,
        lineGap: 2
      });
      doc.text(String(item.quantity), left + 260, y + 9, {
        width: 55,
        align: "right"
      });
      doc.text(money(item.unitPriceCents, invoice.currency), left + 325, y + 9, {
        width: 80,
        align: "right"
      });
      doc.text(money(item.amountCents, invoice.currency), left + 415, y + 9, {
        width: 95,
        align: "right"
      });

      y += rowHeight;
    }

    y = ensureSpace(doc, y + 24, 120);

    const totalsX = right - 220;
    doc.font("Helvetica").fontSize(10).fillColor("#4b5561");
    doc.text("Subtotal", totalsX, y, { width: 100 });
    doc.text(money(invoice.subtotalCents, invoice.currency), totalsX + 100, y, {
      width: 120,
      align: "right"
    });
    y += 20;
    doc.text(`Tax (${invoice.taxRate}%)`, totalsX, y, { width: 100 });
    doc.text(money(invoice.taxCents, invoice.currency), totalsX + 100, y, {
      width: 120,
      align: "right"
    });
    y += 16;
    doc.moveTo(totalsX, y).lineTo(right, y).strokeColor("#d9dee4").stroke();
    y += 12;
    doc.font("Helvetica-Bold").fontSize(15).fillColor("#17202a");
    doc.text("Total", totalsX, y, { width: 100 });
    doc.text(money(invoice.totalCents, invoice.currency), totalsX + 100, y, {
      width: 120,
      align: "right"
    });

    if (paymentUrl && invoice.status !== "paid") {
      y = ensureSpace(doc, y + 54, 128);
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#17202a").text("Payment", left, y);
      const buttonBottom = drawPayNowButton(doc, paymentUrl, left, y + 20);
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor("#4b5561")
        .text("Use this backup link if the button does not open:", left, buttonBottom + 12, {
          width: contentWidth * 0.68
        });
      doc
        .fillColor("#166776")
        .text(paymentUrl, left, buttonBottom + 28, {
          width: contentWidth * 0.68,
          lineGap: 2,
          link: paymentUrl
        });
      y = buttonBottom + 28 + doc.heightOfString(paymentUrl, {
        width: contentWidth * 0.68,
        lineGap: 2
      });
    }

    if (invoice.notes) {
      y = ensureSpace(doc, y + 54, 80);
      doc.font("Helvetica-Bold").fontSize(11).fillColor("#17202a").text("Notes", left, y);
      doc
        .font("Helvetica")
        .fontSize(10)
        .fillColor("#4b5561")
        .text(invoice.notes, left, y + 18, { width: contentWidth * 0.68, lineGap: 2 });
    }

    doc.end();
  });
}
