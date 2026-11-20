# Voice assistant

Customers name their assistant (for example **Jack**) and talk to it instead of tapping through
screens:

> "Jack, do kilo tamatar aur ek Olpers ka pack Ali Kiryana se"
> "Kal 11 bajay plumber chahiye, kitchen ka nal tapak raha hai"
> "Mera order kahan hai?"

The assistant answers out loud and shows the order or booking on a card. **Nothing is placed
until the customer taps "Place order" / "Book ustaad".** After that, the normal flow runs:
automatic offers to the nearest rider or ustaad, live tracking, chat.

## How it works

```
app (mic) ──audio──► Supabase Edge Function "assistant" ──► Groq Whisper (speech → text)
                         │                               └► Groq gpt-oss-120b (text → order, strict JSON)
                         │  checks the result against the customer's own addresses, favourites,
                         ▼  categories and trades (supabase/functions/assistant/logic.ts)
app shows a confirmation card ──"Place order"──► the same database functions as the order screens
```

- **Free:** Groq's free plan (speech and AI) and Supabase's free Edge Functions. No server to host.
- **The Groq key stays on Supabase** (a secret), never in the app.
- **Limits:** 40 requests per person per day (admin → Settings → `assistant_daily_limit`), plus
  Groq's free-plan limits. When either is reached the app says so and the normal screens still work.
- **Privacy:** what the customer says goes to Groq to be understood. Only the spoken text, address
  labels/areas (not full addresses), favourite ustaads' names and order codes are sent — never phone
  numbers. Mention this in the Privacy Policy before launch.
- Tap-to-talk (or type). Hands-free "Hey Jack" while the app is open is a later step.

## Switching it on (project owner, ~10 minutes)

1. **Database:** run [`supabase/SETUP_09_ASSISTANT.sql`](../supabase/SETUP_09_ASSISTANT.sql) in the
   SQL Editor (after 1–8). The result row must be all `true`.
2. **Groq key:** sign in at https://console.groq.com → **API Keys** → **Create API Key**. Copy it.
   Don't paste it into chats or commit it.
3. **Add it to Supabase:** dashboard → **Edge Functions** → **Secrets** → add
   `GROQ_API_KEY` = your key. (Optional: `GROQ_CHAT_MODEL`, default `openai/gpt-oss-120b`;
   `GROQ_STT_MODEL`, default `whisper-large-v3` — change these if Groq retires a model.)
4. **Deploy the function** from the repo root (opens a browser to log in the first time):

   ```bash
   npx supabase login
   ```

   ```bash
   npx supabase functions deploy assistant --project-ref pvpxyvfyvinywidmgtno --use-api
   ```

   `--use-api` builds it on Supabase, so Docker isn't needed. The function only accepts signed-in
   users (Supabase checks the login token before it runs).
5. Open the customer app → home → **Ask Jack**. The first time, it asks for the assistant's name.

## Checking it

- Supabase → Edge Functions → **assistant** → **Logs** shows each call and any error code.
- "The assistant isn't switched on yet" in the app = function not deployed (404) or no
  `GROQ_API_KEY` (503).
- "I'm a bit busy" = Groq's free-plan limit for the minute/day was reached.
- `npm run assistant:test` runs the logic tests (validation, slots, fallbacks) without calling Groq.

## Notes

- Speech recognition of Urdu, English and Roman Urdu mixes is done by Whisper; quality depends on the
  phone's microphone and background noise. The confirmation card is the safety net.
- Replies are read out with the phone's text-to-speech (Urdu voice for Urdu text). If a phone has no
  Urdu voice installed, it may read Urdu slowly or not at all; the text is always on screen.
- The model never sees prices; fees come from the business settings when the order is placed.
