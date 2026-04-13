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

      // Build sort params
      let order = "volume";
      let ascending = "false";
      if (sort === "newest") { order = "startDate"; ascending = "false"; }
      else if (sort === "closing_soon") { order = "endDate"; ascending = "true"; }

      const cacheKey = `markets:${category}:${limit}:${sort}`;
      const hit = cached<any>(cacheKey);
      if (hit) return c.json(hit);

      // Fetch more than needed so we can filter by category
      const fetchLimit = category ? Math.min(limit * 3, 100) : limit;
      const markets = await fetchGammaMarkets({
        limit: String(fetchLimit),
        active: "true",
        closed: "false",
        order,
        ascending,
      });

      let formatted = markets.map(formatMarket);

      // Filter by category if specified
      if (category) {
        formatted = formatted.filter((m) => m.category === category);
      }

      formatted = formatted.slice(0, limit);

      const result = {
        markets: formatted,
        count: formatted.length,
        sort,
        category: category || "all",
        source: "polymarket",
        timestamp: new Date().toISOString(),
      };

      setCache(cacheKey, result);
      return c.json(result);
    } catch (e: any) {
      return c.json({ error: e.message, source: "polymarket", timestamp: new Date().toISOString() }, 502);
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

        // Gamma API supports text search via slug-like matching
        // Fetch a batch and filter client-side
        const markets = await fetchGammaMarkets({
          limit: "50",
          active: "true",
          closed: "false",
          order: "volume",
          ascending: "false",
        });

        const queryLower = query.toLowerCase();
        const matched = markets.filter((m) =>
          m.question.toLowerCase().includes(queryLower) ||
          (m.slug && m.slug.toLowerCase().includes(queryLower.replace(/\s+/g, "-")))
        );

        if (matched.length === 0) {
          return c.json({
            error: `No markets found matching "${query}"`,
            suggestion: "Try broader terms like 'bitcoin', 'trump', 'fed rates'",
            source: "polymarket",
            timestamp: new Date().toISOString(),
          }, 404);
        }

        // Return the best match (highest volume among matches)
        const best = matched.sort((a, b) => parseFloat(b.volume || "0") - parseFloat(a.volume || "0"))[0];
        const detail = formatMarketDetail(best);

        const result = {
          ...detail,
          matchedFrom: matched.length,
          source: "polymarket",
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

      const cacheKey = `trending:${limit}`;
      const hit = cached<any>(cacheKey);
      if (hit) return c.json(hit);

      // Fetch markets sorted by volume (proxy for trending)
      const markets = await fetchGammaMarkets({
        limit: String(limit),
        active: "true",
        closed: "false",
        order: "volume",
        ascending: "false",
      });

      const trending = markets.map((m) => {
        const { outcomePrices } = parseOutcomes(m);
        // Leading probability = highest outcome price
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
        };
      });

      const result = {
        trending,
        count: trending.length,
        source: "polymarket",
        timestamp: new Date().toISOString(),
      };

      setCache(cacheKey, result);
      return c.json(result);
    } catch (e: any) {
      return c.json({ error: e.message, source: "polymarket", timestamp: new Date().toISOString() }, 502);
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
  };
}
