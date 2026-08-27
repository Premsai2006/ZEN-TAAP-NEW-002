import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { friendlyError } from "@/lib/errors";
import { Phone, ShieldCheck, KeyRound, X, MessageSquare } from "lucide-react";

const STEPS = [
  { id: "phone", label: "Phone" },
  { id: "otp", label: "SMS code" },
  { id: "pin", label: "New PIN" },
];

export default function ForgotPinDialog({ open, onClose }) {
  const [step, setStep] = useState("phone");
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

  const close = () => {
    reset();
    onClose?.();
  };

  const sendOtp = async () => {
    if (contact.replace(/[^0-9]/g, "").length < 7) {
      return toast.error("Please enter the phone number on your account.");
    }
    setLoading(true);
    try {
      const { data } = await api.post("/auth/request-otp", { contact_number: contact });
      setMaskedPhone(data.message || "");
      setStep("otp");
      setOtp("");
      if (data.demo_otp) {
        toast.success(`Demo OTP: ${data.demo_otp}`, { duration: 10000 });
      } else {
        toast.success(data.message || "Code sent by SMS.");
      }
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't send the SMS code. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const confirmOtp = async () => {
    if (otp.length !== 6) return toast.error("Please enter the 6-digit SMS code.");
    setLoading(true);
    try {
      await api.post("/auth/verify-otp", { contact_number: contact, otp });
      setStep("pin");
      setNewPin("");
      setConfirmPin("");
      toast.success("Phone verified. Choose a new PIN.");
    } catch (err) {
      toast.error(friendlyError(err, "That code is incorrect. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  const savePin = async () => {
    if (newPin.length < 6) return toast.error("Your new PIN needs to be at least 6 digits.");
    if (newPin !== confirmPin) return toast.error("Your PINs don't match — please try again.");
    setLoading(true);
    try {
      await api.post("/auth/verify-otp", { contact_number: contact, otp, new_pin: newPin });
      toast.success("PIN updated — you can log in with your new PIN.");
      close();
    } catch (err) {
      toast.error(friendlyError(err, "Couldn't reset your PIN. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  if (!open) return null;

  const stepIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div
      className="forgot-overlay"
      data-testid="forgot-pin-dialog"
      role="dialog"
      aria-modal="true"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="forgot-card">
        <button type="button" className="pay-result-close" aria-label="Close" onClick={close} data-testid="forgot-cancel">
          <X size={18} />
        </button>

        <div className="forgot-steps" aria-hidden="true">
          {STEPS.map((s, i) => (
            <div key={s.id} className={`forgot-step ${i === stepIndex ? "active" : ""} ${i < stepIndex ? "done" : ""}`}>
              <span>{i + 1}</span>
              {s.label}
            </div>
          ))}
        </div>

        {step === "phone" && (
          <>
            <div className="forgot-icon"><Phone size={28} /></div>
            <div className="forgot-title">Recover your PIN</div>
            <div className="forgot-copy">
              Enter the restaurant phone number. We will send a 6-digit code by <b>SMS only</b> — no call, no email.
            </div>
            <div className="form-group" style={{ margin: "16px 0 8px", textAlign: "left" }}>
              <label className="form-label">Registered phone number</label>
              <input
                type="tel"
                inputMode="numeric"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="e.g. 9876543210"
                autoFocus
                data-testid="forgot-contact-input"
              />
            </div>
            <button
              type="button"
              className="submit-btn"
              style={{ width: "100%", marginTop: 12 }}
              onClick={sendOtp}
              disabled={loading}
              data-testid="forgot-send-otp"
            >
              {loading ? "Sending SMS…" : "Send SMS code"}
            </button>
          </>
        )}

        {step === "otp" && (
          <>
            <div className="forgot-icon"><MessageSquare size={28} /></div>
            <div className="forgot-title">Enter the SMS code</div>
            <div className="forgot-copy">
              {maskedPhone || "We sent a one-time code to your phone"}. Valid for 5 minutes.
            </div>
            <div className="form-group" style={{ margin: "16px 0 8px" }}>
              <label className="form-label">6-digit OTP</label>
              <input
                type="text"
                inputMode="numeric"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
                placeholder="••••••"
                maxLength={6}
                autoFocus
                autoComplete="one-time-code"
                style={{ letterSpacing: 10, textAlign: "center", fontSize: 22 }}
                data-testid="forgot-otp-input"
              />
            </div>
            <button
              type="button"
              className="submit-btn"
              style={{ width: "100%", marginTop: 12 }}
              onClick={confirmOtp}
              disabled={loading}
              data-testid="forgot-verify"
            >
              {loading ? "Checking…" : "Confirm OTP"}
            </button>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 14 }}>
              Didn&apos;t get the SMS?{" "}
              <button
                type="button"
                onClick={sendOtp}
                disabled={loading}
                className="link-btn"
                data-testid="forgot-resend-otp"
              >
                Resend code
              </button>
            </div>
          </>
        )}

        {step === "pin" && (
          <>
            <div className="forgot-icon"><KeyRound size={28} /></div>
            <div className="forgot-title">Choose a new PIN</div>
            <div className="forgot-copy">
              Phone verified. Set a new 6–10 digit PIN for this restaurant.
            </div>
            <div className="form-group" style={{ margin: "16px 0 8px", textAlign: "left" }}>
              <label className="form-label">
                <ShieldCheck size={11} style={{ display: "inline", marginRight: 4, verticalAlign: "middle" }} />
                New PIN
              </label>
              <input
                type="password"
                inputMode="numeric"
                value={newPin}
                onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                placeholder="6–10 digits"
                autoComplete="new-password"
                autoFocus
                data-testid="forgot-newpin-input"
              />
            </div>
            <div className="form-group" style={{ margin: "8px 0", textAlign: "left" }}>
              <label className="form-label">Confirm new PIN</label>
              <input
                type="password"
                inputMode="numeric"
                value={confirmPin}
                onChange={(e) => setConfirmPin(e.target.value.replace(/[^0-9]/g, "").slice(0, 10))}
                placeholder="Repeat new PIN"
                autoComplete="new-password"
                data-testid="forgot-confirmpin-input"
              />
            </div>
            <button
              type="button"
              className="submit-btn"
              style={{ width: "100%", marginTop: 12 }}
              onClick={savePin}
              disabled={loading}
              data-testid="forgot-save-pin"
            >
              {loading ? "Saving…" : "Save new PIN"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
