import "@/App.css";
import { useEffect } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Login from "@/pages/Login";
import Signup from "@/pages/Signup";
import Subscribe from "@/pages/Subscribe";
import Manager from "@/pages/Manager";
import Customer from "@/pages/Customer";
import Kitchen from "@/pages/Kitchen";
import { initTheme } from "@/lib/theme";

function RequireAuth({ children }) {
  const token = localStorage.getItem("mgr_token");
  if (!token) return <Navigate to="/login" replace />;
  return children;
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
                <Subscribe />
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
          <Route path="/customer" element={<Customer />} />
          <Route path="/kitchen" element={<Kitchen />} />
        </Routes>
      </BrowserRouter>
      <Toaster theme={localStorage.getItem("tt_theme") === "light" ? "light" : "dark"} position="top-right" />
    </div>
  );
}

export default App;
