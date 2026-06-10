# Invoicly

Invoice and payment app built with React, Node.js, PostgreSQL, JWT authentication, and Stripe Checkout.

## Phase

- User registration and login with JWT auth
- Company profile setup for logo, name, address, and contact details
- Create, edit, and delete invoices
- Automatic per-user 4-digit invoice numbers
- Add line items and calculate totals automatically on the server
- Invoice status flow: Draft -> Sent -> Paid
- Send and resend invoices, with send count and latest sent timestamp tracked
- Export saved invoices to PDF
- Stripe payment links for saved invoices
- Email invoices to clients with Nodemailer, including the PDF attachment and payment link
- Stripe webhook handler marks checkout-completed invoices as paid

<img width="1908" height="966" alt="Invoicly" src="https://github.com/user-attachments/assets/fe2a10e9-9c7d-4c6c-a8f1-4133a389eb03" />


