/**
 * Transform input value based on force capital letters setting.
 * @param value - The input value to transform
 * @param forceCaps - Whether to force capitalize the value
 * @returns Transformed value (uppercase if forceCaps is true, original otherwise)
 */
export function transformInput(value: string | undefined, forceCaps: boolean): string {
  if (!value) return value ?? "";
  return forceCaps ? value.toUpperCase() : value;
}

/**
 * Get force capital letters setting from localStorage.
 * @returns Boolean indicating if force capital letters is enabled
 */
export function getForceCapsSetting(): boolean {
  if (typeof window === "undefined") return false;
  const stored = localStorage.getItem("force_caps");
  return stored === "true";
}

/**
 * Set force capital letters setting in localStorage.
 * @param enabled - Whether to enable force capital letters
 */
export function setForceCapsSetting(enabled: boolean): void {
  if (typeof window === "undefined") return;
  localStorage.setItem("force_caps", enabled ? "true" : "false");
}

/**
 * Fields that should be capitalized when force caps is enabled.
 */
export const CAPITALIZE_FIELDS = [
  "name", // Client Name
  "mvNo", // Vehicle Number
  "address", // Address
  "groupName", // Group Name
  "company", // Company Name
  "application", // RTO Application
  "work", // Work Type
  "co", // C/O (Care Of)
  "mo", // Mobile Operator
];
