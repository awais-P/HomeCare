// Pure logic for the voice assistant (no network, no Deno/Node APIs), so it can be tested with
// `node --test` and used by the Edge Function (index.ts) unchanged.
//
// The AI only proposes; this file decides. Whatever the model returns is checked against the
// user's real addresses, favourites, categories and trades, and turned into a draft the app shows
// on a confirmation card. Nothing is ever placed without the customer confirming in the app.

export const CATEGORIES = ['sabzi', 'grocery', 'meat', 'bakery', 'pharmacy', 'food', 'pick_drop', 'other'];
export const TRADES = ['plumber', 'electrician', 'ac_technician', 'mechanic'];
export const ACTIONS = ['sauda_order', 'ustaad_job', 'order_status', 'clarify', 'other'];

export type AddressRef = { id: string; label: string; area: string | null; is_default: boolean };
export type FavouriteRef = { id: string; name: string | null; trades: string[] };
export type ActiveRef = { kind: 'order' | 'job'; id: string; code: string; status: string; what: string };

export type AssistantContext = {
  assistantName: string;
  userName: string | null;
  language: 'en' | 'ur';
  /** Current time, ISO string (the prompt shows it in Pakistan time). */
  now: string;
  addresses: AddressRef[];
  favourites: FavouriteRef[];
  active: ActiveRef[];
};

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export type SaudaDraft = {
  category: string;
  items_text: string;
  shop_preference: string | null;
  instructions: string | null;
  address_id: string;
  address_label: string;
};

export type UstaadDraft = {
  trade: string;
  problem_text: string;
  timing: 'now' | 'scheduled';
  scheduled_for: string | null;
  address_id: string;
  address_label: string;
  preferred_ustaad_id: string | null;
  preferred_ustaad_name: string | null;
};

export type AssistantResult =
  | { action: 'sauda_order'; reply: string; draft: SaudaDraft }
  | { action: 'ustaad_job'; reply: string; draft: UstaadDraft }
  | { action: 'order_status'; reply: string; active: ActiveRef[] }
  | { action: 'clarify' | 'other'; reply: string };

const nullableString = { type: ['string', 'null'] };
const nullableInteger = { type: ['integer', 'null'] };

/** JSON schema for Groq structured outputs (strict: every field required; "no value" is null). */
export const INTENT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['action', 'reply', 'sauda', 'ustaad'],
  properties: {
    action: { type: 'string', enum: ACTIONS },
    reply: { type: 'string' },
    sauda: {
      type: 'object',
      additionalProperties: false,
      required: ['category', 'items_text', 'shop_preference', 'instructions', 'address_id'],
      properties: {
        category: nullableString,
        items_text: nullableString,
        shop_preference: nullableString,
        instructions: nullableString,
        address_id: nullableString,
      },
    },
    ustaad: {
      type: 'object',
      additionalProperties: false,
      required: ['trade', 'problem_text', 'timing', 'day_offset', 'hour', 'address_id', 'preferred_ustaad_id'],
      properties: {
        trade: nullableString,
        problem_text: nullableString,
        timing: nullableString,
        day_offset: nullableInteger,
        hour: nullableInteger,
        address_id: nullableString,
        preferred_ustaad_id: nullableString,
      },
    },
  },
};

const pkTime = (iso: string) =>
  new Date(iso).toLocaleString('en-GB', {
    timeZone: 'Asia/Karachi',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

/** The instructions for the model, with this user's context. */
export function buildSystemPrompt(ctx: AssistantContext): string {
  const addresses = ctx.addresses.length
    ? ctx.addresses.map((a) => `- id=${a.id} label="${a.label}"${a.area ? ` area="${a.area}"` : ''}${a.is_default ? ' (default)' : ''}`).join('\n')
    : '- (none saved yet)';
  const favourites = ctx.favourites.length
    ? ctx.favourites.map((f) => `- id=${f.id} name="${f.name ?? ''}" trades=${f.trades.join('/')}`).join('\n')
    : '- (none)';
  const active = ctx.active.length
    ? ctx.active.map((a) => `- ${a.kind} ${a.code}: ${a.what} — status ${a.status}`).join('\n')
    : '- (none)';
  return `You are ${ctx.assistantName}, the voice assistant inside HomeCare, an app in Islamabad and Rawalpindi.
HomeCare has two services:
1. Sauda Run: a rider buys things from a shop (groceries, vegetables, medicine, bakery, meat, food pickup, pick & drop) and delivers them. Paid in cash on delivery.
2. Ustaad: a verified plumber, electrician, AC technician or mechanic comes to the home, "come now" or at a booked time (9 am to 8 pm).

The user is ${ctx.userName ?? 'a customer'}. They speak English, Urdu or a mix (Roman Urdu). Their app language is ${ctx.language === 'ur' ? 'Urdu' : 'English'}.
Now in Pakistan: ${pkTime(ctx.now)}.

Your job: understand what they want and fill in an order for the app to show them. You never place anything yourself — the app asks them to confirm.

Respond ONLY with JSON matching the schema:
- action "sauda_order": they want things bought/delivered. Fill "sauda": category (one of ${CATEGORIES.join(', ')}), items_text (a clear shopping list with quantities, in the user's words, e.g. "1 kg tamatar, 1 pack Olpers milk 1 litre"), shop_preference (shop name if they said one, else null), instructions (anything else for the rider, else null), address_id (one of the ids below; null if they didn't say and there is no default).
- action "ustaad_job": they want a repair/service at home. Fill "ustaad": trade (one of ${TRADES.join(', ')}), problem_text (the problem in a sentence), timing ("now" or "scheduled"), day_offset (0 = today, 1 = tomorrow, up to 6) and hour (24-hour clock, 9 to 20) when scheduled else null, address_id, preferred_ustaad_id (a favourite's id if they named one, else null).
- action "order_status": they ask about an order or booking in progress.
- action "clarify": something essential is missing or unclear (what to buy, which service, which day/time). Ask ONE short question in "reply".
- action "other": anything HomeCare can't do. Say so briefly and kindly.
Fields of the service you are not using must still be present with null values.

"reply" is what ${ctx.assistantName} says out loud: one or two short, friendly sentences. Use Urdu script if the user spoke Urdu, otherwise English. For an order, summarise it and ask them to confirm on screen.
Never invent items, prices, shops or addresses. Delivery fees and prices are shown by the app, not by you.

Saved addresses:
${addresses}

Favourite ustaads:
${favourites}

Orders and bookings in progress:
${active}`;
}

const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 1000) : null);
const int = (v: unknown): number | null => (typeof v === 'number' && Number.isInteger(v) ? v : null);

const fallbackReply = (ctx: AssistantContext, en: string, ur: string) => (ctx.language === 'ur' ? ur : en);

function pickAddress(ctx: AssistantContext, id: string | null): AddressRef | null {
  return ctx.addresses.find((a) => a.id === id) ?? ctx.addresses.find((a) => a.is_default) ?? (ctx.addresses.length === 1 ? ctx.addresses[0] : null);
}

/** Pakistan is UTC+5 all year (no daylight saving). */
const PK_OFFSET_MS = 5 * 3600_000;

/** day_offset + hour (Pakistan time) → ISO time, if it is a bookable slot (1 h – 7 days ahead, 9:00–20:00). */
export function slotFrom(nowIso: string, dayOffset: number | null, hour: number | null): string | null {
  if (dayOffset == null || hour == null || dayOffset < 0 || dayOffset > 6 || hour < 9 || hour > 20) return null;
  const nowPk = new Date(new Date(nowIso).getTime() + PK_OFFSET_MS);
  const slotUtc = Date.UTC(nowPk.getUTCFullYear(), nowPk.getUTCMonth(), nowPk.getUTCDate() + dayOffset, hour) - PK_OFFSET_MS;
  if (slotUtc - new Date(nowIso).getTime() < 60 * 60_000) return null;
  return new Date(slotUtc).toISOString();
}

/** Checks the model's JSON against the user's real data and returns what the app should show. */
export function interpret(raw: unknown, ctx: AssistantContext): AssistantResult {
  const obj = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const action = typeof obj.action === 'string' && ACTIONS.includes(obj.action) ? obj.action : 'other';
  const reply =
    str(obj.reply) ?? fallbackReply(ctx, "Sorry, I didn't catch that. Please say it again.", 'معاف کیجیے، میں سمجھ نہیں سکا۔ دوبارہ بتائیں۔');
  const needAddress = (): AssistantResult => ({
    action: 'clarify',
    reply: ctx.addresses.length
      ? fallbackReply(ctx, 'Which address should it go to?', 'کس پتے پر بھیجنا ہے؟')
      : fallbackReply(ctx, 'Please add a delivery address first, then ask me again.', 'پہلے ڈیلیوری کا پتہ شامل کریں، پھر دوبارہ کہیں۔'),
  });

  if (action === 'sauda_order') {
    const s = (obj.sauda && typeof obj.sauda === 'object' ? obj.sauda : {}) as Record<string, unknown>;
    const items = str(s.items_text);
    if (!items || items.length < 2) {
      return { action: 'clarify', reply: fallbackReply(ctx, 'What should the rider get for you?', 'رائیڈر آپ کے لیے کیا لائے؟') };
    }
    const address = pickAddress(ctx, str(s.address_id));
    if (!address) return needAddress();
    const category = str(s.category);
    return {
      action: 'sauda_order',
      reply,
      draft: {
        category: category && CATEGORIES.includes(category) ? category : 'grocery',
        items_text: items.slice(0, 2000),
        shop_preference: str(s.shop_preference)?.slice(0, 150) ?? null,
        instructions: str(s.instructions)?.slice(0, 300) ?? null,
        address_id: address.id,
        address_label: address.label,
      },
    };
  }

  if (action === 'ustaad_job') {
    const u = (obj.ustaad && typeof obj.ustaad === 'object' ? obj.ustaad : {}) as Record<string, unknown>;
    const trade = str(u.trade);
    if (!trade || !TRADES.includes(trade)) {
      return {
        action: 'clarify',
        reply: fallbackReply(ctx, 'Do you need a plumber, an electrician, an AC technician or a mechanic?', 'آپ کو پلمبر، الیکٹریشن، اے سی ٹیکنیشن یا مکینک چاہیے؟'),
      };
    }
    const problem = str(u.problem_text);
    if (!problem || problem.length < 2) {
      return { action: 'clarify', reply: fallbackReply(ctx, "What's the problem?", 'مسئلہ کیا ہے؟') };
    }
    const address = pickAddress(ctx, str(u.address_id));
    if (!address) return needAddress();
    const scheduled = str(u.timing) === 'scheduled';
    const slot = scheduled ? slotFrom(ctx.now, int(u.day_offset), int(u.hour)) : null;
    if (scheduled && !slot) {
      return {
        action: 'clarify',
        reply: fallbackReply(
          ctx,
          'Which day and time? I can book from 9 am to 8 pm, at least an hour from now.',
          'کون سا دن اور وقت؟ صبح 9 سے رات 8 بجے تک، کم از کم ایک گھنٹے بعد بک ہو سکتا ہے۔',
        ),
      };
    }
    const favId = str(u.preferred_ustaad_id);
    const fav = ctx.favourites.find((f) => f.id === favId && f.trades.includes(trade)) ?? null;
    return {
      action: 'ustaad_job',
      reply,
      draft: {
        trade,
        problem_text: problem.slice(0, 1000),
        timing: scheduled ? 'scheduled' : 'now',
        scheduled_for: slot,
        address_id: address.id,
        address_label: address.label,
        preferred_ustaad_id: fav?.id ?? null,
        preferred_ustaad_name: fav?.name ?? null,
      },
    };
  }

  if (action === 'order_status') return { action: 'order_status', reply, active: ctx.active };
  return { action: action === 'clarify' ? 'clarify' : 'other', reply };
}

/** The last few turns, trimmed, so the model can follow up on its own question. */
export function cleanHistory(history: unknown): ChatTurn[] {
  if (!Array.isArray(history)) return [];
  return history
    .filter(
      (t): t is ChatTurn =>
        !!t && typeof t === 'object' && (t.role === 'user' || t.role === 'assistant') && typeof t.content === 'string' && t.content.trim().length > 0,
    )
    .slice(-8)
    .map((t) => ({ role: t.role, content: t.content.slice(0, 1000) }));
}

/** Words that help speech-to-text spell local names right. */
export const TRANSCRIBE_HINT =
  'HomeCare, Sauda Run, ustaad, plumber, electrician, AC, mechanic, sabzi, doodh, anday, tamatar, aloo, pyaz, Olpers, Nestle, Dawn bread, kiryana, Panadol, G-10, F-10, I-8, Islamabad, Rawalpindi.';
