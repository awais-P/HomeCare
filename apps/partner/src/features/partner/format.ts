/** CNIC: 13 digits shown as 12345-1234567-1 (formats partial input while typing). */
export function formatCnic(input: string): string {
  const d = input.replace(/\D/g, '').slice(0, 13);
  if (d.length <= 5) return d;
  if (d.length <= 12) return `${d.slice(0, 5)}-${d.slice(5)}`;
  return `${d.slice(0, 5)}-${d.slice(5, 12)}-${d.slice(12)}`;
}

export function isValidCnic(value: string): boolean {
  return /^[0-9]{5}-[0-9]{7}-[0-9]$/.test(value);
}

/** JazzCash / Easypaisa wallet: an 11-digit mobile number starting 03. */
export function toWalletDigits(input: string): string {
  let d = input.replace(/\D/g, '');
  if (d.startsWith('92')) d = '0' + d.slice(2);
  return d.slice(0, 11);
}

export function isValidWallet(value: string): boolean {
  return /^03[0-9]{9}$/.test(value);
}
