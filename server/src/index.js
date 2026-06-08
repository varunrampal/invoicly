import express from "express";
import cors from "cors";
import { ZodError } from "zod";
import { config } from "./config.js";
import authRoutes from "./routes/auth.js";
import companyProfileRoutes from "./routes/companyProfiles.js";
import invoiceRoutes from "./routes/invoices.js";
import paymentRoutes, { handleStripeWebhook } from "./routes/payments.js";
import { HttpError } from "./utils/httpError.js";

const app = express();

function isAllowedOrigin(origin) {
  if (!origin) {
    return true;
  }

  if (origin === config.clientUrl) {
    return true;
  }

  try {
    const url = new URL(origin);
    return ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
  } catch {
    return false;
  }
}

app.post(
  "/api/payments/webhook",
  express.raw({ type: "application/json" }),
  handleStripeWebhook
);

app.use(
  cors({
    origin(origin, callback) {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
        return;
      }

      callback(new HttpError(403, "Origin not allowed by CORS"));
    }
  })
);
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({
    name: "Invoicly API",
    status: "ok",
    appUrl: config.clientUrl,
    healthUrl: "/api/health"
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/auth", authRoutes);
app.use("/api/company-profile", companyProfileRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/payments", paymentRoutes);

app.use((_req, _res, next) => {
  next(new HttpError(404, "Route not found"));
});

function getDatabaseSetupMessage(error) {
  const nestedCodes = error.errors?.map((nestedError) => nestedError.code) || [];
  const codes = new Set([error.code, ...nestedCodes]);

  if (codes.has("ECONNREFUSED")) {
    return "PostgreSQL is not reachable. Start PostgreSQL and check DATABASE_URL in .env.";
  }

  if (codes.has("28P01")) {
    return "PostgreSQL authentication failed. Update DATABASE_URL in .env with the correct username and password.";
  }

  if (codes.has("3D000")) {
    return "PostgreSQL database does not exist. Create the database named in DATABASE_URL, then run npm run db:init.";
  }

  if (codes.has("42P01")) {
    return "Database tables are missing. Run npm run db:init to initialize the schema.";
  }

  return null;
}

function getStripeStatus(error) {
  if (!String(error.type || "").startsWith("Stripe")) {
    return null;
  }

  if (error.type === "StripeSignatureVerificationError") {
    return 400;
  }

  return error.statusCode || 502;
}

app.use((error, _req, res, _next) => {
  if (error instanceof ZodError) {
    return res.status(400).json({
      error: error.issues.map((issue) => issue.message).join(", ")
    });
  }

  const databaseSetupMessage = getDatabaseSetupMessage(error);

  if (databaseSetupMessage) {
    return res.status(503).json({ error: databaseSetupMessage });
  }

  const stripeStatus = getStripeStatus(error);

  if (stripeStatus) {
    return res.status(stripeStatus).json({
      error: error.message || "Stripe request failed"
    });
  }

  const status = error.status || 500;
  const message = status >= 500 ? "Internal server error" : error.message;

  if (status >= 500) {
    console.error(error);
  }

  return res.status(status).json({ error: message });
});

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});
