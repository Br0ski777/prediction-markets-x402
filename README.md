# Prediction Markets API

[![MCP Server](https://img.shields.io/badge/MCP-server-blue)](https://prediction-markets.api.klymax402.com/mcp)
[![x402](https://img.shields.io/badge/payments-x402-6E56CF)](https://x402.org)
[![License: MIT](https://img.shields.io/badge/license-MIT-green)](LICENSE)

Real-time prediction market odds from Polymarket and Kalshi. Active markets, probabilities, volume, categories. The betting intelligence layer agents need for event forecasting. Pay-per-call via [x402](https://x402.org) (USDC on Base L2) -- no API key, no signup, no rate-limit wall.

Part of the [klymax402](https://klymax402.com) marketplace -- 100 x402 micropayment APIs for AI agents, one wallet, USDC on Base.

## Quickstart -- MCP

Add to your MCP client config (Claude Desktop, Cursor, ElizaOS, etc.):

```json
{
  "mcpServers": {
    "prediction-markets": {
      "url": "https://prediction-markets.api.klymax402.com/mcp"
    }
  }
}
```

## Quickstart -- HTTP (x402)

```bash
curl -X POST "https://prediction-markets.api.klymax402.com/api/markets" \
  -H "Content-Type: application/json" \
  -d '{}'
# -> 402 Payment Required, with an x402 payment challenge in the response body
```

Any x402-aware client ([`@x402/fetch`](https://www.npmjs.com/package/@x402/fetch), [`x402-agent-tools`](https://www.npmjs.com/package/x402-agent-tools), ATXP) handles the 402 -> sign -> retry cycle automatically.

## Tools

| Tool | Method | Path | Price | Description |
|---|---|---|---|---|
| `prediction_list_markets` | POST | `/api/markets` | $0.005 | List active prediction markets from Polymarket and Kalshi with current odds, volume, and categories. Filter by topic, platform, and sort by volume, newest, or closing soon. |
| `prediction_get_market_odds` | POST | `/api/odds` | $0.005 | Get detailed odds and trading data for a specific prediction market by ID or search query. Searches both Polymarket and Kalshi. |
| `prediction_trending_markets` | POST | `/api/trending` | $0.003 | Top trending prediction markets from Polymarket and Kalshi ranked by volume and engagement. |

### `prediction_list_markets`

Use this when you need to browse active prediction markets or find betting odds on real-world events. Returns a list of active markets from Polymarket and Kalshi with current probabilities, trading volume, and metadata.

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `category` | string | no | Filter markets by topic category. Omit for all categories. |
| `limit` | number | no | Number of markets to return (1-50). Default: 20. |
| `sort` | string | no | Sort order. 'volume' = highest traded, 'newest' = recently created, 'closing_soon' = ending soonest. Default: volume. |
| `source` | string | no | Filter by platform. Omit to get markets from both Polymarket and Kalshi. |

**Returns**

- `question` -- the prediction market question (e.g. "Will Bitcoin reach $100k by December 2026?")
- `outcomePrices` -- probability for each outcome as decimal (0.65 = 65% chance YES)
- `volume` -- total trading volume in USD
- `liquidity` -- current available liquidity in USD
- `endDate` -- when the market resolves
- `category` -- topic category (politics, crypto, sports, science, culture)
- `active` -- whether the market is currently trading
- `source` -- data source -- "polymarket" or "kalshi"

Example response:

```json
{ markets: [{ question: "Will Trump win 2028?", outcomePrices: { "Yes": 0.42, "No": 0.58 }, volume: 15420000, liquidity: 890000, endDate: "2028-11-06", category: "politics", source: "polymarket" }] }
```

**Not for**: crypto price data (use `token_get_price`), crypto news (use `crypto_get_news`), stock prices (use `stock_get_quote`), DeFi yields (use `defi_find_best_yields`), Hyperliquid perp data (use `hyperliquid_get_market_data`).

### `prediction_get_market_odds`

Use this when you need detailed odds, probabilities, and trading data for a specific prediction market. Searches both Polymarket and Kalshi to find the best match by market ID or question text.

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `marketId` | string | no | Polymarket condition ID or Kalshi ticker. Use this if you already know the market ID. |
| `query` | string | no | Search query to find a market by question text (e.g. 'bitcoin 100k', 'trump election'). Used when marketId is not known. |

**Returns**

- `question` -- the full prediction market question text
- `outcomes` -- array of possible outcomes with their current probabilities
- `outcomePrices` -- decimal probabilities per outcome (0.72 = 72% implied probability)
- `volume` -- total all-time trading volume in USD
- `volume24h` -- trading volume in the last 24 hours
- `liquidity` -- current depth of the order book in USD
- `endDate` -- resolution date of the market
- `description` -- detailed market description and resolution criteria
- `active` -- whether the market is currently open for trading
- `source` -- which platform the market is from -- "polymarket" or "kalshi"

Example response:

```json
{ question: "Will ETH flip BTC by 2027?", outcomes: ["Yes", "No"], outcomePrices: { "Yes": 0.08, "No": 0.92 }, volume: 2340000, volume24h: 45000, liquidity: 120000, endDate: "2027-12-31", active: true, source: "polymarket" }
```

**Not for**: crypto price data (use `token_get_price`), crypto news (use `crypto_get_news`), stock prices (use `stock_get_quote`), DeFi yields (use `defi_find_best_yields`), Hyperliquid perp data (use `hyperliquid_get_market_data`).

### `prediction_trending_markets`

Use this when you need to see what prediction markets are trending right now. Returns the hottest markets from both Polymarket and Kalshi ranked by recent trading volume and activity.

**Parameters**

| Name | Type | Required | Description |
|---|---|---|---|
| `limit` | number | no | Number of trending markets to return (1-30). Default: 10. |
| `source` | string | no | Filter by platform. Omit to get trending markets from both Polymarket and Kalshi. |

**Returns**

- `question` -- the market question
- `probability` -- current implied probability for the leading outcome (decimal)
- `volume24h` -- trading volume in the last 24 hours in USD
- `totalVolume` -- all-time trading volume in USD
- `priceChange24h` -- change in probability over the last 24 hours (e.g. +0.05 = probability rose 5%)
- `category` -- topic category
- `endDate` -- when the market resolves
- `source` -- data source -- "polymarket" or "kalshi"

Example response:

```json
{ trending: [{ question: "Will Fed cut rates in July 2026?", probability: 0.73, volume24h: 890000, totalVolume: 12500000, priceChange24h: 0.08, category: "politics", endDate: "2026-07-31", source: "polymarket" }] }
```

**Not for**: crypto price data (use `token_get_price`), crypto news (use `crypto_get_news`), stock prices (use `stock_get_quote`), DeFi yields (use `defi_find_best_yields`), Hyperliquid perp data (use `hyperliquid_get_market_data`).

## Example agent prompts

- "Browse active prediction markets or find betting odds on real-world events"
- "Detailed odds, probabilities, and trading data for a specific prediction market"
- "See what prediction markets are trending right now"

## Payment

- Protocol: [x402](https://x402.org) -- HTTP-native pay-per-call, no signup, no API key
- Network: Base L2 (`eip155:8453`)
- Asset: USDC
- Facilitator: Coinbase CDP (primary), PayAI (fallback)
- Also reachable via [ATXP](https://atxp.ai) (OAuth-wrapped x402, RFC 9728 protected-resource metadata)

## Part of klymax402

100 x402 micropayment APIs for AI agents -- one wallet, USDC on Base, zero signup.

- Catalog: https://klymax402.com/llms.txt
- Full API reference: https://klymax402.com/llms-full.txt
- Live stats: https://klymax402.com/stats

## License

MIT
