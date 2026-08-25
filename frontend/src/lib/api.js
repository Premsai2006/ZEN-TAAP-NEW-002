import axios from "axios";
import { toast } from "sonner";
import { friendlyError } from "@/lib/errors";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API, withCredentials: true });

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const path = window.location.pathname || "";
    const admin = localStorage.getItem("admin_token");
    const mgr = localStorage.getItem("mgr_token");
    const kitchen = localStorage.getItem("kitchen_token");
    const t = path.startsWith("/admin")
      ? admin
      : path.startsWith("/kitchen")
        ? (kitchen || mgr)
        : (mgr || kitchen);
    if (t) {
      config.headers = config.headers || {};
      config.headers.Authorization = `Bearer ${t}`;
    }
  }
  return config;
});

let _redirecting = false;
api.interceptors.response.use(
  (r) => r,
  (err) => {
    const status = err?.response?.status;
    if (status === 401 && typeof window !== "undefined") {
      const path = window.location.pathname;
      if (path.startsWith("/admin") && !path.startsWith("/admin/login")) {
        if (!_redirecting) {
          _redirecting = true;
          localStorage.removeItem("admin_token");
          localStorage.removeItem("admin_user");
          toast.error("Admin session expired — please log in again.");
          setTimeout(() => { _redirecting = false; window.location.assign("/admin/login"); }, 600);
        }
      } else if (path.startsWith("/manager") || path.startsWith("/settings")) {
        if (!_redirecting) {
          _redirecting = true;
          localStorage.removeItem("mgr_token");
          localStorage.removeItem("mgr_authed");
          localStorage.removeItem("mgr_role");
          toast.error("Session expired — please log in again.");
          setTimeout(() => { _redirecting = false; window.location.assign("/login"); }, 600);
        }
      } else if (path.startsWith("/kitchen")) {
        if (!_redirecting) {
          _redirecting = true;
          localStorage.removeItem("kitchen_token");
          toast.error("Kitchen session expired — please enter the PIN again.");
          setTimeout(() => { _redirecting = false; window.location.assign(path); }, 600);
        }
      }
    }
    if (status === 402) {
      toast.error(friendlyError(err, "Subscribe to ZenTaap to use this feature."), {
        duration: 5000,
        id: "sub-required",
      });
    }
    if (status === 429) {
      toast.error(friendlyError(err, "Too many attempts. Please wait and try again."), {
        duration: 6000,
      });
    }
    return Promise.reject(err);
  }
);
