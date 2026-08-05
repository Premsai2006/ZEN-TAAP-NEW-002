/**
 * Turn API / network failures into short, human-facing messages.
 * Never surfaces raw FastAPI/validation dumps or exception text.
 */
export function extractDetail(err) {
  const raw = err?.response?.data?.detail;
  if (typeof raw === "string") return raw;
  if (Array.isArray(raw)) {
    const parts = raw
      .map((item) => (typeof item === "string" ? item : item?.msg))
      .filter(Boolean);
    return parts.join(". ") || "";
  }
  if (raw && typeof raw === "object" && typeof raw.message === "string") {
    return raw.message;
  }
  return "";
}

const RULES = [
  [/already (has a restaurant|registered|set up)/i, "A restaurant is already set up here. Please log in instead."],
  [/phone number already exists|already used by another/i, "An account with this phone number already exists. Please log in instead."],
  [/url name is already taken|url name is reserved/i, "That restaurant URL is taken. Please choose another."],
  [/manager name/i, "Please enter the manager's name."],
  [/restaurant name/i, "Please enter your restaurant name."],
  [/contact number required/i, "Please enter your phone number."],
  [/valid contact|phone number does not match|phone number mismatch|no manager phone/i, "Please enter the phone number on your account."],
  [/no manager registered/i, "No account found yet. Please sign up first."],
  [/pin must be numeric|digits only/i, "Your PIN can only contain numbers."],
  [/pin must be \d/i, "Please choose a PIN with the required number of digits."],
  // Keep lockout / remaining-attempt wording (already clear for users)
  [/too many|locked for|attempt\(s\) remaining/i, null],
  [/incorrect kitchen pin/i, "That kitchen PIN is incorrect. Please try again."],
  [/kitchen pin not set/i, "Kitchen PIN isn't set up yet. Ask your manager to add one."],
  [/current pin is incorrect|incorrect pin/i, "That PIN is incorrect. Please try again."],
  [/incorrect otp/i, "That code is incorrect. Please try again."],
  [/otp expired|no otp requested/i, "That code has expired. Please request a new one."],
  [/session expired|missing manager token|please log in to continue/i, "Your session expired. Please log in again."],
  [/session not found|already signed out/i, "That device session was already removed."],
  [/subscribe to zentaap/i, "Subscribe to ZenTaap to use this feature."],
  [/invalid payment method/i, "Please choose a valid payment option."],
  [/signature verification|webhook signature/i, "Payment could not be verified. Please try again or contact support."],
  [/invalid table/i, "Please choose a valid table number."],
  [/category already exists|another category/i, "A category with that name already exists."],
  [/name required/i, "Please enter a name."],
  [/no fields to update/i, "Nothing to save — make a change first."],
  [/image too large/i, "That image is too large. Please use one under 1.8 MB."],
  [/invalid image/i, "That file isn't a valid image. Please try another."],
  [/tables must be between/i, "Please choose a table count within the allowed range."],
  [/not found/i, "We couldn't find that item. It may have been removed."],
  [/razorpay|sdk failed/i, "Payment couldn't start. Please refresh and try again."],
];

function mapDetail(detail) {
  if (!detail) return null;
  for (const [re, msg] of RULES) {
    if (re.test(detail)) {
      if (msg === null) return detail.replace(/\bPIN attempts\b/gi, "attempts");
      return msg;
    }
  }
  if (/traceback|exception|stack|status[_ ]?code|httpexception|axios|undefined|null is not/i.test(detail)) {
    return null;
  }
  if (detail.length <= 140 && /[a-zA-Z]/.test(detail) && !/[<>{}]/.test(detail)) {
    return detail.endsWith(".") ? detail : `${detail}.`;
  }
  return null;
}

/**
 * @param {unknown} err - axios error or string
 * @param {string} [fallback="Something went wrong. Please try again."]
 */
export function friendlyError(err, fallback = "Something went wrong. Please try again.") {
  if (typeof err === "string") {
    return mapDetail(err) || err || fallback;
  }
  if (!err?.response) {
    return "Can't reach the server. Check your connection and try again.";
  }
  const status = err.response.status;
  if (status === 429) {
    const mapped = mapDetail(extractDetail(err));
    return mapped || "Too many attempts. Please wait a moment and try again.";
  }
  const mapped = mapDetail(extractDetail(err));
  if (mapped) return mapped;
  if (status === 401) return "Please log in and try again.";
  if (status === 403) return "You don't have permission to do that.";
  if (status === 404) return "We couldn't find what you're looking for.";
  if (status >= 500) return "Something went wrong on our side. Please try again shortly.";
  return fallback;
}
