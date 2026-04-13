import type { ApiConfig } from "./shared.ts";

export const API_CONFIG: ApiConfig = {
  name: "Prediction Markets API",
  slug: "prediction-markets",
  description: "Real-time prediction market odds from Polymarket. Active markets, probabilities, volume, categories. The betting intelligence layer agents need for event forecasting.",
  version: "1.0.0",
  routes: [
    {
      method: "POST",
      path: "/api/markets",
      price: "$0.005",
      description: "List active prediction markets with current odds, volume, and categories. Filter by topic and sort by volume, newest, or closing soon.",
      toolName: "prediction_list_markets",
      toolDescription:
        `Use this when you need to browse active prediction markets or find betting odds on real-world events. Returns a list of active markets from Polymarket with current probabilities, trading volume, and metadata.

1. question: the prediction market question (e.g. "Will Bitcoin reach $100k by December 2026?")
2. outcomePrices: probability for each outcome as decimal (0.65 = 65% chance YES)
3. volume: total trading volume in USD
4. liquidity: current available liquidity in USD
5. endDate: when the market resolves
6. category: topic category (politics, crypto, sports, science, culture)
7. active: whether the market is currently trading

Example output: { markets: [{ question: "Will Trump win 2028?", outcomePrices: { "Yes": 0.42, "No": 0.58 }, volume: 15420000, liquidity: 890000, endDate: "2028-11-06", category: "politics" }] }

Use this to gauge public consensus on future events. Essential for research, forecasting, and understanding market sentiment on any topic.

Do NOT use for crypto price data -- use token_get_price instead. Do NOT use for crypto news -- use crypto_get_news instead. Do NOT use for stock prices -- use stock_get_quote instead. Do NOT use for DeFi yields -- use defi_find_best_yields instead. Do NOT use for Hyperliquid perp data -- use hyperliquid_get_market_data instead.`,
      inputSchema: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: ["politics", "crypto", "sports", "science", "culture"],
            description: "Filter markets by topic category. Omit for all categories.",
          },
          limit: {
            type: "number",
            description: "Number of markets to return (1-50). Default: 20.",
          },
          sort: {
            type: "string",
            enum: ["volume", "newest", "closing_soon"],
            description: "Sort order. 'volume' = highest traded, 'newest' = recently created, 'closing_soon' = ending soonest. Default: volume.",
          },
        },
        required: [],
      },
    },
    {
      method: "POST",
      path: "/api/odds",
      price: "$0.005",
      description: "Get detailed odds and trading data for a specific prediction market by ID or search query.",
      toolName: "prediction_get_market_odds",
      toolDescription:
        `Use this when you need detailed odds, probabilities, and trading data for a specific prediction market. Search by market ID or by question text to find the exact market you need.

1. question: the full prediction market question text
2. outcomes: array of possible outcomes with their current probabilities
3. outcomePrices: decimal probabilities per outcome (0.72 = 72% implied probability)
4. volume: total all-time trading volume in USD
5. volume24h: trading volume in the last 24 hours
6. liquidity: current depth of the order book in USD
7. endDate: resolution date of the market
8. description: detailed market description and resolution criteria
9. active: whether the market is currently open for trading

Example output: { question: "Will ETH flip BTC by 2027?", outcomes: ["Yes", "No"], outcomePrices: { "Yes": 0.08, "No": 0.92 }, volume: 2340000, volume24h: 45000, liquidity: 120000, endDate: "2027-12-31", active: true }

Use this when a user asks about the probability of a specific event happening, election odds, or crypto predictions. Provides the crowd-sourced probability estimate backed by real money.

Do NOT use for crypto price data -- use token_get_price instead. Do NOT use for crypto news -- use crypto_get_news instead. Do NOT use for stock prices -- use stock_get_quote instead. Do NOT use for DeFi yields -- use defi_find_best_yields instead. Do NOT use for Hyperliquid perp data -- use hyperliquid_get_market_data instead.`,
      inputSchema: {
        type: "object",
        properties: {
          marketId: {
            type: "string",
            description: "Polymarket condition ID. Use this if you already know the market ID.",
          },
          query: {
            type: "string",
            description: "Search query to find a market by question text (e.g. 'bitcoin 100k', 'trump election'). Used when marketId is not known.",
          },
        },
        required: [],
      },
    },
    {
      method: "POST",
      path: "/api/trending",
      price: "$0.003",
      description: "Top trending prediction markets ranked by 24h volume and engagement.",
      toolName: "prediction_trending_markets",
      toolDescription:
        `Use this when you need to see what prediction markets are trending right now. Returns the hottest markets ranked by recent trading volume and activity.

1. question: the market question
2. probability: current implied probability for the leading outcome (decimal)
3. volume24h: trading volume in the last 24 hours in USD
4. totalVolume: all-time trading volume in USD
5. priceChange24h: change in probability over the last 24 hours (e.g. +0.05 = probability rose 5%)
6. category: topic category
7. endDate: when the market resolves

Example output: { trending: [{ question: "Will Fed cut rates in July 2026?", probability: 0.73, volume24h: 890000, totalVolume: 12500000, priceChange24h: 0.08, category: "politics", endDate: "2026-07-31" }] }

Use this to discover what events the market is most interested in right now. Great for finding breaking news impact, trending political events, or viral crypto bets.

Do NOT use for crypto price data -- use token_get_price instead. Do NOT use for crypto news -- use crypto_get_news instead. Do NOT use for stock prices -- use stock_get_quote instead. Do NOT use for DeFi yields -- use defi_find_best_yields instead. Do NOT use for Hyperliquid perp data -- use hyperliquid_get_market_data instead.`,
      inputSchema: {
        type: "object",
        properties: {
          limit: {
            type: "number",
            description: "Number of trending markets to return (1-30). Default: 10.",
          },
        },
        required: [],
      },
    },
  ],
};
