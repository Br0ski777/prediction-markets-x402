import type { Hono } from "hono";

// ─── Cache ──────────────────────────────────────────────────────────────────

interface CacheEntry { data: any; ts: number }
const cache = new Map<string, CacheEntry>();
const CACHE_TTL = 120_000; // 120 seconds — prediction markets change slowly

function cached<T>(key: string): T | null {
  const e = cache.get(key);
  return e && Date.now() - e.ts < CACHE_TTL ? (e.data as T) : null;
}
function setCache(key: string, data: any) { cache.set(key, { data, ts: Date.now() }); }

// ─── Polymarket Gamma API ──────────────────────────────────────────────────

const GAMMA_BASE = "https://gamma-api.polymarket.com";

interface GammaMarket {
  id: string;
  question: string;
  conditionId: string;
  slug: string;
  outcomePrices: string; // JSON string like "[0.65, 0.35]"
  outcomes: string;      // JSON string like '["Yes","No"]'
  volume: string;
  liquidity: string;
  endDate: string;
  startDate: string;
  createdAt: string;
  active: boolean;
  closed: boolean;
  description: string;
  volume24hr?: string;
  competitive?: string;
  acceptingOrders?: boolean;
}

async function fetchGammaMarkets(params: Record<string, string>): Promise<GammaMarket[]> {
  const qs = new URLSearchParams(params).toString();
  const url = `${GAMMA_BASE}/markets?${qs}`;
  try {
    const resp = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) throw new Error(`Gamma API ${resp.status}: ${resp.statusText}`);
    return await resp.json() as GammaMarket[];
  } catch (e: any) {
    console.error("[polymarket] Gamma fetch error:", e.message);
    throw new Error(`Polymarket API error: ${e.message}`);
  }
}

// ─── Kalshi API ───────────────────────────────────────────────────────────

const KALSHI_BASE = "https://api.elections.kalshi.com/trade-api/v2";

interface KalshiMarket {
  ticker: string;
  title: string;
  subtitle: string;
  yes_ask: number;
  no_ask: number;
  volume: number;
  close_time: string;
  status: string;
  category: string;
}

async function fetchKalshiMarkets(limit = 20): Promise<KalshiMarket[]> {
  const cacheKey = `kalshi:raw:${limit}`;
  const hit = cached<KalshiMarket[]>(cacheKey);
  if (hit) return hit;

  try {
    const url = `${KALSHI_BASE}/markets?limit=${limit}&status=open`;
    const resp = await fetch(url, {
      headers: { "Accept": "application/json" },
      signal: AbortSignal.timeout(10_000),
    });
    if (!resp.ok) throw new Error(`Kalshi API ${resp.status}: ${resp.statusText}`);
    const data = await resp.json() as { markets: KalshiMarket[] };
    const markets = data.markets || [];
    setCache(cacheKey, markets);
    return markets;
  } catch (e: any) {
    console.error("[kalshi] fetch error:", e.message);
    return []; // graceful fallback -- return empty so Polymarket data still works
  }
}

function formatKalshiMarket(m: KalshiMarket) {
  const yesPrice = m.yes_ask != null ? m.yes_ask / 100 : 0;
  const noPrice = m.no_ask != null ? m.no_ask / 100 : 0;
  return {
    id: m.ticker,
    question: m.title + (m.subtitle ? ` -- ${m.subtitle}` : ""),
    outcomes: ["Yes", "No"],
    outcomePrices: { Yes: Math.round(yesPrice * 10000) / 10000, No: Math.round(noPrice * 10000) / 10000 },
    volume: m.volume || 0,
    volume24h: 0, // Kalshi public API doesn't expose 24h volume
    liquidity: 0, // not available in public API
    endDate: m.close_time || null,
    startDate: null,
    category: mapKalshiCategory(m.category || guessCategory(m.title)),
    active: m.status === "open",
    slug: m.ticker,
    source: "kalshi" as const,
  };
}

function formatKalshiMarketDetail(m: KalshiMarket) {
  const base = formatKalshiMarket(m);
  return {
    ...base,
    description: m.subtitle || null,
  };
}

function mapKalshiCategory(cat: string): string {
  const c = cat.toLowerCase();
  if (/politic|elect|congress|senate/.test(c)) return "politics";
  if (/crypto|bitcoin|ethereum/.test(c)) return "crypto";
  if (/sport|nba|nfl|mlb/.test(c)) return "sports";
  if (/science|tech|ai|climate/.test(c)) return "science";
  if (/culture|entertainment|movie/.test(c)) return "culture";
  // Kalshi categories can be specific like "Economics", "Finance" etc.
  if (/econ|financ|fed|rate/.test(c)) return "politics";
  return "other";
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function parseOutcomes(market: GammaMarket): { outcomes: string[]; outcomePrices: Record<string, number> } {
  let outcomes: string[] = [];
  let prices: number[] = [];
  try { outcomes = JSON.parse(market.outcomes || "[]"); } catch { outcomes = ["Yes", "No"]; }
  try { prices = JSON.parse(market.outcomePrices || "[]"); } catch { prices = []; }

  const outcomePrices: Record<string, number> = {};
  for (let i = 0; i < outcomes.length; i++) {
    outcomePrices[outcomes[i]] = prices[i] != null ? Math.round(prices[i] * 10000) / 10000 : 0;
  }
  return { outcomes, outcomePrices };
}

function guessCategory(question: string): string {
  const q = question.toLowerCase();
  if (/trump|biden|elect|president|congress|senate|governor|vote|political|democrat|republican|party|primaries|poll/.test(q)) return "politics";
  if (/bitcoin|btc|eth|ethereum|crypto|token|defi|nft|solana|sol |doge|xrp|blockchain|halving/.test(q)) return "crypto";
  if (/nba|nfl|mlb|nhl|soccer|football|tennis|ufc|fight|game|championship|super bowl|world cup|olympics|match|team/.test(q)) return "sports";
  if (/ai |gpt|openai|anthropic|google|apple|meta |microsoft|spacex|nasa|climate|science|research|fda|vaccine|covid/.test(q)) return "science";
  if (/oscar|grammy|movie|film|album|spotify|tiktok|youtube|celebrity|award|box office/.test(q)) return "culture";
  return "other";
}

function formatMarket(market: GammaMarket) {
  const { outcomes, outcomePrices } = parseOutcomes(market);
  return {
    id: market.conditionId || market.id,
    question: market.question,
    outcomes,
    outcomePrices,
    volume: parseFloat(market.volume || "0"),
    volume24h: parseFloat(market.volume24hr || "0"),
    liquidity: parseFloat(market.liquidity || "0"),
    endDate: market.endDate || null,
    startDate: market.startDate || null,
    category: guessCategory(market.question),
    active: market.active && !market.closed,
    slug: market.slug,
    source: "polymarket" as const,
  };
}

// ─── Route Handlers ────────────────────────────────────────────────────────

export function registerRoutes(app: Hono) {

  // POST /api/markets — List active prediction markets
  app.post("/api/markets", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const category = (body as any).category || null;
      const limit = Math.min(Math.max(parseInt((body as any).limit) || 20, 1), 50);
      const sort = (body as any).sort || "volume";
      const sourceFilter = (body as any).source || null; // "polymarket", "kalshi", or null for both

      // Build sort params for Polymarket
      let order = "volume";
      let ascending = "false";
      if (sort === "newest") { order = "startDate"; ascending = "false"; }
      else if (sort === "closing_soon") { order = "endDate"; ascending = "true"; }

      const cacheKey = `markets:${category}:${limit}:${sort}:${sourceFilter}`;
      const hit = cached<any>(cacheKey);
      if (hit) return c.json(hit);

      // Fetch more than needed so we can filter by category
      const fetchLimit = category ? Math.min(limit * 3, 100) : limit;

      // Fetch from both sources in parallel (skip source if filtered out)
      const [polymarketRaw, kalshiRaw] = await Promise.all([
        sourceFilter === "kalshi"
          ? Promise.resolve([])
          : fetchGammaMarkets({ limit: String(fetchLimit), active: "true", closed: "false", order, ascending }).catch(() => []),
        sourceFilter === "polymarket"
          ? Promise.resolve([])
          : fetchKalshiMarkets(fetchLimit).catch(() => []),
      ]);

      let formatted = [
        ...polymarketRaw.map(formatMarket),
        ...kalshiRaw.map(formatKalshiMarket),
      ];

      // Filter by category if specified
      if (category) {
        formatted = formatted.filter((m) => m.category === category);
      }

      // Sort merged results
      if (sort === "volume") {
        formatted.sort((a, b) => b.volume - a.volume);
      } else if (sort === "newest") {
        formatted.sort((a, b) => {
          const da = a.startDate || a.endDate || "";
          const db = b.startDate || b.endDate || "";
          return db.localeCompare(da);
        });
      } else if (sort === "closing_soon") {
        formatted.sort((a, b) => {
          const da = a.endDate || "9999";
          const db = b.endDate || "9999";
          return da.localeCompare(db);
        });
      }

      formatted = formatted.slice(0, limit);

      const result = {
        markets: formatted,
        count: formatted.length,
        sort,
        category: category || "all",
        source: sourceFilter || "polymarket+kalshi",
        timestamp: new Date().toISOString(),
      };

      setCache(cacheKey, result);
      return c.json(result);
    } catch (e: any) {
      return c.json({ error: e.message, source: "polymarket+kalshi", timestamp: new Date().toISOString() }, 502);
    }
  });

  // POST /api/odds — Get detailed odds for a specific market
  app.post("/api/odds", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const marketId = (body as any).marketId || null;
      const query = (body as any).query || null;

      if (!marketId && !query) {
        return c.json({ error: "Provide either 'marketId' (condition ID) or 'query' (search text)" }, 400);
      }

      // Search by query
      if (query) {
        const cacheKey = `odds:query:${query}`;
        const hit = cached<any>(cacheKey);
        if (hit) return c.json(hit);

        // Fetch from both sources in parallel
        const [polymarketRaw, kalshiRaw] = await Promise.all([
          fetchGammaMarkets({ limit: "50", active: "true", closed: "false", order: "volume", ascending: "false" }).catch(() => []),
          fetchKalshiMarkets(50).catch(() => []),
        ]);

        const queryLower = query.toLowerCase();

        // Search Polymarket
        const polyMatched = polymarketRaw.filter((m) =>
          m.question.toLowerCase().includes(queryLower) ||
          (m.slug && m.slug.toLowerCase().includes(queryLower.replace(/\s+/g, "-")))
        );

        // Search Kalshi
        const kalshiMatched = kalshiRaw.filter((m) =>
          m.title.toLowerCase().includes(queryLower) ||
          m.ticker.toLowerCase().includes(queryLower) ||
          (m.subtitle && m.subtitle.toLowerCase().includes(queryLower))
        );

        if (polyMatched.length === 0 && kalshiMatched.length === 0) {
          return c.json({
            error: `No markets found matching "${query}"`,
            suggestion: "Try broader terms like 'bitcoin', 'trump', 'fed rates'",
            source: "polymarket+kalshi",
            timestamp: new Date().toISOString(),
          }, 404);
        }

        // Find best match across both sources by volume
        let bestResult: any = null;
        let bestVolume = -1;

        if (polyMatched.length > 0) {
          const best = polyMatched.sort((a, b) => parseFloat(b.volume || "0") - parseFloat(a.volume || "0"))[0];
          const vol = parseFloat(best.volume || "0");
          if (vol > bestVolume) {
            bestVolume = vol;
            bestResult = { ...formatMarketDetail(best), source: "polymarket" };
          }
        }

        if (kalshiMatched.length > 0) {
          const best = kalshiMatched.sort((a, b) => (b.volume || 0) - (a.volume || 0))[0];
          if ((best.volume || 0) > bestVolume) {
            bestResult = { ...formatKalshiMarketDetail(best), source: "kalshi" };
          }
        }

        const result = {
          ...bestResult,
          matchedFrom: polyMatched.length + kalshiMatched.length,
          timestamp: new Date().toISOString(),
        };

        setCache(cacheKey, result);
        return c.json(result);
      }

      // Search by marketId (conditionId)
      const cacheKey = `odds:id:${marketId}`;
      const hit = cached<any>(cacheKey);
      if (hit) return c.json(hit);

      // Try fetching by condition_id
      const markets = await fetchGammaMarkets({
        limit: "1",
        condition_id: marketId,
      });

      if (markets.length === 0) {
        // Fallback: try id
        const marketsById = await fetchGammaMarkets({
          limit: "1",
          id: marketId,
        });
        if (marketsById.length === 0) {
          return c.json({
            error: `Market not found: ${marketId}`,
            suggestion: "Use /api/markets to browse available markets, or search by query",
            source: "polymarket",
            timestamp: new Date().toISOString(),
          }, 404);
        }
        const detail = formatMarketDetail(marketsById[0]);
        const result = { ...detail, source: "polymarket", timestamp: new Date().toISOString() };
        setCache(cacheKey, result);
        return c.json(result);
      }

      const detail = formatMarketDetail(markets[0]);
      const result = { ...detail, source: "polymarket", timestamp: new Date().toISOString() };
      setCache(cacheKey, result);
      return c.json(result);
    } catch (e: any) {
      return c.json({ error: e.message, source: "polymarket", timestamp: new Date().toISOString() }, 502);
    }
  });

  // POST /api/trending — Top trending markets by volume
  app.post("/api/trending", async (c) => {
    try {
      const body = await c.req.json().catch(() => ({}));
      const limit = Math.min(Math.max(parseInt((body as any).limit) || 10, 1), 30);
      const sourceFilter = (body as any).source || null; // "polymarket", "kalshi", or null for both

      const cacheKey = `trending:${limit}:${sourceFilter}`;
      const hit = cached<any>(cacheKey);
      if (hit) return c.json(hit);

      // Fetch from both sources in parallel
      const [polymarketRaw, kalshiRaw] = await Promise.all([
        sourceFilter === "kalshi"
          ? Promise.resolve([])
          : fetchGammaMarkets({ limit: String(limit), active: "true", closed: "false", order: "volume", ascending: "false" }).catch(() => []),
        sourceFilter === "polymarket"
          ? Promise.resolve([])
          : fetchKalshiMarkets(limit).catch(() => []),
      ]);

      const polyTrending = polymarketRaw.map((m) => {
        const { outcomePrices } = parseOutcomes(m);
        const probability = Math.max(...Object.values(outcomePrices));
        return {
          id: m.conditionId || m.id,
          question: m.question,
          probability,
          outcomePrices,
          volume24h: parseFloat(m.volume24hr || "0"),
          totalVolume: parseFloat(m.volume || "0"),
          category: guessCategory(m.question),
          endDate: m.endDate || null,
          active: m.active && !m.closed,
          slug: m.slug,
          source: "polymarket" as const,
        };
      });

      const kalshiTrending = kalshiRaw.map((m) => {
        const yesPrice = m.yes_ask != null ? m.yes_ask / 100 : 0;
        const noPrice = m.no_ask != null ? m.no_ask / 100 : 0;
        const probability = Math.max(yesPrice, noPrice);
        return {
          id: m.ticker,
          question: m.title + (m.subtitle ? ` -- ${m.subtitle}` : ""),
          probability: Math.round(probability * 10000) / 10000,
          outcomePrices: { Yes: Math.round(yesPrice * 10000) / 10000, No: Math.round(noPrice * 10000) / 10000 },
          volume24h: 0,
          totalVolume: m.volume || 0,
          category: mapKalshiCategory(m.category || guessCategory(m.title)),
          endDate: m.close_time || null,
          active: m.status === "open",
          slug: m.ticker,
          source: "kalshi" as const,
        };
      });

      // Merge and sort by volume
      const allTrending = [...polyTrending, ...kalshiTrending]
        .sort((a, b) => b.totalVolume - a.totalVolume)
        .slice(0, limit);

      const result = {
        trending: allTrending,
        count: allTrending.length,
        source: sourceFilter || "polymarket+kalshi",
        timestamp: new Date().toISOString(),
      };

      setCache(cacheKey, result);
      return c.json(result);
    } catch (e: any) {
      return c.json({ error: e.message, source: "polymarket+kalshi", timestamp: new Date().toISOString() }, 502);
    }
  });
}

// ─── Detailed Market Formatter ─────────────────────────────────────────────

function formatMarketDetail(market: GammaMarket) {
  const { outcomes, outcomePrices } = parseOutcomes(market);
  return {
    id: market.conditionId || market.id,
    question: market.question,
    description: market.description || null,
    outcomes,
    outcomePrices,
    volume: parseFloat(market.volume || "0"),
    volume24h: parseFloat(market.volume24hr || "0"),
    liquidity: parseFloat(market.liquidity || "0"),
    endDate: market.endDate || null,
    startDate: market.startDate || null,
    category: guessCategory(market.question),
    active: market.active && !market.closed,
    slug: market.slug,
    source: "polymarket" as const,
  };
}
