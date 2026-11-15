import { useState } from 'react';

import { formatE164ForDisplay, normalizePakistaniMobile } from '@homecare/shared/phone';

import { supabase } from './supabase';

/** Phone + SMS code sign-in (same accounts as the apps). Only admins get past the next check. */
export function Login() {
  const [phoneInput, setPhoneInput] = useState('');
  const [phone, setPhone] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const sendCode = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalized = normalizePakistaniMobile(phoneInput);
    if (!normalized) {
      setError('Enter a valid Pakistani mobile number, e.g. 0300 1234567.');
      return;
    }
    setBusy(true);
    setError(null);
    const { error: otpError } = await supabase.auth.signInWithOtp({ phone: normalized });
    setBusy(false);
    if (otpError) setError(otpError.message);
    else setPhone(normalized);
  };

  const verify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!phone) return;
    setBusy(true);
    setError(null);
    const { error: verifyError } = await supabase.auth.verifyOtp({ phone, token: code.trim(), type: 'sms' });
    setBusy(false);
    if (verifyError) setError('That code is wrong or has expired.');
  };

  return (
    <div className="login">
      <div className="card login-card">
        <div className="brand">
          <span className="brand-mark">⌂</span> HomeCare Admin
        </div>
        {phone ? (
          <form onSubmit={verify} className="stack">
            <p className="muted">Enter the 6-digit code sent to {formatE164ForDisplay(phone)}.</p>
            <input
              className="input code-input"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
              placeholder="123456"
              autoFocus
            />
            {error ? <p className="error">{error}</p> : null}
            <button className="btn primary" disabled={busy || code.length !== 6}>
              {busy ? 'Checking…' : 'Sign in'}
            </button>
            <button type="button" className="btn ghost" onClick={() => setPhone(null)}>
              Use a different number
            </button>
          </form>
        ) : (
          <form onSubmit={sendCode} className="stack">
            <label className="label" htmlFor="phone">
              Mobile number
            </label>
            <input
              id="phone"
              className="input"
              inputMode="tel"
              value={phoneInput}
              onChange={(e) => setPhoneInput(e.target.value)}
              placeholder="0300 1234567"
              autoFocus
            />
            {error ? <p className="error">{error}</p> : null}
            <button className="btn primary" disabled={busy}>
              {busy ? 'Sending…' : 'Send code'}
            </button>
            <p className="muted small">Only accounts listed in the admins table can open the panel.</p>
          </form>
        )}
      </div>
    </div>
  );
}
