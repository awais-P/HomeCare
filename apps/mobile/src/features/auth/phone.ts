/**
 * Pakistani mobile numbers.
 * National significant number (NSN) = 10 digits starting with 3, e.g. 3001234567.
 * E.164 = +92 followed by the NSN, e.g. +923001234567 (the format Supabase Auth expects).
 */

export const PK_COUNTRY_CODE = '+92';
export const PK_NSN_LENGTH = 10;

const NSN_PATTERN = /^3\d{9}$/;

/**
 * Turns whatever the user typed or pasted ("0300-1234567", "+92 300 1234567", "3001234567")
 * into national digits without the leading 0 or country code. May be incomplete.
 */
export function toNationalDigits(input: string): string {
  let digits = input.replace(/\D/g, '');
  if (digits.startsWith('0092')) digits = digits.slice(4);
  else if (digits.startsWith('92') && digits.length > PK_NSN_LENGTH) digits = digits.slice(2);
  if (digits.startsWith('0')) digits = digits.slice(1);
  return digits.slice(0, PK_NSN_LENGTH);
}

export function isValidNationalNumber(nsn: string): boolean {
  return NSN_PATTERN.test(nsn);
}

/** Returns +923001234567, or null if the input is not a valid Pakistani mobile number. */
export function normalizePakistaniMobile(input: string): string | null {
  const nsn = toNationalDigits(input);
  return isValidNationalNumber(nsn) ? `${PK_COUNTRY_CODE}${nsn}` : null;
}

/** "3001234567" → "300 1234567" (works on partial input while typing). */
export function formatNationalDigits(nsn: string): string {
  return nsn.length <= 3 ? nsn : `${nsn.slice(0, 3)} ${nsn.slice(3)}`;
}

/** "+923001234567" → "+92 300 1234567" */
export function formatE164ForDisplay(e164: string): string {
  const nsn = toNationalDigits(e164);
  return `${PK_COUNTRY_CODE} ${formatNationalDigits(nsn)}`;
}
