/**
 * Booking slots: hourly from 9 am to 8 pm, at least 1 hour ahead, for the next 7 days.
 * Uses the phone's clock and time zone (Pakistan for our users); the database checks the same
 * rules in Asia/Karachi time.
 */
export type SlotDay = { key: string; date: Date; hours: number[] };

const FIRST_HOUR = 9;
const LAST_HOUR = 20;
const LEAD_MS = 65 * 60 * 1000; // a little over the 1-hour minimum

export function slotDays(now: Date = new Date(), days = 7): SlotDay[] {
  const out: SlotDay[] = [];
  for (let i = 0; i < days; i++) {
    const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() + i);
    const hours: number[] = [];
    for (let h = FIRST_HOUR; h <= LAST_HOUR; h++) {
      const at = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h);
      if (at.getTime() - now.getTime() >= LEAD_MS) hours.push(h);
    }
    if (hours.length) out.push({ key: date.toDateString(), date, hours });
  }
  return out;
}

export const slotTime = (day: Date, hour: number) => new Date(day.getFullYear(), day.getMonth(), day.getDate(), hour);

/** 9 → "9 am", 14 → "2 pm". */
export const hourLabel = (hour: number) => `${hour % 12 === 0 ? 12 : hour % 12} ${hour < 12 ? 'am' : 'pm'}`;
