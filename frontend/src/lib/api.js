import axios from "axios";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

// withCredentials lets the browser send the httpOnly `mgr_token` cookie set by
// /api/auth/login. The backend `_require_manager` dependency reads the cookie
// first and falls back to the `Authorization: Bearer` header.
export const api = axios.create({ baseURL: API, withCredentials: true });

// Belt-and-suspenders fallback: if a legacy `mgr_token` exists in localStorage
// (older browsers from before the cookie migration) we keep attaching it as a
// Bearer header so the user isn't kicked out. New logins won't write to
// localStorage anymore — the cookie is authoritative.
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const mgr = localStorage.getItem("mgr_token");
    const kitchen = localStorage.getItem("kitchen_token");
    const t = mgr || kitchen;
    if (t) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${t}`;
    }
  }
  return config;
});

// Global 401 / 402 handlers.
// - 401 → manager session invalid: clear local hints + bounce to /login.
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
          localStorage.removeItem("mgr_authed");
          toast.error("Session expired — please log in again.");
          setTimeout(() => { _redirecting = false; window.location.assign("/login"); }, 600);
        }
      }
    }
    if (status === 402) {
      toast.error(friendlyError(err, "Subscribe to ZenTaap to use this feature."), {
        duration: 5000,
        id: "sub-required",
      });
      // Soft redirect — give the user time to read the toast (issue #3)
      if (typeof window !== "undefined" && !_redirecting) {
        const path = window.location.pathname;
        if (path.startsWith("/manager")) {
          _redirecting = true;
          setTimeout(() => { _redirecting = false; window.location.assign("/subscribe"); }, 2200);
        }
      }
    }
    if (status === 429) {
      toast.error(friendlyError(err, "Too many attempts. Please wait and try again."), {
        duration: 6000,
      });
    }
    return Promise.reject(err);
  }
);
