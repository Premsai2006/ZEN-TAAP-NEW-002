/**
 * Inline brand-mark SVGs for Indian payment methods.
 * Kept small and self-contained so they ship offline (no CDN).
 * Each component returns a fixed-size <svg> at 30x18 (UPI category logo)
 * or 30x30 (circular brand chips for sub-brands).
 */

// --- Category-level logos (one per payment method) ---
export const UPILogo = ({ size = 36 }) => (
  // UPI logo: green/orange/grey horizontal triangle mark + "UPI" wordmark
  <svg
    width={size * 1.6}
    height={size}
    viewBox="0 0 130 80"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="UPI"
    data-testid="pay-logo-upi"
  >
    <rect width="130" height="80" rx="10" fill="#ffffff" />
    {/* Triangle mark */}
    <polygon points="14,18 14,62 50,40" fill="#097c4f" />
    <polygon points="34,18 34,62 70,40" fill="#ed752e" />
    <polygon points="54,18 54,62 90,40" fill="#7d7d7d" />
    {/* Wordmark */}
    <text x="98" y="50" fontFamily="Arial, sans-serif" fontSize="22" fontWeight="800" fill="#222">U</text>
    <text x="111" y="50" fontFamily="Arial, sans-serif" fontSize="22" fontWeight="800" fill="#ed752e">P</text>
    <text x="123" y="50" fontFamily="Arial, sans-serif" fontSize="22" fontWeight="800" fill="#097c4f">I</text>
  </svg>
);

export const CardLogo = ({ size = 36 }) => (
  // VISA + MasterCard composite chip
  <svg
    width={size * 1.6}
    height={size}
    viewBox="0 0 130 80"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="VISA · MasterCard"
    data-testid="pay-logo-card"
  >
    <rect width="130" height="80" rx="10" fill="#1a1f71" />
    <text
      x="65"
      y="38"
      textAnchor="middle"
      fontFamily="Arial, sans-serif"
      fontStyle="italic"
      fontSize="22"
      fontWeight="900"
      fill="#ffffff"
      letterSpacing="2"
    >
      VISA
    </text>
    {/* MasterCard interlocking circles */}
    <circle cx="55" cy="60" r="10" fill="#eb001b" />
    <circle cx="73" cy="60" r="10" fill="#f79e1b" />
    <path d="M64 52.5 a10 10 0 0 1 0 15 a10 10 0 0 1 0 -15" fill="#ff5f00" />
  </svg>
);

export const BankLogo = ({ size = 36 }) => (
  // Stylized bank/columns icon
  <svg
    width={size * 1.6}
    height={size}
    viewBox="0 0 130 80"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Net Banking"
    data-testid="pay-logo-bank"
  >
    <rect width="130" height="80" rx="10" fill="#0f4c81" />
    {/* Pediment */}
    <polygon points="40,18 90,18 65,8" fill="#ffffff" />
    <rect x="38" y="20" width="54" height="3" fill="#ffffff" />
    {/* Columns */}
    <rect x="40" y="26" width="6" height="34" fill="#ffffff" />
    <rect x="52" y="26" width="6" height="34" fill="#ffffff" />
    <rect x="64" y="26" width="6" height="34" fill="#ffffff" />
    <rect x="76" y="26" width="6" height="34" fill="#ffffff" />
    <rect x="84" y="26" width="6" height="34" fill="#ffffff" />
    {/* Base */}
    <rect x="34" y="63" width="62" height="5" fill="#ffffff" />
    <text
      x="65"
      y="78"
      textAnchor="middle"
      fontFamily="Arial, sans-serif"
      fontSize="9"
      fontWeight="700"
      fill="#ffffff"
      letterSpacing="1.5"
    >
      NET BANKING
    </text>
  </svg>
);

export const WalletLogo = ({ size = 36 }) => (
  // Wallet icon with currency symbol
  <svg
    width={size * 1.6}
    height={size}
    viewBox="0 0 130 80"
    xmlns="http://www.w3.org/2000/svg"
    role="img"
    aria-label="Wallets"
    data-testid="pay-logo-wallet"
  >
    <rect width="130" height="80" rx="10" fill="#a96cf5" />
    {/* Wallet body */}
    <rect x="35" y="20" width="60" height="42" rx="6" fill="#ffffff" />
    <rect x="35" y="20" width="60" height="10" rx="6" fill="#7a4dd1" />
    {/* Coin slot */}
    <circle cx="86" cy="44" r="6" fill="#a96cf5" />
    <circle cx="86" cy="44" r="2.5" fill="#ffffff" />
    {/* Rupee symbol on body */}
    <text
      x="55"
      y="55"
      fontFamily="Arial, sans-serif"
      fontSize="22"
      fontWeight="900"
      fill="#a96cf5"
    >
      ₹
    </text>
  </svg>
);
