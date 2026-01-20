// api.js - 共用 API wrapper

// 後端資料庫 API
const API_BASE = "https://marcoleung052-nursing-copilot-api.hf.space";

// AI 模型 API
const AI_BASE  = "https://marcoleung052-nursing-copilot-api.hf.space/api";

// ------------------ 通用 fetch ------------------
async function apiFetch(path, opts = {}) {
  const url = `${API_BASE}${path}`;
  return fetchWrapper(url, opts);
}

async function apiFetchAI(path, opts = {}) {
  const url = `${AI_BASE}${path}`;
  return fetchWrapper(url, opts);
}

// ------------------ 內部共用函式 ------------------
async function fetchWrapper(url, opts = {}) {
  const defaultHeaders = { "Content-Type": "application/json" };
  opts.headers = { ...defaultHeaders, ...(opts.headers || {}) };

  const res = await fetch(url, opts);

  if (!res.ok) {
    let errText = res.statusText;
    try {
      const body = await res.json();
      errText = body.detail || body.message || JSON.stringify(body);
    } catch (_) {}
    const err = new Error(errText);
    err.status = res.status;
    throw err;
  }

  if (res.status === 204) return null;
  return res.json();
}

export { apiFetch, apiFetchAI };
