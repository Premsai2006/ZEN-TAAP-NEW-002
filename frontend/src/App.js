import "@/App.css";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { Toaster } from "@/components/ui/sonner";
import Login from "@/pages/Login";
import Manager from "@/pages/Manager";
import Customer from "@/pages/Customer";

function RequireAuth({ children }) {
  const token = localStorage.getItem("mgr_token");
  if (!token) return <Navigate to="/login" replace />;
  return children;
}

function App() {
  return (
    <div className="App">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Navigate to="/login" replace />} />
          <Route path="/login" element={<Login />} />
          <Route
            path="/manager"
            element={
              <RequireAuth>
                <Manager />
              </RequireAuth>
            }
          />
          <Route path="/customer" element={<Customer />} />
        </Routes>
      </BrowserRouter>
      <Toaster theme="dark" position="top-right" />
    </div>
  );
}

export default App;
