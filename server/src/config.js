import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";

const here = path.dirname(fileURLToPath(import.meta.url));
const serverRoot = path.resolve(here, "..");
const projectRoot = path.resolve(serverRoot, "..");

dotenv.config({ path: path.join(projectRoot, ".env") });
dotenv.config({ path: path.join(serverRoot, ".env"), override: true });

export const config = {
  port: Number(process.env.PORT || 4000),
  clientUrl: process.env.CLIENT_URL || "http://localhost:5173",
  databaseUrl:
    process.env.DATABASE_URL ||
    "postgres://postgres:postgres@localhost:5432/invoicly",
  jwtSecret: process.env.JWT_SECRET || "dev-only-secret-change-me",
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  stripeSuccessUrl:
    process.env.STRIPE_SUCCESS_URL ||
    `${process.env.CLIENT_URL || "http://localhost:5173"}/?payment=success`,
  stripeCancelUrl:
    process.env.STRIPE_CANCEL_URL ||
    `${process.env.CLIENT_URL || "http://localhost:5173"}/?payment=cancelled`,
  defaultCurrency: (process.env.DEFAULT_CURRENCY || "USD").toUpperCase(),
  smtpHost: process.env.SMTP_HOST || "",
  smtpPort: Number(process.env.SMTP_PORT || 587),
  smtpSecure: String(process.env.SMTP_SECURE || "false").toLowerCase() === "true",
  smtpUser: process.env.SMTP_USER || "",
  smtpPass: process.env.SMTP_PASS || "",
  mailFrom: process.env.MAIL_FROM || ""
};
