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

// Lazy-load payment/subscription bundle so Menu & Orders don't pay the cost (issue #20)
const Subscribe = lazy(() => import("@/pages/Subscribe"));

function RequireAuth({ children }) {
  const token = localStorage.getItem("mgr_token");
  if (!token) return <Navigate to="/login" replace />;
  return children;
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
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route path="/signup" element={<Signup />} />
          <Route
            path="/subscribe"
            element={
              <RequireAuth>
                <Suspense fallback={<LazyFallback />}>
                  <Subscribe />
                </Suspense>
              </RequireAuth>
            }
          />
          <Route
            path="/manager"
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
        </Routes>
      </BrowserRouter>
      <Toaster theme={localStorage.getItem("tt_theme") === "light" ? "light" : "dark"} position="top-right" />
    </div>
  );
}

export default App;
