// api.js - 共用 API wrapper
const API_BASE = "https://marcoleung052-nursing-copilot-api.hf.space/api"; // 空字串代表同源；若後端在不同域名，填完整 URL

async function apiFetch(path, opts = {}) {
  const url = `${API_BASE}${path}`;
  const defaultHeaders = { "Content-Type": "application/json" };
  if (!opts.headers) opts.headers = defaultHeaders;
  else opts.headers = { ...defaultHeaders, ...opts.headers };

  const res = await fetch(url, opts);
  if (!res.ok) {
    let errText = res.statusText;
    try {
      const body = await res.json();
      errText = body.detail || body.message || JSON.stringify(body);
    } catch (e) {
      // ignore JSON parse error
    }
    const err = new Error(errText);
    err.status = res.status;
    throw err;
  }
  // 如果沒有內容 (204) 則回傳 null
  if (res.status === 204) return null;
  return res.json();
}

export { apiFetch };
