# Prediction Markets API

Real-time prediction market odds and probabilities from Polymarket. Browse active markets, get detailed odds on specific events, and discover trending bets -- all via x402 micropayments.

## What It Does / Endpoints

| Endpoint | Price | Description |
|----------|-------|-------------|
| `POST /api/markets` | $0.005 | List active prediction markets with odds, volume, categories |
| `POST /api/odds` | $0.005 | Detailed odds for a specific market (by ID or search query) |
| `POST /api/trending` | $0.003 | Top trending markets ranked by 24h volume |

## Example Request / Response

### List Markets

```bash
curl -X POST https://prediction-markets-production.up.railway.app/api/markets \
  -H "Content-Type: application/json" \
  -d '{"category": "politics", "limit": 5, "sort": "volume"}'
```

```json
{
  "markets": [
    {
      "id": "0x1234...",
      "question": "Will Trump win the 2028 presidential election?",
      "outcomes": ["Yes", "No"],
      "outcomePrices": { "Yes": 0.42, "No": 0.58 },
      "volume": 15420000,
      "volume24h": 234000,
      "liquidity": 890000,
      "endDate": "2028-11-06T00:00:00Z",
      "category": "politics",
      "active": true
    }
  ],
  "count": 5,
  "sort": "volume",
  "category": "politics",
  "source": "polymarket"
}
```

### Get Odds (Search by Query)

```bash
curl -X POST https://prediction-markets-production.up.railway.app/api/odds \
  -H "Content-Type: application/json" \
  -d '{"query": "bitcoin 100k"}'
```

```json
{
  "id": "0xabcd...",
  "question": "Will Bitcoin reach $100k by December 2026?",
  "outcomes": ["Yes", "No"],
  "outcomePrices": { "Yes": 0.65, "No": 0.35 },
  "volume": 8900000,
  "volume24h": 120000,
  "liquidity": 450000,
  "endDate": "2026-12-31T00:00:00Z",
  "category": "crypto",
  "active": true,
  "source": "polymarket"
}
```

### Trending Markets

```bash
curl -X POST https://prediction-markets-production.up.railway.app/api/trending \
  -H "Content-Type: application/json" \
  -d '{"limit": 5}'
```

```json
{
  "trending": [
    {
      "id": "0x5678...",
      "question": "Will the Fed cut rates in July 2026?",
      "probability": 0.73,
      "outcomePrices": { "Yes": 0.73, "No": 0.27 },
      "volume24h": 890000,
      "totalVolume": 12500000,
      "category": "politics",
      "endDate": "2026-07-31T00:00:00Z",
      "active": true
    }
  ],
  "count": 5,
  "source": "polymarket"
}
```

## Use Cases

- **Election odds**: Get real-time probabilities on political outcomes backed by real money
- **Crypto predictions**: Check market consensus on price targets, ETF approvals, protocol upgrades
- **Event forecasting**: Find the crowd-sourced probability of any major world event
- **Research & analysis**: Use prediction market data as a signal for decision-making
- **News impact**: See how breaking events shift market probabilities in real time

## MCP Integration

Add to your Claude Desktop or Cursor MCP config:

```json
{
  "mcpServers": {
    "prediction-markets": {
      "url": "https://prediction-markets-production.up.railway.app/sse"
    }
  }
}
```

Tools available via MCP:
- `prediction_list_markets` -- Browse active markets by category and sort
- `prediction_get_market_odds` -- Get detailed odds by market ID or search query
- `prediction_trending_markets` -- Discover trending markets by volume

## Payment

All endpoints are gated by x402 micropayments (USDC on Base L2). Agents pay automatically per call -- no API keys, no subscriptions.

## Related APIs

- [Trust Score API](https://github.com/Br0ski777/trust-score-x402) -- Verify domain/wallet trust before interacting
- [Token Price API](https://github.com/Br0ski777/token-price-x402) -- Real-time crypto token prices
- [Crypto News API](https://github.com/Br0ski777/crypto-news-x402) -- Latest crypto news and sentiment
- [DeFi Yields API](https://github.com/Br0ski777/defi-yields-x402) -- Best DeFi yield opportunities
- [Hyperliquid API](https://github.com/Br0ski777/hyperliquid-x402) -- Perpetual futures market data
