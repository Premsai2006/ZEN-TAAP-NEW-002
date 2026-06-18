import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { Phone, ShieldCheck, KeyRound } from "lucide-react";
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
  const [step, setStep] = useState("phone"); // "phone" → "otp"
  const [contact, setContact] = useState("");
  const [otp, setOtp] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [maskedPhone, setMaskedPhone] = useState("");

  const reset = () => {
    setStep("phone");
    setContact("");
    setOtp("");
    setNewPin("");
    setConfirmPin("");
    setMaskedPhone("");
    setLoading(false);
  };

  const sendOtp = async () => {
    if (contact.replace(/[^0-9]/g, "").length < 7) {
      return toast.error("Enter your registered phone number");
    }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/request-otp", { contact_number: contact });
      setMaskedPhone(data.message || "");
      setStep("otp");
      // Demo mode — show OTP in toast so user can complete the flow without SMS gateway
      if (data.demo_otp) {
        toast.success(`Demo OTP: ${data.demo_otp}`, { duration: 10000 });
      } else {
        toast.success(data.message || "OTP sent");
      }
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not send OTP");
    } finally {
      setLoading(false);
    }
  };

  const verifyAndReset = async () => {
    if (otp.length !== 6) return toast.error("Enter the 6-digit OTP");
    if (newPin.length < 4) return toast.error("New PIN must be 4–10 digits");
    if (newPin !== confirmPin) return toast.error("PINs do not match");
    setLoading(true);
    try {
      await api.post("/auth/verify-otp", { contact_number: contact, otp, new_pin: newPin });
      toast.success("PIN reset successfully — please log in with your new PIN");
      reset();
      onClose?.();
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Could not reset PIN");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(o) => {
        if (!o) {
          reset();
          onClose?.();
        }
      }}
    >
      <AlertDialogContent data-testid="forgot-pin-dialog">
        <AlertDialogHeader>
          <AlertDialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {step === "phone" ? (
              <>
                <Phone size={18} /> Recover your PIN
              </>
            ) : (
              <>
                <ShieldCheck size={18} /> Enter the OTP
              </>
            )}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {step === "phone"
              ? "Enter the phone number you registered with. We'll send a 6-digit OTP to verify it's you."
              : `We sent a one-time code to ${maskedPhone || "your phone"}. The code is valid for 5 minutes.`}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {step === "phone" && (
          <div className="form-group" style={{ margin: "8px 0" }}>
            <label className="form-label">
              <Phone size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
              Registered Phone Number
            </label>
            <input
              type="tel"
              inputMode="numeric"
              value={contact}
              onChange={(e) => setContact(e.target.value)}
              placeholder="e.g. 9876543210"
              data-testid="forgot-contact-input"
            />
          </div>
        )}

        {step === "otp" && (
          <>
            <div className="form-group" style={{ margin: "8px 0" }}>
              <label className="form-label">6-Digit OTP</label>
              <input
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                placeholder="••••••"
                maxLength={6}
                style={{ letterSpacing: 10, textAlign: "center", fontSize: 18 }}
                data-testid="forgot-otp-input"
                autoFocus
              />
            </div>
            <div className="form-group" style={{ margin: "8px 0" }}>
              <label className="form-label">
                <KeyRound size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                New PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="4–10 digits"
                data-testid="forgot-newpin-input"
              />
            </div>
            <div className="form-group" style={{ margin: "8px 0" }}>
              <label className="form-label">Confirm New PIN</label>
              <input
                type="password"
                inputMode="numeric"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="Repeat new PIN"
                data-testid="forgot-confirmpin-input"
              />
            </div>
            <div style={{ fontSize: 12, color: "var(--muted)" }}>
              Didn&apos;t get it?{" "}
              <button
                type="button"
                onClick={sendOtp}
                disabled={loading}
                style={{ background: "transparent", border: "none", color: "var(--gold)", cursor: "pointer", textDecoration: "underline" }}
                data-testid="forgot-resend-otp"
              >
                Resend OTP
              </button>
            </div>
          </>
        )}

        <AlertDialogFooter>
          <AlertDialogCancel data-testid="forgot-cancel">Cancel</AlertDialogCancel>
          {step === "phone" ? (
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                sendOtp();
              }}
              disabled={loading}
              data-testid="forgot-send-otp"
            >
              {loading ? "Sending…" : "Send OTP"}
            </AlertDialogAction>
          ) : (
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                verifyAndReset();
              }}
              disabled={loading}
              data-testid="forgot-verify"
            >
              {loading ? "Resetting…" : "Verify & Reset"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
