# STUDIO.FP

FinPilot-style market dashboard for stocks, crypto, portfolio tracking, and AI-assisted analysis.

## Run Locally

**Prerequisites:** Node.js 20+

1. Install dependencies: `npm install`
2. Copy `.env.example` to `.env`
3. Add optional server-side keys:
   - `GEMINI_API_KEY` enables AI chat/reviews.
   - `FINNHUB_API_KEY` or `ALPHA_VANTAGE_API_KEY` enables US stock quotes.
   - Crypto quotes use CoinGecko's public simple-price endpoint by default.
4. Run the app: `npm run dev`

## Market Data

The browser calls the local backend at `/api/market-data`. Provider keys stay in `server.ts` and never ship to the client bundle.

Current data behavior:

- Crypto: live CoinGecko quotes for supported symbols such as `BTC` and `ETH`.
- US stocks: live quotes when `FINNHUB_API_KEY` or `ALPHA_VANTAGE_API_KEY` is set.
- Vietnam stocks: static fallback until you connect a licensed Vietnam market-data vendor.
- Mock fallback: the app still works without provider keys.

Run checks before shipping:

```bash
npm run lint
npm run build
```
