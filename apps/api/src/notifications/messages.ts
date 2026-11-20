/**
 * Notification texts, in the person's app language (profiles.language). The database queues
 * a `kind` plus a few values (notification_outbox.params); the words live here.
 */
export type Language = 'en' | 'ur';
export type Message = { title: string; body: string };
type Params = Record<string, unknown>;

const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? String(v) : '');

const STATUS_EN: Record<string, string> = {
  accepted: 'A rider accepted your order and is going to the shop.',
  at_shop: 'Your rider is at the shop now.',
  on_the_way: 'Your order is on the way to you.',
  delivered: 'Delivered! Tap to rate your rider.',
  cancelled: 'Your order was cancelled. Tap for details.',
};

const STATUS_UR: Record<string, string> = {
  accepted: 'رائیڈر نے آپ کا آرڈر قبول کر لیا ہے اور دکان کی طرف جا رہا ہے۔',
  at_shop: 'آپ کا رائیڈر دکان پر پہنچ گیا ہے۔',
  on_the_way: 'آپ کا آرڈر آپ کی طرف آ رہا ہے۔',
  delivered: 'پہنچا دیا گیا! رائیڈر کو ریٹنگ دینے کے لیے ٹیپ کریں۔',
  cancelled: 'آپ کا آرڈر منسوخ ہو گیا۔ تفصیل کے لیے ٹیپ کریں۔',
};

const JOB_EN: Record<string, string> = {
  requested: 'Your ustaad had to drop out. We are finding another one.',
  accepted: 'An ustaad accepted your booking.',
  on_the_way: 'Your ustaad is on the way.',
  arrived: 'Your ustaad has arrived.',
  completed: 'Job done! Tap to rate your ustaad.',
  cancelled: 'Your booking was cancelled. Tap for details.',
};

const JOB_UR: Record<string, string> = {
  requested: 'آپ کا استاد نہیں آ سکا۔ ہم دوسرا استاد ڈھونڈ رہے ہیں۔',
  accepted: 'ایک استاد نے آپ کی بکنگ قبول کر لی۔',
  on_the_way: 'آپ کا استاد راستے میں ہے۔',
  arrived: 'آپ کا استاد پہنچ گیا ہے۔',
  completed: 'کام مکمل! استاد کو ریٹنگ دینے کے لیے ٹیپ کریں۔',
  cancelled: 'آپ کی بکنگ منسوخ ہو گئی۔ تفصیل کے لیے ٹیپ کریں۔',
};

const TRADE_EN: Record<string, string> = { plumber: 'Plumber', electrician: 'Electrician', ac_technician: 'AC technician', mechanic: 'Mechanic' };
const TRADE_UR: Record<string, string> = { plumber: 'پلمبر', electrician: 'الیکٹریشن', ac_technician: 'اے سی ٹیکنیشن', mechanic: 'مکینک' };

export function composeMessage(kind: string, params: Params, language: Language = 'en'): Message | null {
  const ur = language === 'ur';
  const code = str(params.code);
  switch (kind) {
    case 'order_status': {
      const body = (ur ? STATUS_UR : STATUS_EN)[str(params.status)];
      if (!body) return null;
      return { title: ur ? `آرڈر ${code}` : `Order ${code}`, body };
    }
    case 'substitution': {
      const item = str(params.item);
      const suggestion = str(params.suggestion);
      return {
        title: ur ? 'رائیڈر کا سوال' : 'Question from your rider',
        body: suggestion
          ? ur
            ? `${item} دستیاب نہیں۔ اس کی جگہ ${suggestion} لے آئیں؟`
            : `${item} is not available. Get ${suggestion} instead?`
          : ur
            ? `${item} دستیاب نہیں۔ اسے چھوڑ دیں؟`
            : `${item} is not available. Skip it?`,
      };
    }
    case 'new_offer':
      return {
        title: ur ? 'قریب نیا آرڈر' : 'New order near you',
        body: ur
          ? `فیس ${str(params.fee)} روپے سے · ${str(params.km)} کلومیٹر۔ قبول کرنے کے لیے ایپ کھولیں۔`
          : `Fee from Rs ${str(params.fee)} · ${str(params.km)} km away. Open the app to accept.`,
      };
    case 'substitution_answer':
      return {
        title: ur ? `آرڈر ${code}` : `Order ${code}`,
        body: params.approved
          ? ur
            ? `گاہک نے ہاں کہا: ${str(params.item)}`
            : `The customer said yes: ${str(params.item)}`
          : ur
            ? `گاہک نے نہیں کہا: ${str(params.item)}`
            : `The customer said no: ${str(params.item)}`,
      };
    case 'order_assigned':
      return {
        title: ur ? 'آپ کو آرڈر دیا گیا' : 'An order was given to you',
        body: ur ? `آرڈر ${code}۔ شروع کرنے کے لیے ایپ کھولیں۔` : `Order ${code}. Open the app to start.`,
      };
    case 'order_cancelled':
      return {
        title: ur ? `آرڈر ${code}` : `Order ${code}`,
        body: ur ? 'یہ آرڈر منسوخ ہو گیا۔' : 'This order was cancelled.',
      };
    case 'job_status': {
      const body = (ur ? JOB_UR : JOB_EN)[str(params.status)];
      if (!body) return null;
      return { title: ur ? `بکنگ ${code}` : `Booking ${code}`, body };
    }
    case 'new_job_offer': {
      const trade = (ur ? TRADE_UR : TRADE_EN)[str(params.trade)] ?? '';
      const when = params.timing === 'scheduled' ? (ur ? 'وقت مقرر' : 'booked slot') : ur ? 'ابھی' : 'come now';
      return {
        title: ur ? `نیا کام: ${trade}` : `New job: ${trade}`,
        body: ur
          ? `${when} · ${str(params.km)} کلومیٹر۔ قبول کرنے کے لیے ایپ کھولیں۔`
          : `${when} · ${str(params.km)} km away. Open the app to accept.`,
      };
    }
    case 'job_quote':
      return {
        title: ur ? 'استاد کی قیمت' : "Your ustaad's price",
        body: ur
          ? `کام کی قیمت ${str(params.total)} روپے۔ منظور کرنے کے لیے ٹیپ کریں۔`
          : `Rs ${str(params.total)} for the work. Tap to approve or decline.`,
      };
    case 'quote_answer':
      return {
        title: ur ? `بکنگ ${code}` : `Booking ${code}`,
        body: params.approved
          ? ur
            ? 'گاہک نے قیمت منظور کر لی۔ کام شروع کریں۔'
            : 'The customer approved your price. Start the work.'
          : ur
            ? 'گاہک نے قیمت نامنظور کی۔ وزٹ فیس وصول کریں۔'
            : 'The customer declined the price. Collect the visit fee.',
      };
    case 'job_assigned':
      return {
        title: ur ? 'آپ کو کام دیا گیا' : 'A job was given to you',
        body: ur ? `بکنگ ${code}۔ تفصیل کے لیے ایپ کھولیں۔` : `Booking ${code}. Open the app for details.`,
      };
    case 'chat_message': {
      const from = str(params.from);
      const who =
        from === 'admin' ? (ur ? 'HomeCare سپورٹ' : 'HomeCare support') : from === 'customer' ? (ur ? 'گاہک' : 'Customer') : ur ? 'آپ کا پارٹنر' : 'Your partner';
      return { title: `${who} · ${code}`, body: str(params.preview) };
    }
    case 'sos_alert':
      return {
        title: ur ? '🚨 SOS الرٹ' : '🚨 SOS alert',
        body: ur
          ? `ایک ${params.role === 'partner' ? 'پارٹنر' : 'گاہک'} نے مدد مانگی ہے${code ? ` (${code})` : ''}۔ ایڈمن پینل کھولیں۔`
          : `A ${params.role === 'partner' ? 'partner' : 'customer'} asked for help${code ? ` (${code})` : ''}. Open the admin panel now.`,
      };
    case 'dispute_raised':
      return {
        title: ur ? `نئی شکایت ${code}` : `New dispute ${code}`,
        body: ur ? 'ایڈمن پینل میں دیکھیں۔' : 'Review it in the admin panel → Safety.',
      };
    case 'dispute_update': {
      const status = str(params.status);
      const en: Record<string, string> = {
        in_review: 'We are looking into your report.',
        resolved: 'Your report is resolved. Tap to see what we decided.',
        rejected: 'Your report is closed. Tap to see why.',
      };
      const urd: Record<string, string> = {
        in_review: 'ہم آپ کی رپورٹ دیکھ رہے ہیں۔',
        resolved: 'آپ کی رپورٹ حل ہو گئی۔ فیصلہ دیکھنے کے لیے ٹیپ کریں۔',
        rejected: 'آپ کی رپورٹ بند ہو گئی۔ وجہ دیکھنے کے لیے ٹیپ کریں۔',
      };
      const body = (ur ? urd : en)[status];
      return body ? { title: ur ? `رپورٹ ${code}` : `Report ${code}`, body } : null;
    }
    case 'job_cancelled':
      return {
        title: ur ? `بکنگ ${code}` : `Booking ${code}`,
        body: ur ? 'یہ بکنگ منسوخ ہو گئی۔' : 'This booking was cancelled.',
      };
    default:
      return null;
  }
}

/** Notifications that are useless after a while (an offer lasts 30 s) are dropped instead of sent late. */
export function isStale(kind: string, createdAt: Date, now: Date = new Date()): boolean {
  const ageMs = now.getTime() - createdAt.getTime();
  const limitMs = kind === 'new_offer' || kind === 'new_job_offer' ? 60_000 : 30 * 60_000;
  return ageMs > limitMs;
}
