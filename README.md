# STUDIO.FP

FinPilot-style market dashboard for stocks, crypto, portfolio tracking, and AI-assisted analysis.

## Run Locally

**Prerequisites:** Node.js 20+

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env`
3. Add optional server-side keys:
   - `NVIDIA_API_KEY` enables AI chat/reviews through NVIDIA NIM.
   - `NVIDIA_MODEL` defaults to `meta/llama-3.3-70b-instruct`.
   - `FINNHUB_API_KEY` or `ALPHA_VANTAGE_API_KEY` enables US stock quotes.
   - `COINGECKO_API_KEY` enables CoinGecko Demo API auth for crypto quotes.
     If empty, crypto quotes use CoinGecko's public simple-price endpoint by default.
4. Run the app: `npm run dev`

## Market Data

The browser calls the local backend at `/api/market-data`. Provider keys stay in `server.ts` and never ship to the client bundle.
Fetched market data is persisted in a local SQLite database at `data/finpilot-market.sqlite` by default.

Current data behavior:

- Crypto: live CoinGecko quotes for supported symbols such as `BTC` and `ETH`.
- US stocks: live quotes/metadata when `FINNHUB_API_KEY` or `ALPHA_VANTAGE_API_KEY` is set.
- Vietnam stocks: hidden by default while the app focuses on US stocks and crypto.
- `MARKET_VISIBLE_CATEGORIES` controls which categories are exposed by `/api/market-data`.
- SQLite fallback: the app keeps the last successful API snapshot instead of dropping back to hard-coded runtime data.

Run checks before shipping:

```bash
npm run lint
npm run build
```
