const API_BASE = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

export function getStoredToken() {
  return localStorage.getItem("invoicly_token");
}

export function storeToken(token) {
  localStorage.setItem("invoicly_token", token);
}

export function clearStoredToken() {
  localStorage.removeItem("invoicly_token");
}

export async function api(path, options = {}) {
  const token = getStoredToken();
  const headers = {
    ...(options.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers
  };

  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers,
    body:
      options.body && typeof options.body !== "string"
        ? JSON.stringify(options.body)
        : options.body
  });

  if (response.status === 204) {
    return null;
  }

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }

  return data;
}

function filenameFromDisposition(disposition) {
  const match = /filename="?([^"]+)"?/i.exec(disposition || "");
  return match?.[1] || "";
}

export async function downloadApiFile(path, options = {}) {
  const token = getStoredToken();
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers
    }
  });

  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || "Download failed");
  }

  return {
    blob: await response.blob(),
    filename: filenameFromDisposition(response.headers.get("content-disposition"))
  };
}
