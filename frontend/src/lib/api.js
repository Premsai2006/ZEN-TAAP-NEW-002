import axios from "axios";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

export const api = axios.create({ baseURL: API });

// Global 402 (Payment Required) handler — fires whenever a "use" endpoint refuses
// because the restaurant doesn't have an active subscription. Manager browses freely
// but can't write data; we surface this with a friendly toast + redirect to /subscribe.
let _redirecting = false;
api.interceptors.response.use(
  (r) => r,
  (err) => {
    if (err?.response?.status === 402) {
      const msg = err.response?.data?.detail || "Subscribe to ZenTaap to use this feature.";
      toast.error(msg, { duration: 4500 });
      // Only auto-redirect from manager pages — customer/kitchen pages stay where they are.
      if (typeof window !== "undefined" && !_redirecting) {
        const path = window.location.pathname;
        if (path.startsWith("/manager")) {
          _redirecting = true;
          setTimeout(() => {
            _redirecting = false;
            window.location.assign("/subscribe");
          }, 800);
        }
      }
    }
    return Promise.reject(err);
  }
);
