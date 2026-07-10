/** Parse JSON API responses; surface plain-text errors (e.g. 413 Request Entity Too Large). */
export async function readApiJson<T = Record<string, unknown>>(
  res: Response
): Promise<{ ok: boolean; status: number; data: T | null; error: string | null }> {
  const text = await res.text()
  if (!text) {
    return {
      ok: res.ok,
      status: res.status,
      data: null,
      error: res.ok ? null : `Request failed (${res.status})`,
    }
  }

  try {
    const data = JSON.parse(text) as T
    if (res.ok) {
      return { ok: true, status: res.status, data, error: null }
    }
    const errField = (data as { error?: unknown })?.error
    const message =
      typeof errField === "string"
        ? errField
        : Array.isArray(errField)
          ? errField.map((e) => String(e)).join("; ")
          : `Request failed (${res.status})`
    return { ok: false, status: res.status, data, error: message }
  } catch {
    const plain = text.trim()
    if (res.status === 413 || /request entity too large/i.test(plain)) {
      return {
        ok: false,
        status: res.status,
        data: null,
        error:
          "File is too large to upload through the server. Try a smaller PDF (under 4 MB) or contact support.",
      }
    }
    return {
      ok: false,
      status: res.status,
      data: null,
      error: plain.slice(0, 300) || `Request failed (${res.status})`,
    }
  }
}
