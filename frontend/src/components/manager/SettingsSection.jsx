import AppearanceCard from "./settings/AppearanceCard";
import BillBrandingForm from "./settings/BillBrandingForm";
import ChangePinForm from "./settings/ChangePinForm";
import KitchenPinForm from "./settings/KitchenPinForm";
import DevicesCard from "./settings/DevicesCard";
import StaffCard from "./settings/StaffCard";
import ForgotPinDialog from "@/components/auth/ForgotPinDialog";
import { useState } from "react";

export default function SettingsSection({ settings, onRefresh, role = "owner" }) {
  const [showForgot, setShowForgot] = useState(false);
  const isOwner = role === "owner";
  const canManageStaff = role === "owner" || role === "manager";

  return (
    <div className="section active" data-testid="settings-section">
      <AppearanceCard />
      {canManageStaff && <StaffCard />}
      <BillBrandingForm settings={settings} onRefresh={onRefresh} />
      {isOwner && <ChangePinForm />}
      {canManageStaff && <KitchenPinForm />}
      <DevicesCard />
      {isOwner && (
        <div className="add-item-card" data-testid="forgot-pin-settings">
          <div className="font-serif" style={{ fontSize: 18, marginBottom: 6 }}>Forgot PIN</div>
          <div style={{ color: "var(--muted)", fontSize: 13, marginBottom: 14 }}>
            Reset the owner PIN with a one-time code sent to your registered phone number.
          </div>
          <button
            type="button"
            className="submit-btn ghost"
            onClick={() => setShowForgot(true)}
            data-testid="open-forgot-pin-settings"
          >
            Reset PIN via OTP
          </button>
        </div>
      )}
      <ForgotPinDialog open={showForgot} onClose={() => setShowForgot(false)} />
    </div>
  );
}
