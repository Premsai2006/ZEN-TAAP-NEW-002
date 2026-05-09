import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

export default function ForgotPinDialog({ open, onClose }) {
  const [contact, setContact] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setContact("");
    setNewPin("");
    setConfirmPin("");
    setLoading(false);
  };

  const submit = async () => {
    if (contact.replace(/[^0-9]/g, "").length < 7) return toast.error("Enter your registered contact number");
    if (newPin.length < 4) return toast.error("New PIN must be 4–10 digits");
    if (newPin !== confirmPin) return toast.error("PINs do not match");
    setLoading(true);
    try {
      await api.post("/auth/recover-pin", { contact_number: contact, new_pin: newPin });
      toast.success("PIN reset. Please login with your new PIN.");
      reset();
      onClose();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Failed to reset PIN");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && (reset(), onClose())}>
      <AlertDialogContent
        data-testid="forgot-pin-dialog"
        style={{ background: "var(--card)", border: "1px solid var(--line)", color: "var(--text)" }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle className="font-serif" style={{ color: "var(--gold)" }}>
            Recover your PIN
          </AlertDialogTitle>
          <AlertDialogDescription style={{ color: "var(--muted)" }}>
            Enter your registered contact number and choose a new PIN.
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className="form-group" style={{ marginBottom: 10 }}>
          <label className="form-label">Registered Contact Number</label>
          <input
            type="tel"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="+91 …"
            data-testid="forgot-contact-input"
          />
        </div>
        <div className="form-row" style={{ marginBottom: 0 }}>
          <div className="form-group">
            <label className="form-label">New PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
              maxLength={10}
              data-testid="forgot-newpin-input"
              style={{ letterSpacing: 4, textAlign: "center" }}
            />
          </div>
          <div className="form-group">
            <label className="form-label">Confirm New PIN</label>
            <input
              type="password"
              inputMode="numeric"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
              maxLength={10}
              data-testid="forgot-confirmpin-input"
              style={{ letterSpacing: 4, textAlign: "center" }}
            />
          </div>
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel
            onClick={() => {
              reset();
              onClose();
            }}
            data-testid="forgot-cancel-btn"
            style={{ background: "transparent", border: "1px solid var(--line)", color: "var(--text)" }}
          >
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={submit}
            disabled={loading}
            data-testid="forgot-submit-btn"
            style={{ background: "var(--gold)", color: "white", border: "none" }}
          >
            {loading ? "Resetting…" : "Reset PIN"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
