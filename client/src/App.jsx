import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Check,
  ChevronDown,
  Download,
  FilePlus,
  Link2,
  LogOut,
  Mail,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  Trash2,
  Upload,
  X
} from "lucide-react";
import {
  api,
  clearStoredToken,
  downloadApiFile,
  getStoredToken,
  storeToken
} from "./api.js";

const emptyItem = () => ({
  description: "",
  quantity: 1,
  unitPrice: 0
});

const emptyForm = () => ({
  id: null,
  invoiceNumberDisplay: "",
  clientName: "",
  clientEmail: "",
  dueDate: "",
  notes: "",
  currency: "USD",
  taxRate: 0,
  status: "draft",
  sendCount: 0,
  lastSentAt: null,
  sentHistory: [],
  stripePaymentUrl: "",
  stripePaymentUrlExpiresAt: null,
  emailedCount: 0,
  lastEmailedAt: null,
  emailedHistory: [],
  paidAt: null,
  paidAmountCents: null,
  paymentDeletable: false,
  lineItems: [emptyItem()]
});

const emptyCompanyProfile = () => ({
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
});

function money(cents, currency = "USD") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency
  }).format((Number(cents) || 0) / 100);
}

function calculatePreview(form) {
  const subtotalCents = form.lineItems.reduce((sum, item) => {
    const quantity = Number(item.quantity) || 0;
    const unitPriceCents = Math.round((Number(item.unitPrice) || 0) * 100);
    return sum + Math.round(quantity * unitPriceCents);
  }, 0);
  const taxCents = Math.round(subtotalCents * ((Number(form.taxRate) || 0) / 100));

  return {
    subtotalCents,
    taxCents,
    totalCents: subtotalCents + taxCents
  };
}

function fromInvoice(invoice) {
  return {
    id: invoice.id,
    invoiceNumberDisplay: invoice.invoiceNumberDisplay || "",
    clientName: invoice.clientName,
    clientEmail: invoice.clientEmail,
    dueDate: invoice.dueDate ? invoice.dueDate.slice(0, 10) : "",
    notes: invoice.notes || "",
    currency: invoice.currency || "USD",
    taxRate: invoice.taxRate || 0,
    status: invoice.status,
    sendCount: invoice.sendCount || 0,
    lastSentAt: invoice.lastSentAt || null,
    sentHistory: invoice.sentHistory || [],
    stripePaymentUrl: invoice.stripePaymentUrl || "",
    stripePaymentUrlExpiresAt: invoice.stripePaymentUrlExpiresAt || null,
    emailedCount: invoice.emailedCount || 0,
    lastEmailedAt: invoice.lastEmailedAt || null,
    emailedHistory: invoice.emailedHistory || [],
    paidAt: invoice.paidAt || null,
    paidAmountCents: invoice.paidAmountCents ?? null,
    paymentDeletable: Boolean(invoice.paymentDeletable),
    lineItems:
      invoice.lineItems?.length > 0
        ? invoice.lineItems.map((item) => ({
            description: item.description,
            quantity: Number(item.quantity),
            unitPrice: Number(item.unitPrice)
          }))
        : [emptyItem()]
  };
}

function statusLabel(status) {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function formatDateTime(value) {
  if (!value) {
    return "";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function resizeLogoFile(file) {
  return new Promise((resolve, reject) => {
    const allowedTypes = ["image/png", "image/jpeg", "image/webp"];

    if (!allowedTypes.includes(file.type)) {
      reject(new Error("Choose a PNG, JPEG, or WebP image."));
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      reject(new Error("Choose an image smaller than 5 MB."));
      return;
    }

    const reader = new FileReader();

    reader.onload = () => {
      const image = new Image();

      image.onload = () => {
        const outputSize = 512;
        const sourceSize = Math.min(image.naturalWidth, image.naturalHeight);
        const sourceX = Math.floor((image.naturalWidth - sourceSize) / 2);
        const sourceY = Math.floor((image.naturalHeight - sourceSize) / 2);
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");

        canvas.width = outputSize;
        canvas.height = outputSize;
        context.clearRect(0, 0, outputSize, outputSize);
        context.imageSmoothingEnabled = true;
        context.imageSmoothingQuality = "high";
        context.drawImage(
          image,
          sourceX,
          sourceY,
          sourceSize,
          sourceSize,
          0,
          0,
          outputSize,
          outputSize
        );

        resolve(canvas.toDataURL("image/jpeg", 0.9));
      };

      image.onerror = () => reject(new Error("Could not load that image."));
      image.src = reader.result;
    };

    reader.onerror = () => reject(new Error("Could not read that image."));
    reader.readAsDataURL(file);
  });
}

function AuthScreen({ onSignedIn }) {
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      const payload =
        mode === "register"
          ? form
          : { email: form.email, password: form.password };
      const data = await api(`/auth/${mode}`, {
        method: "POST",
        body: payload
      });
      storeToken(data.token);
      onSignedIn(data.user);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-layout">
      <section className="auth-panel">
        <div className="auth-heading">
          <img
            className="auth-logo"
            src="/assets/invoicly-logo.png"
            alt="Invoicly"
          />
          {/* <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1> */}
        </div>

        <div className="segmented" role="tablist" aria-label="Authentication mode">
          <button
            className={mode === "login" ? "active" : ""}
            type="button"
            onClick={() => setMode("login")}
          >
            Login
          </button>
          <button
            className={mode === "register" ? "active" : ""}
            type="button"
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>

        <form onSubmit={submit} className="stack">
          {mode === "register" && (
            <label>
              Name
              <input
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                autoComplete="name"
              />
            </label>
          )}

          <label>
            Email
            <input
              type="email"
              value={form.email}
              onChange={(event) =>
                setForm((current) => ({ ...current, email: event.target.value }))
              }
              autoComplete="email"
            />
          </label>

          <label>
            Password
            <input
              type="password"
              value={form.password}
              onChange={(event) =>
                setForm((current) => ({ ...current, password: event.target.value }))
              }
              autoComplete={mode === "register" ? "new-password" : "current-password"}
            />
          </label>

          {error && <p className="alert">{error}</p>}

          <button className="primary" type="submit" disabled={loading}>
            {loading ? "Working..." : mode === "login" ? "Login" : "Register"}
          </button>
        </form>
      </section>
    </main>
  );
}

function InvoiceList({ invoices, selectedId, onSelect, onNew, onRefresh }) {
  return (
    <aside className="invoice-list panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Invoices</p>
          <h2>{invoices.length} total</h2>
        </div>
        <div className="icon-row">
          <button className="icon-button" type="button" onClick={onRefresh} title="Refresh">
            <RefreshCw size={18} />
          </button>
          <button className="icon-button accent" type="button" onClick={onNew} title="New invoice">
            <FilePlus size={18} />
          </button>
        </div>
      </div>

      <div className="list-stack">
        {invoices.map((invoice) => (
          <button
            className={`invoice-row ${invoice.id === selectedId ? "selected" : ""}`}
            key={invoice.id}
            type="button"
            onClick={() => onSelect(invoice.id)}
          >
            <span>
              <strong>{invoice.clientName}</strong>
              <small>
                #{invoice.invoiceNumberDisplay || "----"} - {invoice.clientEmail}
              </small>
            </span>
            <span className="row-meta">
              <b>{money(invoice.totalCents, invoice.currency)}</b>
              <em className={`status ${invoice.status}`}>{statusLabel(invoice.status)}</em>
            </span>
          </button>
        ))}

        {invoices.length === 0 && (
          <div className="empty-state">
            <p>No invoices yet.</p>
            <button className="secondary" type="button" onClick={onNew}>
              <Plus size={16} />
              Invoice
            </button>
          </div>
        )}
      </div>
    </aside>
  );
}

function InvoiceEditor({
  form,
  setForm,
  onSave,
  onDelete,
  onSend,
  onExportPdf,
  onStatusChange,
  onPaymentLink,
  onEmailInvoice,
  onEdit,
  onCancelEdit,
  isEditing,
  saving
}) {
  const totals = useMemo(() => calculatePreview(form), [form]);
  const paid = form.status === "paid";
  const locked = form.id && !isEditing;

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  function updateItem(index, field, value) {
    setForm((current) => ({
      ...current,
      lineItems: current.lineItems.map((item, itemIndex) =>
        itemIndex === index ? { ...item, [field]: value } : item
      )
    }));
  }

  function addItem() {
    setForm((current) => ({
      ...current,
      lineItems: [...current.lineItems, emptyItem()]
    }));
  }

  function removeItem(index) {
    setForm((current) => ({
      ...current,
      lineItems:
        current.lineItems.length === 1
          ? [emptyItem()]
          : current.lineItems.filter((_, itemIndex) => itemIndex !== index)
    }));
  }

  return (
    <section className="editor panel">
      <div className="editor-toolbar">
        <div>
          {/* <p className="eyebrow">Editor</p> */}
          <h2>
            {form.id ? `Invoice #${form.invoiceNumberDisplay || "----"}` : "Invoice"}
          </h2>
        </div>
        <div className="actions">
          <span className={`status ${form.status}`}>{statusLabel(form.status)}</span>
          {form.id && (
            <button className="secondary" type="button" onClick={onExportPdf}>
              <Download size={16} />
              PDF
            </button>
          )}
          {form.id && !isEditing && (
            <button className="secondary" type="button" onClick={onEdit}>
              <Pencil size={16} />
              Edit
            </button>
          )}
          {form.id && form.status === "draft" && !isEditing && (
            <button className="secondary" type="button" onClick={onSend}>
              <Send size={16} />
              Mark sent
            </button>
          )}
          {form.id && form.status !== "paid" && !isEditing && (
            <button className="secondary" type="button" onClick={onPaymentLink}>
              <Link2 size={16} />
              Payment link
            </button>
          )}
          {form.id && !isEditing && (
            <button className="secondary" type="button" onClick={onEmailInvoice}>
              <Mail size={16} />
              Email
            </button>
          )}
          {form.id && form.status === "sent" && !isEditing && (
            <>
              <button className="secondary" type="button" onClick={onSend}>
                <Send size={16} />
                Mark sent again
              </button>
              <button className="secondary" type="button" onClick={() => onStatusChange("paid")}>
                <Check size={16} />
                Paid
              </button>
            </>
          )}
          {form.id && (
            <button
              className="icon-button danger"
              type="button"
              onClick={onDelete}
              disabled={paid}
              title="Delete invoice"
            >
              <Trash2 size={18} />
            </button>
          )}
          {form.id && isEditing && (
            <button className="secondary" type="button" onClick={onCancelEdit}>
              <X size={16} />
              Cancel
            </button>
          )}
          {(!form.id || isEditing) && (
            <button
              className="primary"
              type="button"
              onClick={onSave}
              disabled={saving}
            >
              <Save size={16} />
              {saving ? "Saving..." : "Save"}
            </button>
          )}
        </div>
      </div>

      <div className="form-grid">
        <label>
          Client name
          <input
            value={form.clientName}
            onChange={(event) => updateField("clientName", event.target.value)}
            disabled={locked}
          />
        </label>
        <label>
          Client email
          <input
            type="email"
            value={form.clientEmail}
            onChange={(event) => updateField("clientEmail", event.target.value)}
            disabled={locked}
          />
        </label>
        <label>
          Due date
          <input
            type="date"
            value={form.dueDate}
            onChange={(event) => updateField("dueDate", event.target.value)}
            disabled={locked}
          />
        </label>
        <label>
          Tax %
          <input
            type="number"
            min="0"
            max="100"
            step="0.01"
            value={form.taxRate}
            onChange={(event) => updateField("taxRate", event.target.value)}
            disabled={locked}
          />
        </label>
      </div>

      <label>
        Notes
        <textarea
          value={form.notes}
          onChange={(event) => updateField("notes", event.target.value)}
          disabled={locked}
          rows="3"
        />
      </label>

      <div className="line-items">
        <div className="line-heading">
          <h3>Line items</h3>
          <button className="secondary" type="button" onClick={addItem} disabled={locked}>
            <Plus size={16} />
            Add
          </button>
        </div>

        <div className="line-table">
          <div className="line-table-head">
            <span>Description</span>
            <span>Qty</span>
            <span>Unit</span>
            <span>Total</span>
            <span></span>
          </div>

          {form.lineItems.map((item, index) => {
            const amountCents = Math.round(
              (Number(item.quantity) || 0) * Math.round((Number(item.unitPrice) || 0) * 100)
            );

            return (
              <div className="line-row" key={index}>
                <input
                  value={item.description}
                  onChange={(event) => updateItem(index, "description", event.target.value)}
                  disabled={locked}
                />
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={item.quantity}
                  onChange={(event) => updateItem(index, "quantity", event.target.value)}
                  disabled={locked}
                />
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={item.unitPrice}
                  onChange={(event) => updateItem(index, "unitPrice", event.target.value)}
                  disabled={locked}
                />
                <strong>{money(amountCents, form.currency)}</strong>
                <button
                  className="icon-button"
                  type="button"
                  onClick={() => removeItem(index)}
                  disabled={locked}
                  title="Remove line item"
                >
                  <X size={16} />
                </button>
              </div>
            );
          })}
        </div>
      </div>

      <div className="totals">
        <span>Subtotal</span>
        <strong>{money(totals.subtotalCents, form.currency)}</strong>
        <span>Tax</span>
        <strong>{money(totals.taxCents, form.currency)}</strong>
        <span>Total</span>
        <strong className="grand-total">{money(totals.totalCents, form.currency)}</strong>
      </div>
    </section>
  );
}

function activityHistory(history, lastAt, count, type) {
  if (history.length > 0) {
    return history;
  }

  if (count > 0 && lastAt) {
    return [{ id: `legacy-${type}-${lastAt}`, at: lastAt }];
  }

  return [];
}

function ActivityDetails({
  icon,
  title,
  emptyLabel,
  count,
  history,
  latestAt,
  type
}) {
  const entries = activityHistory(history, latestAt, count, type);

  return (
    <details className="activity-item">
      <summary>
        <span className="activity-marker">{icon}</span>
        <span className="activity-summary">
          <strong>{title}</strong>
          <small>
            {latestAt ? `Latest ${formatDateTime(latestAt)}` : emptyLabel}
          </small>
        </span>
        <ChevronDown className="activity-chevron" size={17} />
      </summary>
      <div className="activity-history">
        {entries.length > 0 ? (
          entries
            .slice()
            .reverse()
            .map((entry, index) => (
              <div className="activity-history-entry" key={entry.id}>
                <span>{formatDateTime(entry.at)}</span>
                <small>{index === 0 ? "Latest" : `#${count - index}`}</small>
              </div>
            ))
        ) : (
          <p>{emptyLabel}</p>
        )}
        {count > entries.length && (
          <p className="activity-history-note">
            {count - entries.length} earlier {type} event
            {count - entries.length === 1 ? "" : "s"} occurred before timeline
            tracking.
          </p>
        )}
      </div>
    </details>
  );
}

function InvoiceActivity({
  form,
  onRemovePaymentLink,
  onDeletePayment
}) {
  const paidAmountCents =
    form.paidAmountCents ?? calculatePreview(form).totalCents;
  const paidDetail = [
    form.paidAt ? formatDateTime(form.paidAt) : "Payment date unavailable",
    money(paidAmountCents, form.currency)
  ].join(" - ");

  return (
    <aside className="invoice-activity panel">
      <div className="panel-heading">
        <div>
          {/* <p className="eyebrow">Timeline</p> */}
          <h2>Invoice Activity</h2>
        </div>
      </div>

      {!form.id ? (
        <p className="activity-empty">
          Save the invoice to start tracking its activity.
        </p>
      ) : (
        <div className="activity-timeline">
          <ActivityDetails
            icon={<Send size={17} />}
            title={`Sent ${form.sendCount} ${
              form.sendCount === 1 ? "time" : "times"
            }`}
            emptyLabel="Not sent yet"
            count={form.sendCount}
            history={form.sentHistory}
            latestAt={form.lastSentAt}
            type="sent"
          />

          <ActivityDetails
            icon={<Mail size={17} />}
            title={`Emailed ${form.emailedCount} ${
              form.emailedCount === 1 ? "time" : "times"
            }`}
            emptyLabel="Not emailed yet"
            count={form.emailedCount}
            history={form.emailedHistory}
            latestAt={form.lastEmailedAt}
            type="emailed"
          />

          <div
            className={`activity-item payment ${
              form.status === "paid" ? "complete" : ""
            }`}
          >
            <span className="activity-marker">
              {form.status === "paid" ? (
                <Check size={17} />
              ) : (
                <Link2 size={17} />
              )}
            </span>
            <span className="activity-payment-content">
              <span className="activity-summary">
                <strong>{form.status === "paid" ? "Paid" : "Payment"}</strong>
                <small>
                  {form.status === "paid"
                    ? paidDetail
                    : form.stripePaymentUrl
                      ? "Stripe payment link ready"
                      : "Payment link not created"}
                </small>
              </span>
     
              {form.status === "paid" && form.paymentDeletable && (
                <button
                  className="activity-action danger"
                  type="button"
                  onClick={onDeletePayment}
                >
                  Delete payment
                </button>
              )}
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}

function CompanySettings({ profile, setProfile, onSave, saving, onMessage }) {
  const logoPreview = profile.logoDataUrl || profile.logoUrl;

  function updateField(field, value) {
    setProfile((current) => ({ ...current, [field]: value }));
  }

  async function handleLogoUpload(event) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) {
      return;
    }

    try {
      const logoDataUrl = await resizeLogoFile(file);
      updateField("logoDataUrl", logoDataUrl);
      onMessage("Logo cropped and resized. Save the profile to keep it.");
    } catch (error) {
      onMessage(error.message);
    }
  }

  function removeUploadedLogo() {
    updateField("logoDataUrl", "");
    onMessage("Uploaded logo removed. Save the profile to keep this change.");
  }

  return (
    <section className="company-settings panel">
      <div className="panel-heading">
        <div>
          <p className="eyebrow">Company Details</p>
          {/* <h2>Invoice sender</h2> */}
        </div>
        <button className="primary" type="button" onClick={onSave} disabled={saving}>
          <Save size={16} />
          {saving ? "Saving..." : "Save"}
        </button>
      </div>

      <div className="company-layout">
        <div className="logo-preview">
          {logoPreview ? (
            <img src={logoPreview} alt={profile.companyName || "Company logo"} />
          ) : (
            <Building2 size={46} />
          )}
        </div>

        <div className="settings-stack">
          <div className="logo-actions">
            <label className="upload-button">
              <Upload size={16} />
              Upload logo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                onChange={handleLogoUpload}
              />
            </label>
            <button
              className="secondary"
              type="button"
              onClick={removeUploadedLogo}
              disabled={!profile.logoDataUrl}
            >
              <X size={16} />
              Remove upload
            </button>
            <span className="logo-hint">512 x 512 JPEG after crop</span>
          </div>

          <div className="form-grid two-column">
            <label>
              Company name
              <input
                value={profile.companyName}
                onChange={(event) => updateField("companyName", event.target.value)}
              />
            </label>
            <label>
              Hosted logo URL
              <input
                value={profile.logoUrl}
                onChange={(event) => updateField("logoUrl", event.target.value)}
              />
            </label>
          </div>

          <div className="form-grid two-column">
            <label>
              Address line 1
              <input
                value={profile.addressLine1}
                onChange={(event) => updateField("addressLine1", event.target.value)}
              />
            </label>
            <label>
              Address line 2
              <input
                value={profile.addressLine2}
                onChange={(event) => updateField("addressLine2", event.target.value)}
              />
            </label>
          </div>

          <div className="form-grid four-column">
            <label>
              City
              <input
                value={profile.city}
                onChange={(event) => updateField("city", event.target.value)}
              />
            </label>
            <label>
              State
              <input
                value={profile.state}
                onChange={(event) => updateField("state", event.target.value)}
              />
            </label>
            <label>
              Postal code
              <input
                value={profile.postalCode}
                onChange={(event) => updateField("postalCode", event.target.value)}
              />
            </label>
            <label>
              Country
              <input
                value={profile.country}
                onChange={(event) => updateField("country", event.target.value)}
              />
            </label>
          </div>

          <div className="form-grid four-column">
            <label>
              Contact name
              <input
                value={profile.contactName}
                onChange={(event) => updateField("contactName", event.target.value)}
              />
            </label>
            <label>
              Contact email
              <input
                type="email"
                value={profile.contactEmail}
                onChange={(event) => updateField("contactEmail", event.target.value)}
              />
            </label>
            <label>
              Contact phone
              <input
                value={profile.contactPhone}
                onChange={(event) => updateField("contactPhone", event.target.value)}
              />
            </label>
            <label>
              Website
              <input
                value={profile.website}
                onChange={(event) => updateField("website", event.target.value)}
              />
            </label>
          </div>
        </div>
      </div>
    </section>
  );
}

export default function App() {
  const [user, setUser] = useState(null);
  const [invoices, setInvoices] = useState([]);
  const [companyProfile, setCompanyProfile] = useState(emptyCompanyProfile());
  const [activeView, setActiveView] = useState("invoices");
  const [form, setForm] = useState(emptyForm());
  const [selectedId, setSelectedId] = useState(null);
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [isEditingInvoice, setIsEditingInvoice] = useState(true);
  const [companySaving, setCompanySaving] = useState(false);
  const [booting, setBooting] = useState(Boolean(getStoredToken()));
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const accountMenuRef = useRef(null);

  async function loadInvoices(nextSelectedId = selectedId) {
    const data = await api("/invoices");
    setInvoices(data.invoices);

    if (nextSelectedId) {
      await selectInvoice(nextSelectedId);
    }
  }

  async function selectInvoice(id) {
    const data = await api(`/invoices/${id}`);
    setSelectedId(id);
    setForm(fromInvoice(data.invoice));
    setIsEditingInvoice(false);
  }

  useEffect(() => {
    async function boot() {
      if (!getStoredToken()) {
        setBooting(false);
        return;
      }

      try {
        const me = await api("/auth/me");
        setUser(me.user);
        const invoiceData = await api("/invoices");
        setInvoices(invoiceData.invoices);
        const profileData = await api("/company-profile");
        setCompanyProfile(profileData.companyProfile);

        const params = new URLSearchParams(window.location.search);
        if (params.get("payment") === "success") {
          setMessage("Payment completed. The webhook will update the invoice status.");
        }
        if (params.get("payment") === "cancelled") {
          setMessage("Payment cancelled.");
        }
      } catch {
        clearStoredToken();
      } finally {
        setBooting(false);
      }
    }

    boot();
  }, []);

  useEffect(() => {
    if (!accountMenuOpen) {
      return undefined;
    }

    function closeOnOutsideClick(event) {
      if (!accountMenuRef.current?.contains(event.target)) {
        setAccountMenuOpen(false);
      }
    }

    function closeOnEscape(event) {
      if (event.key === "Escape") {
        setAccountMenuOpen(false);
      }
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);

  async function handleSignedIn(nextUser) {
    setUser(nextUser);
    const data = await api("/invoices");
    setInvoices(data.invoices);
    const profileData = await api("/company-profile");
    setCompanyProfile(profileData.companyProfile);
  }

  function handleLogout() {
    clearStoredToken();
    setAccountMenuOpen(false);
    setUser(null);
    setInvoices([]);
    setCompanyProfile(emptyCompanyProfile());
    setActiveView("invoices");
    setForm(emptyForm());
    setSelectedId(null);
    setIsEditingInvoice(true);
  }

  function handleNew() {
    setSelectedId(null);
    setForm(emptyForm());
    setMessage("");
    setIsEditingInvoice(true);
  }

  function handleEditInvoice() {
    if (form.status !== "paid" && form.stripePaymentUrl) {
      setMessage("Remove the payment link before editing this invoice.");
      return;
    }

    setIsEditingInvoice(true);
    setMessage("");
  }

  async function handleCancelEdit() {
    if (!form.id) {
      return;
    }

    try {
      await selectInvoice(form.id);
      setMessage("Changes discarded.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleSave() {
    setSaving(true);
    setMessage("");

    try {
      const payload = {
        clientName: form.clientName,
        clientEmail: form.clientEmail,
        dueDate: form.dueDate || null,
        notes: form.notes,
        currency: form.currency,
        taxRate: Number(form.taxRate) || 0,
        lineItems: form.lineItems.map((item) => ({
          description: item.description,
          quantity: Number(item.quantity),
          unitPrice: Number(item.unitPrice)
        }))
      };

      const data = await api(form.id ? `/invoices/${form.id}` : "/invoices", {
        method: form.id ? "PUT" : "POST",
        body: payload
      });

      setForm(fromInvoice(data.invoice));
      setSelectedId(data.invoice.id);
      setIsEditingInvoice(false);
      setMessage("Invoice saved.");
      await loadInvoices(data.invoice.id);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!form.id || !window.confirm("Delete this invoice?")) {
      return;
    }

    try {
      await api(`/invoices/${form.id}`, { method: "DELETE" });
      setMessage("Invoice deleted.");
      setSelectedId(null);
      setForm(emptyForm());
      setIsEditingInvoice(true);
      await loadInvoices(null);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleStatusChange(status) {
    try {
      const data = await api(`/invoices/${form.id}/status`, {
        method: "PATCH",
        body: { status }
      });
      setForm(fromInvoice(data.invoice));
      setMessage(`Invoice marked ${statusLabel(status)}.`);
      await loadInvoices(data.invoice.id);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleSendInvoice() {
    try {
      const data = await api(`/invoices/${form.id}/send`, {
        method: "POST"
      });
      setForm(fromInvoice(data.invoice));
      if (data.companyProfile) {
        setCompanyProfile(data.companyProfile);
      }
      setMessage(
        data.invoice.sendCount > 1
          ? `Invoice send recorded again. ${data.invoice.sendCount} sends recorded.`
          : "Invoice marked sent."
      );
      await loadInvoices(data.invoice.id);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleExportPdf() {
    if (!form.id) {
      return;
    }

    try {
      const { blob, filename } = await downloadApiFile(`/invoices/${form.id}/pdf`);
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");

      link.href = url;
      link.download = filename || `invoice-${form.invoiceNumberDisplay || "download"}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("Invoice PDF exported.");
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handlePaymentLink() {
    if (!form.id) {
      return;
    }

    try {
      const data = await api(`/payments/invoices/${form.id}/payment-link`, {
        method: "POST"
      });
      let copied = false;

      if (data.paymentUrl && navigator.clipboard) {
        try {
          await navigator.clipboard.writeText(data.paymentUrl);
          copied = true;
        } catch {
          copied = false;
        }
      }

      setForm(fromInvoice(data.invoice));
      setMessage(
        copied
          ? "Stripe payment link copied to clipboard."
          : "Stripe payment link is ready."
      );
      await loadInvoices(data.invoice.id);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleRemovePaymentLink() {
    if (
      !form.id ||
      !form.stripePaymentUrl ||
      !window.confirm(
        "Delete this payment link? The existing Stripe checkout link will stop working."
      )
    ) {
      return;
    }

    try {
      const data = await api(
        `/payments/invoices/${form.id}/payment-link`,
        { method: "DELETE" }
      );
      setForm(fromInvoice(data.invoice));
      setMessage("Payment link deleted.");
      await loadInvoices(data.invoice.id);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleDeletePayment() {
    if (
      !form.id ||
      form.status !== "paid" ||
      !form.paymentDeletable ||
      !window.confirm(
        "Delete this recorded payment? The invoice will return to its previous unpaid status."
      )
    ) {
      return;
    }

    try {
      const data = await api(`/payments/invoices/${form.id}/payment`, {
        method: "DELETE"
      });
      setForm(fromInvoice(data.invoice));
      setIsEditingInvoice(false);
      setMessage("Recorded payment deleted.");
      await loadInvoices(data.invoice.id);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleEmailInvoice() {
    if (!form.id) {
      return;
    }

    try {
      const data = await api(`/invoices/${form.id}/email`, {
        method: "POST"
      });
      setForm(fromInvoice(data.invoice));
      if (data.companyProfile) {
        setCompanyProfile(data.companyProfile);
      }
      setMessage(`Invoice emailed to ${data.invoice.clientEmail}.`);
      await loadInvoices(data.invoice.id);
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function handleCompanyProfileSave() {
    setCompanySaving(true);
    setMessage("");

    try {
      const data = await api("/company-profile", {
        method: "PUT",
        body: companyProfile
      });
      setCompanyProfile(data.companyProfile);
      setMessage("Company profile saved.");
    } catch (error) {
      setMessage(error.message);
    } finally {
      setCompanySaving(false);
    }
  }

  if (booting) {
    return <main className="loading">Loading Invoicly...</main>;
  }

  if (!user) {
    return <AuthScreen onSignedIn={handleSignedIn} />;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <img
            className="topbar-logo"
            src="/assets/invoicly-logo.png"
            alt="Invoicly"
          />
          <span className="topbar-title">
            {companyProfile.companyName || "Company name"}
          </span>
        </div>
        <div className="topbar-actions">
          <button
            className={`secondary ${activeView === "invoices" ? "active-view" : ""}`}
            type="button"
            onClick={() => setActiveView("invoices")}
          >
            <FilePlus size={16} />
            Invoices
          </button>
          <button
            className={`secondary ${activeView === "company" ? "active-view" : ""}`}
            type="button"
            onClick={() => setActiveView("company")}
          >
            <Building2 size={16} />
            Company
          </button>
          <div className="account-menu" ref={accountMenuRef}>
            <button
              className="account-avatar"
              type="button"
              aria-label="Open account menu"
              aria-expanded={accountMenuOpen}
              aria-controls="account-dropdown"
              onClick={() => setAccountMenuOpen((open) => !open)}
            >
              {user.email?.trim().charAt(0).toUpperCase() || "?"}
            </button>
            {accountMenuOpen && (
              <div className="account-dropdown" id="account-dropdown">
                <strong>{companyProfile.companyName || "Company name"}</strong>
                <span>{user.email}</span>
                <button type="button" onClick={handleLogout}>
                  <LogOut size={16} />
                  Logout
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {message && <p className="toast">{message}</p>}

      {activeView === "invoices" ? (
        <div className="workspace">
          <InvoiceList
            invoices={invoices}
            selectedId={selectedId}
            onSelect={selectInvoice}
            onNew={handleNew}
            onRefresh={() => loadInvoices(selectedId).catch((error) => setMessage(error.message))}
          />
          <div className="invoice-detail-layout">
            <InvoiceEditor
              form={form}
              setForm={setForm}
              onSave={handleSave}
              onDelete={handleDelete}
              onSend={handleSendInvoice}
              onExportPdf={handleExportPdf}
              onStatusChange={handleStatusChange}
              onPaymentLink={handlePaymentLink}
              onEmailInvoice={handleEmailInvoice}
              onEdit={handleEditInvoice}
              onCancelEdit={handleCancelEdit}
              isEditing={isEditingInvoice}
              saving={saving}
            />
            <InvoiceActivity
              form={form}
              onRemovePaymentLink={handleRemovePaymentLink}
              onDeletePayment={handleDeletePayment}
            />
          </div>
        </div>
      ) : (
        <CompanySettings
          profile={companyProfile}
          setProfile={setCompanyProfile}
          onSave={handleCompanyProfileSave}
          onMessage={setMessage}
          saving={companySaving}
        />
      )}
    </main>
  );
}
