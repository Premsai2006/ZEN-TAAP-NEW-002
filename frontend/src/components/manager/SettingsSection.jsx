import AppearanceCard from "./settings/AppearanceCard";
import BillBrandingForm from "./settings/BillBrandingForm";
import ChangePinForm from "./settings/ChangePinForm";
import KitchenPinForm from "./settings/KitchenPinForm";
import DevicesCard from "./settings/DevicesCard";
import RecoverPinForm from "./settings/RecoverPinForm";

export default function SettingsSection({ settings, onRefresh }) {
  return (
    <div className="section active" data-testid="settings-section">
      <AppearanceCard />
      <BillBrandingForm settings={settings} onRefresh={onRefresh} />
      <ChangePinForm />
      <KitchenPinForm />
      <DevicesCard />
      <RecoverPinForm />
    </div>
  );
}
