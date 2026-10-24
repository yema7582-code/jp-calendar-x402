// Japan calendar API (holidays, business days, wareki) paid per call via x402 (USDC on Base).
// Runs on Cloudflare Workers / Deno (`export default { fetch }`).
import { HOLIDAYS } from "./holidays.js";

const PAY_TO = "0x4C4860b980a3AE0c91aa69e8eff48009C5469fEe";
const USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const FACILITATOR = "https://facilitator.payai.network";
const PRICE = "1000"; // 0.001 USDC (6 decimals)
const DATA_MAX = "2027-12-31";

const ERAS = [
  ["令和", "R", "2019-05-01"], ["平成", "H", "1989-01-08"],
  ["昭和", "S", "1926-12-25"], ["大正", "T", "1912-07-30"], ["明治", "M", "1868-10-23"],
];

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj, null, 2), {
    status, headers: { "content-type": "application/json; charset=utf-8", "access-control-allow-origin": "*", ...extra },
  });

const iso = (dt) => dt.toISOString().slice(0, 10);
const parse = (s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s || "")) return null;
  const dt = new Date(s + "T00:00:00Z");
  return isNaN(dt) || iso(dt) !== s ? null : dt;
};
const isBizDay = (dt) => { const w = dt.getUTCDay(); return w !== 0 && w !== 6 && !HOLIDAYS[iso(dt)]; };

function wareki(dt) {
  const s = iso(dt);
  for (const [name, abbr, start] of ERAS) {
    if (s >= start) {
      const y = dt.getUTCFullYear() - Number(start.slice(0, 4)) + 1;
      const m = dt.getUTCMonth() + 1, d = dt.getUTCDate();
      return { date: s, era: name, era_abbr: abbr, era_year: y,
        wareki: `${name}${y === 1 ? "元" : y}年${m}月${d}日`, wareki_short: `${abbr}${y}.${m}.${d}` };
    }
  }
  return null;
}

export const ROUTES = {
  "/v1/holidays": {
    desc: "Japanese national holidays (official Cabinet Office list, 1955-2027) for a year: ?year=2026",
    run(q) {
      const y = q.get("year");
      if (!/^\d{4}$/.test(y || "")) return [400, { error: "year=YYYY required" }];
      const list = Object.entries(HOLIDAYS).filter(([d]) => d.startsWith(y + "-")).map(([date, name]) => ({ date, name }));
      return [200, { year: Number(y), count: list.length, holidays: list, source: "内閣府 国民の祝日 CSV" }];
    },
  },
  "/v1/business-days": {
    desc: "Japanese business-day math (skips weekends + national holidays): ?from=2026-12-25&add=5, or ?from=..&to=.. to count",
    run(q) {
      const from = parse(q.get("from"));
      if (!from) return [400, { error: "from=YYYY-MM-DD required" }];
      if (q.get("to")) {
        const to = parse(q.get("to"));
        if (!to || to < from) return [400, { error: "to must be a date >= from" }];
        let n = 0; for (let d = new Date(from); d <= to; d.setUTCDate(d.getUTCDate() + 1)) if (isBizDay(d)) n++;
        return [200, { from: iso(from), to: iso(to), business_days_inclusive: n }];
      }
      const add = parseInt(q.get("add") || "0", 10);
      if (!Number.isFinite(add) || Math.abs(add) > 1000) return [400, { error: "add must be an integer within ±1000" }];
      const d = new Date(from), step = add < 0 ? -1 : 1; let left = Math.abs(add); const skipped = [];
      while (left > 0) { d.setUTCDate(d.getUTCDate() + step); if (isBizDay(d)) left--; else if (HOLIDAYS[iso(d)]) skipped.push({ date: iso(d), name: HOLIDAYS[iso(d)] }); }
      if (iso(d) > DATA_MAX) return [422, { error: `result beyond holiday data range (${DATA_MAX})` }];
      return [200, { from: iso(from), add, result: iso(d), result_is_business_day: isBizDay(d), holidays_skipped: skipped }];
    },
  },
  "/v1/wareki": {
    desc: "Convert a Gregorian date to Japanese era (和暦): ?date=2026-10-24 -> 令和8年10月24日",
    run(q) {
      const dt = parse(q.get("date"));
      if (!dt) return [400, { error: "date=YYYY-MM-DD required" }];
      const r = wareki(dt);
      return r ? [200, { ...r, is_holiday: !!HOLIDAYS[iso(dt)], holiday_name: HOLIDAYS[iso(dt)] || null, business_day: isBizDay(dt) }]
               : [400, { error: "dates before Meiji (1868-10-23) unsupported" }];
    },
  },
};

const b64 = (o) => btoa(unescape(encodeURIComponent(JSON.stringify(o))));
const unb64 = (s) => JSON.parse(decodeURIComponent(escape(atob(s))));

function requirements(url, route) {
  return {
    scheme: "exact", network: "base", maxAmountRequired: PRICE, resource: url.origin + url.pathname,
    description: route.desc, mimeType: "application/json", payTo: PAY_TO, maxTimeoutSeconds: 120, asset: USDC_BASE,
    outputSchema: { input: { type: "http", method: "GET", discoverable: true } },
    extra: { name: "USD Coin", version: "2" },
  };
}

export async function handle(request) {
  const url = new URL(request.url);
  if (url.pathname === "/" || url.pathname === "/v1") {
    return json({ name: "Japan Calendar API (x402)", price_usdc_per_call: 0.001, network: "base",
      endpoints: Object.fromEntries(Object.entries(ROUTES).map(([p, r]) => [p, r.desc])) });
  }
  const route = ROUTES[url.pathname];
  if (!route) return json({ error: "not found" }, 404);
  const req = requirements(url, route);
  const header = request.headers.get("x-payment");
  if (!header) return json({ x402Version: 1, error: "X-PAYMENT header is required", accepts: [req] }, 402);
  let payload;
  try { payload = unb64(header); } catch { return json({ x402Version: 1, error: "malformed X-PAYMENT", accepts: [req] }, 402); }
  const body = JSON.stringify({ x402Version: 1, paymentPayload: payload, paymentRequirements: req });
  const post = (p) => fetch(FACILITATOR + p, { method: "POST", headers: { "content-type": "application/json" }, body }).then((r) => r.json());
  const v = await post("/verify");
  if (!v.isValid) return json({ x402Version: 1, error: v.invalidReason || "invalid payment", accepts: [req] }, 402);
  const [status, result] = route.run(url.searchParams);
  if (status !== 200) return json(result, status); // don't settle on bad input
  const s = await post("/settle");
  if (!s.success) return json({ x402Version: 1, error: s.errorReason || "settlement failed", accepts: [req] }, 402);
  return json(result, 200, { "x-payment-response": b64(s), "access-control-expose-headers": "x-payment-response" });
}

export default { fetch: handle };
