# Lax's Studio

<p align="center">
  <img src="public/favicon.svg" alt="Lax's Studio Logo" width="120" />
</p>

<h3 align="center">FinPilot AI - Precision Investing Terminal</h3>

<p align="center">
  Real-time market dashboard for US stocks, ETFs, crypto, portfolio tracking, and AI-assisted financial analysis.
</p>

<p align="center">
  <img alt="React" src="https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=111111" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=ffffff" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.8-3178C6?logo=typescript&logoColor=ffffff" />
  <img alt="Express" src="https://img.shields.io/badge/Express-4-111111?logo=express&logoColor=ffffff" />
  <img alt="NVIDIA NIM" src="https://img.shields.io/badge/NVIDIA%20NIM-AI-76B900?logo=nvidia&logoColor=ffffff" />
</p>

## Tổng Quan

**Lax's Studio** là một web app phân tích thị trường theo phong cách trading terminal: dữ liệu giá được lấy qua backend cục bộ, cache vào SQLite, hiển thị trên giao diện React hiện đại, sau đó kết hợp AI để tạo dự báo, phân tích rủi ro, tóm tắt tin tức và review danh mục.

Dự án tập trung vào ba luồng chính:

- Theo dõi thị trường với watchlist, top movers, ticker ribbon, tin tức và sentiment.
- Quản lý danh mục với P/L, allocation, lịch sử hiệu suất và xuất CSV.
- Phân tích AI với prediction center, scenario stack, signal drivers và chat streaming qua NVIDIA NIM.

> Lưu ý: nội dung AI và dữ liệu thị trường trong ứng dụng chỉ phục vụ mục đích tham khảo/kỹ thuật, không phải lời khuyên đầu tư.

## Tính Năng Nổi Bật

| Nhóm | Khả năng |
| --- | --- |
| Market Dashboard | Live market pulse, watchlist kéo-thả, top movers, latest news, AI brief cho từng mã |
| Market Analysis | Bộ lọc US/Crypto/ETFs, tìm kiếm mã, thêm tài sản mới, sparkline, provider coverage |
| Portfolio | Thêm/xóa giao dịch, tính tổng giá trị, day gain, ROI, allocation chart, CSV export |
| AI Prediction | Dự báo theo khung `1D`, `1W`, `1M`, `3M`, tín hiệu Bullish/Neutral/Bearish, confidence, support/resistance, scenario bull/base/bear |
| AI Copilot | Chat streaming, lưu lịch sử hội thoại, summary/technical/risk cards, quick follow-up |
| Data Layer | Server-side API proxy, SQLite cache, fallback snapshot, FX conversion, settings persistence |
| UX | Responsive layout, dark/light theme, notification center, floating AI assistant, motion transitions |

## Tech Stack

| Layer | Công nghệ |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, Tailwind CSS 4 |
| Charts/UI | Recharts, Lucide React, Motion |
| Backend | Express, TSX, Node.js |
| AI | NVIDIA NIM OpenAI-compatible API |
| Market Data | Finnhub hoặc Alpha Vantage cho stocks, CoinGecko cho crypto |
| News/Search | Tavily, Finnhub news fallback |
| Storage | SQLite file tại `data/finpilot-market.sqlite` |
| Build | Vite client build + esbuild server bundle |

## Kiến Trúc

```text
Browser (React/Vite)
  |
  | fetch /api/*
  v
Express server (server.ts)
  |
  |-- Market providers: Finnhub, Alpha Vantage, CoinGecko
  |-- AI provider: NVIDIA NIM
  |-- Search/news provider: Tavily
  |-- FX provider: public rates endpoint
  v
Local SQLite cache
```

Các API key được đọc trong `server.ts` và không được đưa vào client bundle. Frontend chỉ gọi backend nội bộ qua `/api/*`.

## Cấu Trúc Thư Mục

```text
.
├── src/
│   ├── components/          # Dashboard, Portfolio, Market, AI Insights, modals
│   ├── App.tsx              # App shell, routing theo tab, global state
│   ├── SettingsContext.tsx  # Theme, currency, language/settings persistence
│   ├── currency.ts          # Chuyển đổi và format tiền tệ
│   └── types.ts             # Shared TypeScript models
├── public/
│   └── favicon.svg
├── data/                    # SQLite runtime cache
├── server.ts                # Express API, providers, persistence, AI proxy
├── vite.config.ts
├── package.json
└── README.md
```

## Yêu Cầu

- Node.js `22+` khuyến nghị, vì backend dùng `node:sqlite`
- npm `10+` hoặc phiên bản đi kèm Node.js 22
- API key tùy chọn nếu muốn bật đầy đủ dữ liệu live/AI

## Cài Đặt Nhanh

1. Cài dependencies:

```bash
npm install
```

2. Tạo file môi trường:

```powershell
# Windows PowerShell
Copy-Item .env.example .env
```

```bash
# macOS/Linux
cp .env.example .env
```

3. Điền API key cần dùng trong `.env`.

4. Chạy dev server:

```bash
npm run dev
```

Mặc định server chạy tại:

```text
http://localhost:3000
```

## Biến Môi Trường

| Biến | Bắt buộc | Mô tả |
| --- | --- | --- |
| `NVIDIA_API_KEY` | Không | Bật AI chat, prediction, review và tóm tắt qua NVIDIA NIM |
| `NVIDIA_BASE_URL` | Không | OpenAI-compatible endpoint, mặc định `https://integrate.api.nvidia.com/v1` |
| `NVIDIA_MODEL` | Không | Model AI, mặc định `meta/llama-3.3-70b-instruct` |
| `FINNHUB_API_KEY` | Không | Provider ưu tiên cho US stock quotes/news/search |
| `ALPHA_VANTAGE_API_KEY` | Không | Provider stock quotes/search khi không dùng Finnhub |
| `COINGECKO_API_KEY` | Không | CoinGecko Demo API key cho crypto quotes |
| `TAVILY_API_KEY` | Không | Web/news search phục vụ market news và sentiment |
| `MARKET_DB_PATH` | Không | Đường dẫn SQLite cache, mặc định `data/finpilot-market.sqlite` |
| `MARKET_VISIBLE_CATEGORIES` | Không | Nhóm tài sản hiển thị, mặc định `US,Crypto,ETFs` |
| `MARKET_CACHE_TTL_MS` | Không | TTL cache dữ liệu thị trường, mặc định `60000` |
| `MARKET_REQUEST_TIMEOUT_MS` | Không | Timeout gọi provider, mặc định `8000` |
| `APP_URL` | Không | URL deploy/self-reference khi chạy trên môi trường hosted |

Ứng dụng vẫn có thể khởi động khi thiếu một số key, nhưng các tính năng liên quan sẽ dùng cache, fallback hoặc trả thông báo cấu hình.

## Scripts

| Lệnh | Mục đích |
| --- | --- |
| `npm run dev` | Chạy Express + Vite dev server bằng `tsx server.ts` |
| `npm run lint` | Type-check bằng `tsc --noEmit` |
| `npm run build` | Build client bằng Vite và bundle server bằng esbuild |
| `npm start` | Chạy bản production tại `dist/server.cjs` |
| `npm run clean` | Xóa output build cũ |

## API Nội Bộ

| Endpoint | Chức năng |
| --- | --- |
| `GET /api/market-data` | Lấy danh sách tài sản, giá, trạng thái provider và cache |
| `GET /api/market-db/status` | Kiểm tra trạng thái SQLite cache |
| `GET /api/assets/search?q=` | Tìm ticker từ provider |
| `POST /api/assets/add` | Thêm/sync tài sản vào universe |
| `GET /api/news` | Lấy tin tức thị trường |
| `GET /api/market-sentiment` | Tổng hợp sentiment thị trường |
| `POST /api/prediction` | Tạo AI prediction cho symbol/horizon |
| `POST /api/chat/stream` | Chat AI dạng streaming SSE |
| `POST /api/summarize-news` | Tóm tắt tin hoặc ticker bằng AI |
| `POST /api/macro-analysis` | Sinh macro/sector analysis |
| `GET/POST /api/portfolio` | Đọc và thêm holding |
| `DELETE /api/portfolio/:id` | Xóa holding |
| `GET/POST /api/watchlist` | Đọc và thêm watchlist item |
| `DELETE /api/watchlist/:symbol` | Xóa symbol khỏi watchlist |
| `POST /api/watchlist/reorder` | Lưu thứ tự watchlist |
| `GET /api/fx/rates` | Lấy tỷ giá hiển thị |
| `GET/POST /api/settings` | Đọc/lưu theme, currency, pinned symbols |
| `GET/POST /api/chat/history` | Đọc/lưu lịch sử chat |
| `GET/POST/DELETE /api/alerts` | Quản lý cảnh báo |

## Dữ Liệu Và Cache

- Stocks ưu tiên Finnhub nếu `FINNHUB_API_KEY` tồn tại.
- Nếu không có Finnhub, app thử Alpha Vantage khi có `ALPHA_VANTAGE_API_KEY`.
- Crypto dùng CoinGecko; nếu không có key, app dùng public endpoint với độ ổn định thấp hơn.
- Snapshot thành công gần nhất được lưu trong SQLite để hạn chế màn hình rỗng khi provider lỗi.
- `MARKET_VISIBLE_CATEGORIES` kiểm soát nhóm tài sản được trả về cho frontend.

## Build Production

```bash
npm run build
npm start
```

Output production nằm trong `dist/`:

- Client assets do Vite build.
- Server bundle nằm tại `dist/server.cjs`.

## Kiểm Tra Trước Khi Ship

```bash
npm run lint
npm run build
```

## Troubleshooting

| Vấn đề | Cách xử lý |
| --- | --- |
| AI không phản hồi | Kiểm tra `NVIDIA_API_KEY`, `NVIDIA_BASE_URL`, `NVIDIA_MODEL` và restart server |
| Stock quote không live | Thêm `FINNHUB_API_KEY` hoặc `ALPHA_VANTAGE_API_KEY` |
| Crypto quote chập chờn | Thêm `COINGECKO_API_KEY` để giảm giới hạn public endpoint |
| API trả HTML thay vì JSON | Restart dev server để Express nạp route mới |
| Dữ liệu thị trường cũ | Gọi refresh trên UI hoặc dùng `/api/market-data?force=true` |
| SQLite không ghi được | Kiểm tra quyền ghi thư mục `data/` và `MARKET_DB_PATH` |

## Ghi Chú Bảo Mật

- Không đặt API key vào biến `VITE_*` hoặc bất kỳ file frontend nào.
- Không commit `.env`.
- Provider keys chỉ nên tồn tại ở server runtime.
- Dữ liệu AI nên được kiểm chứng lại với nguồn live trước khi ra quyết định tài chính.

## License

Dự án hiện chưa khai báo license công khai. Nếu dùng cho sản phẩm hoặc chia sẻ ra ngoài, hãy bổ sung license phù hợp trước khi phát hành.
