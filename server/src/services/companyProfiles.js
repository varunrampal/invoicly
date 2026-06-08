import { z } from "zod";
import { query } from "../db.js";

const textField = (maxLength) =>
  z.string().trim().max(maxLength).optional().default("");

const optionalEmail = z
  .string()
  .trim()
  .refine((value) => value === "" || z.string().email().safeParse(value).success, {
    message: "Valid contact email is required"
  })
  .optional()
  .default("");

const optionalUrl = z
  .string()
  .trim()
  .refine((value) => value === "" || z.string().url().safeParse(value).success, {
    message: "A valid URL is required"
  })
  .optional()
  .default("");

const logoDataUrl = z
  .string()
  .trim()
  .max(900_000, "Uploaded logo is too large")
  .refine(
    (value) =>
      value === "" ||
      /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(value),
    {
      message: "Uploaded logo must be a JPEG data image"
    }
  )
  .optional()
  .default("");

export const companyProfileSchema = z.object({
  companyName: textField(160),
  logoUrl: optionalUrl,
  logoDataUrl,
  addressLine1: textField(200),
  addressLine2: textField(200),
  city: textField(120),
  state: textField(120),
  postalCode: textField(40),
  country: textField(120),
  contactName: textField(120),
  contactEmail: optionalEmail,
  contactPhone: textField(80),
  website: optionalUrl
});

export function emptyCompanyProfile() {
  return {
    companyName: "",
    logoUrl: "",
    logoDataUrl: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    state: "",
    postalCode: "",
    country: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
    website: ""
  };
}

function toApiCompanyProfile(row) {
  if (!row) {
    return emptyCompanyProfile();
  }

  return {
    id: row.id,
    companyName: row.company_name,
    logoUrl: row.logo_url,
    logoDataUrl: row.logo_data_url,
    addressLine1: row.address_line1,
    addressLine2: row.address_line2,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    country: row.country,
    contactName: row.contact_name,
    contactEmail: row.contact_email,
    contactPhone: row.contact_phone,
    website: row.website,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export async function getCompanyProfile(userId) {
  const result = await query(
    `SELECT *
     FROM company_profiles
     WHERE user_id = $1`,
    [userId]
  );

  return toApiCompanyProfile(result.rows[0]);
}

export async function upsertCompanyProfile(userId, payload) {
  const input = companyProfileSchema.parse(payload);
  const result = await query(
    `INSERT INTO company_profiles (
       user_id,
       company_name,
       logo_url,
       logo_data_url,
       address_line1,
       address_line2,
       city,
       state,
       postal_code,
       country,
       contact_name,
       contact_email,
       contact_phone,
       website
     )
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     ON CONFLICT (user_id)
     DO UPDATE SET
       company_name = EXCLUDED.company_name,
       logo_url = EXCLUDED.logo_url,
       logo_data_url = EXCLUDED.logo_data_url,
       address_line1 = EXCLUDED.address_line1,
       address_line2 = EXCLUDED.address_line2,
       city = EXCLUDED.city,
       state = EXCLUDED.state,
       postal_code = EXCLUDED.postal_code,
       country = EXCLUDED.country,
       contact_name = EXCLUDED.contact_name,
       contact_email = EXCLUDED.contact_email,
       contact_phone = EXCLUDED.contact_phone,
       website = EXCLUDED.website
     RETURNING *`,
    [
      userId,
      input.companyName,
      input.logoUrl,
      input.logoDataUrl,
      input.addressLine1,
      input.addressLine2,
      input.city,
      input.state,
      input.postalCode,
      input.country,
      input.contactName,
      input.contactEmail,
      input.contactPhone,
      input.website
    ]
  );

  return toApiCompanyProfile(result.rows[0]);
}
