import { lazy, Suspense, useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Manager from "@/pages/Manager";
import Customer from "@/pages/Customer";
import Kitchen from "@/pages/Kitchen";
import { initTheme } from "@/lib/theme";
import "@/App.css";

// Lazy-load admin so Menu & Orders don't pay the cost (issue #20)
const Admin = lazy(() => import("@/pages/Admin"));
const AdminLogin = lazy(() => import("@/pages/AdminLogin"));

function storedDashboardPath() {
  try {
    if (localStorage.getItem("mgr_token")) return "/manager";
    if (localStorage.getItem("kitchen_token")) {
      const slug = (localStorage.getItem("kitchen_slug") || "").trim().toLowerCase();
      return slug ? `/kitchen/${slug}` : "/kitchen";
    }
    if (localStorage.getItem("admin_token")) return "/admin";
  } catch {
    /* private mode */
  }
  return null;
}

function RequireAuth({ children }) {
  const token = localStorage.getItem("mgr_token");
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function RequireAdmin({ children }) {
  const token = localStorage.getItem("admin_token");
  if (!token) return <Navigate to="/admin/login" replace />;
  return children;
}

function RedirectIfSignedIn({ children }) {
  const to = storedDashboardPath();
  if (to) return <Navigate to={to} replace />;
  return children;
}

function RedirectIfAdminSignedIn({ children }) {
  try {
    if (localStorage.getItem("admin_token")) return <Navigate to="/admin" replace />;
  } catch {
    /* private mode */
  }
  return children;
}

function HomeRedirect() {
  return <Navigate to={storedDashboardPath() || "/login"} replace />;
}

function LazyFallback() {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "60vh", color: "var(--muted)" }}>
      Loading…
    </div>
  );
}

function App() {
  useEffect(() => {
    initTheme();
  }, []);

  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomeRedirect />} />
          <Route path="/login" element={<RedirectIfSignedIn><Login /></RedirectIfSignedIn>} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/subscribe"
            element={
              <RequireAuth>
                <Navigate to="/manager/subscribe" replace />
              </RequireAuth>
            }
          />
          <Route
            path="/manager"
            element={
              <RequireAuth>
                <Navigate to="/manager/orders" replace />
              </RequireAuth>
            }
          />
          <Route
            path="/manager/:tab"
            element={
              <RequireAuth>
                <Manager />
              </RequireAuth>
            }
          />
          <Route path="/customer" element={<Navigate to="/login" replace />} />
          <Route path="/r/:slug" element={<Customer />} />
          <Route path="/kitchen" element={<Kitchen />} />
          <Route path="/kitchen/:slug" element={<Kitchen />} />
          <Route
            path="/admin/login"
            element={
              <RedirectIfAdminSignedIn>
                <Suspense fallback={<LazyFallback />}>
                  <AdminLogin />
                </Suspense>
              </RedirectIfAdminSignedIn>
            }
          />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <Suspense fallback={<LazyFallback />}>
                  <Admin />
                </Suspense>
              </RequireAdmin>
            }
          />
        </Routes>
      </BrowserRouter>
      <Toaster theme={localStorage.getItem("tt_theme") === "light" ? "light" : "dark"} position="top-right" />
    </div>
  );
}

export default App;
