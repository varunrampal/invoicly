CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  invoice_number INTEGER NOT NULL CHECK (invoice_number BETWEEN 1 AND 9999),
  client_name TEXT NOT NULL,
  client_email TEXT NOT NULL,
  due_date DATE,
  notes TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'sent', 'paid')),
  currency TEXT NOT NULL DEFAULT 'USD',
  tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate >= 0 AND tax_rate <= 100),
  subtotal_cents INTEGER NOT NULL DEFAULT 0 CHECK (subtotal_cents >= 0),
  tax_cents INTEGER NOT NULL DEFAULT 0 CHECK (tax_cents >= 0),
  total_cents INTEGER NOT NULL DEFAULT 0 CHECK (total_cents >= 0),
  sent_count INTEGER NOT NULL DEFAULT 0 CHECK (sent_count >= 0),
  last_sent_at TIMESTAMPTZ,
  stripe_checkout_session_id TEXT,
  stripe_payment_url TEXT,
  stripe_payment_url_expires_at TIMESTAMPTZ,
  emailed_count INTEGER NOT NULL DEFAULT 0 CHECK (emailed_count >= 0),
  last_emailed_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  payment_source TEXT CHECK (payment_source IN ('manual', 'stripe')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS invoice_number INTEGER;

WITH numbered AS (
  SELECT
    id,
    ROW_NUMBER() OVER (PARTITION BY user_id ORDER BY created_at ASC, id ASC) AS invoice_number
  FROM invoices
)
UPDATE invoices
SET invoice_number = numbered.invoice_number
FROM numbered
WHERE invoices.id = numbered.id
  AND (invoices.invoice_number IS NULL OR invoices.invoice_number <= 0);

ALTER TABLE invoices
ALTER COLUMN invoice_number SET NOT NULL;

ALTER TABLE invoices
DROP CONSTRAINT IF EXISTS invoices_invoice_number_range;

ALTER TABLE invoices
ADD CONSTRAINT invoices_invoice_number_range
CHECK (invoice_number BETWEEN 1 AND 9999);

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS sent_count INTEGER NOT NULL DEFAULT 0 CHECK (sent_count >= 0);

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS last_sent_at TIMESTAMPTZ;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS stripe_payment_url TEXT;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS stripe_payment_url_expires_at TIMESTAMPTZ;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS emailed_count INTEGER NOT NULL DEFAULT 0 CHECK (emailed_count >= 0);

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS last_emailed_at TIMESTAMPTZ;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS paid_at TIMESTAMPTZ;

ALTER TABLE invoices
ADD COLUMN IF NOT EXISTS payment_source TEXT;

UPDATE invoices
SET payment_source = CASE
  WHEN stripe_checkout_session_id IS NOT NULL THEN 'stripe'
  ELSE 'manual'
END
WHERE status = 'paid' AND payment_source IS NULL;

ALTER TABLE invoices
DROP CONSTRAINT IF EXISTS invoices_payment_source_check;

ALTER TABLE invoices
ADD CONSTRAINT invoices_payment_source_check
CHECK (payment_source IN ('manual', 'stripe'));

CREATE TABLE IF NOT EXISTS company_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  company_name TEXT NOT NULL DEFAULT '',
  logo_url TEXT NOT NULL DEFAULT '',
  logo_data_url TEXT NOT NULL DEFAULT '',
  address_line1 TEXT NOT NULL DEFAULT '',
  address_line2 TEXT NOT NULL DEFAULT '',
  city TEXT NOT NULL DEFAULT '',
  state TEXT NOT NULL DEFAULT '',
  postal_code TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  contact_name TEXT NOT NULL DEFAULT '',
  contact_email TEXT NOT NULL DEFAULT '',
  contact_phone TEXT NOT NULL DEFAULT '',
  website TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE company_profiles
ADD COLUMN IF NOT EXISTS logo_data_url TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS line_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  quantity NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  unit_price_cents INTEGER NOT NULL CHECK (unit_price_cents >= 0),
  amount_cents INTEGER NOT NULL CHECK (amount_cents >= 0),
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS invoice_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL CHECK (event_type IN ('sent', 'emailed', 'paid')),
  amount_cents INTEGER CHECK (amount_cents IS NULL OR amount_cents >= 0),
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO invoice_activities (invoice_id, event_type, occurred_at)
SELECT i.id, 'sent', i.last_sent_at
FROM invoices i
WHERE i.last_sent_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM invoice_activities activity
    WHERE activity.invoice_id = i.id
      AND activity.event_type = 'sent'
      AND activity.occurred_at = i.last_sent_at
  );

INSERT INTO invoice_activities (invoice_id, event_type, occurred_at)
SELECT i.id, 'emailed', i.last_emailed_at
FROM invoices i
WHERE i.last_emailed_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM invoice_activities activity
    WHERE activity.invoice_id = i.id
      AND activity.event_type = 'emailed'
      AND activity.occurred_at = i.last_emailed_at
  );

INSERT INTO invoice_activities (invoice_id, event_type, amount_cents, occurred_at)
SELECT i.id, 'paid', i.total_cents, i.paid_at
FROM invoices i
WHERE i.paid_at IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM invoice_activities activity
    WHERE activity.invoice_id = i.id
      AND activity.event_type = 'paid'
  );

CREATE INDEX IF NOT EXISTS invoices_user_id_idx ON invoices(user_id);
CREATE UNIQUE INDEX IF NOT EXISTS invoices_user_invoice_number_uidx
ON invoices(user_id, invoice_number);
CREATE INDEX IF NOT EXISTS invoices_status_idx ON invoices(status);
CREATE INDEX IF NOT EXISTS company_profiles_user_id_idx ON company_profiles(user_id);
CREATE INDEX IF NOT EXISTS line_items_invoice_id_idx ON line_items(invoice_id);
CREATE INDEX IF NOT EXISTS invoice_activities_invoice_id_idx
ON invoice_activities(invoice_id, occurred_at);

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS users_set_updated_at ON users;
CREATE TRIGGER users_set_updated_at
BEFORE UPDATE ON users
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS invoices_set_updated_at ON invoices;
CREATE TRIGGER invoices_set_updated_at
BEFORE UPDATE ON invoices
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

DROP TRIGGER IF EXISTS company_profiles_set_updated_at ON company_profiles;
CREATE TRIGGER company_profiles_set_updated_at
BEFORE UPDATE ON company_profiles
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
