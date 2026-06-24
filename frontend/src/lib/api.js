import axios from "axios";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

// Attach the manager Bearer token (when present) to every request so protected
// manager-only endpoints work transparently. Customer / Kitchen pages have no
// token so they hit only the open endpoints.
api.interceptors.request.use((config) => {
  const t = typeof window !== "undefined" ? localStorage.getItem("mgr_token") : null;
  if (t) {
    config.headers = config.headers || {};
    config.headers.Authorization = `Bearer ${t}`;
  }
  return config;
});

// Global 401 / 402 handlers.
// - 401 → manager token invalid: clear it + bounce to /login.
// - 402 → no active subscription: toast + bounce manager-pages to /subscribe.
let _redirecting = false;
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err?.response?.status;
    if (status === 401 && typeof window !== "undefined") {
      const path = window.location.pathname;
      if (path.startsWith("/manager") || path.startsWith("/settings")) {
        if (!_redirecting) {
          _redirecting = true;
          localStorage.removeItem("mgr_token");
          toast.error("Session expired — please log in again.");
          setTimeout(() => { _redirecting = false; window.location.assign("/login"); }, 600);
        }
      }
    }
    if (status === 402) {
      const msg = err.response?.data?.detail || "Subscribe to ZenTaap to use this feature.";
      toast.error(msg, { duration: 4500 });
      if (typeof window !== "undefined" && !_redirecting) {
        const path = window.location.pathname;
        if (path.startsWith("/manager")) {
          _redirecting = true;
          setTimeout(() => { _redirecting = false; window.location.assign("/subscribe"); }, 800);
        }
      }
    }
    return Promise.reject(err);
  }
);
