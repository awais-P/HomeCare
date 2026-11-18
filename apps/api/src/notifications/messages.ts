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
    default:
      return null;
  }
}

/** Notifications that are useless after a while (an offer lasts 30 s) are dropped instead of sent late. */
export function isStale(kind: string, createdAt: Date, now: Date = new Date()): boolean {
  const ageMs = now.getTime() - createdAt.getTime();
  const limitMs = kind === 'new_offer' ? 60_000 : 30 * 60_000;
  return ageMs > limitMs;
}
