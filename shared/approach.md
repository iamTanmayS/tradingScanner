I first learned how cryptocurrencies work, what a scanner does, and how the rules used by a scanner work.

After that, I researched different APIs that could provide the data I needed for the project. My main considerations were performance, WebSocket support for real-time updates, and the availability of historical data for building analytical charts.

Once I had gathered enough information, I created a detailed prompt using my research and requirements to develop the initial project plan. I then reviewed the plan, questioned the proposed decisions, did more research wherever needed, and improved it based on my own reasoning.

After I was satisfied with the plan, I designed the project architecture. I decided the scope of the application, identified the must-have features, determined which applications and components were needed, and worked out how they would interact.

Before starting the actual implementation, I made sure I understood the architecture and the reasoning behind its major decisions.

Testing the Binance API
Before building the application around Binance, I smoke-tested its APIs in both the browser and Node.js.

On the server side, I tested REST endpoints on two Binance hosts to inspect the historical candlestick data, response times, and returned fields. I also tested the !miniTicker@arr WebSocket stream to understand its payload structure, available market data, and update behavior.

I performed similar tests in the browser to check direct REST connectivity, investigate CORS restrictions, and verify WebSocket connectivity. I also inspected event timestamps and considered whether historical chart data would need to be fetched through the backend.

One important finding from the WebSocket investigation was that the backend should merge incoming market updates into its existing cache rather than replace the entire cache with each message.

After examining these results, I used the findings to inform the architecture and understand the practical constraints of integrating Binance before proceeding further with implementation.

Phase 2: Shared Core & Indicator Logic
Instead of building backend or UI directly, I started by creating a dedicated shared/ package. The idea was to keep all common TypeScript types and technical indicator math isolated, reusable, and thoroughly tested before hooking them up to any live systems.

I defined the required behavior for three technical indicators using hourly candles (1h) and used AI assistance to help implement the calculations. I selected the formulas and data semantics, reviewed the implementation, and checked it against the expected mathematical behavior:

Wilder's RSI-14: Implemented the standard initial simple average seeding followed by Wilder's recursive smoothing. I also designed an efficient $O(1)$ provisional RSI function so incoming live ticks update the displayed RSI without mutating the committed baseline of the closed candle.

SMA-20: A clean arithmetic mean over the last 20 closing prices.

Volume Spike-20 Ratio: Compares current candle volume to the average of the previous 20 completed candles. I ensured that all candles consistently use quote asset volume (USDT) to avoid mixing units.

I used AI assistance to draft and expand unit tests, then reviewed the cases and results against the specified behavior. The tests cover regular calculations, empty or insufficient data, edge cases such as flat markets and zero denominators, input immutability, and boundary validations. I also documented that the RSI reference test validates against textbook mathematical ground truth rather than claiming a live TradingView match. The shared package passed strict TypeScript checks and 86 tests.

Phase 3: Backend Ingestion & Real-Time Pipeline
For the backend, my priority was building a working end-to-end pipeline for the demo without getting slowed down by over-engineering.

Universe Filtering: On startup, the backend queries Binance exchange metadata, includes active pairs with quoteAsset === "USDT", and filters out stablecoin base assets (USDC, FDUSD, etc.) using a dedicated exclusion list.

Prioritized Seeding: Instead of wasting rate limits requesting candles for 350+ coins, the backend ranks eligible coins by 24-hour quote volume and seeds historical 1h candles only for the top 50 coins. This gives reliable RSI, SMA, and volume baseline data for the most liquid markets while leaving unseeded coins safely marked with undefined indicators.

Market Cache & Ingestion: It connects to Binance's !miniTicker@arr stream, safely merges incoming partial batches into an in-memory Map, validates numeric values, and calculates $O(1)$ provisional RSI on price changes.

WebSocket Broadcast: A local WebSocket server broadcasts a clean market_snapshot payload to connected clients once per second. The snapshot is serialized once per tick to avoid repeated overhead.

Candle Maintenance: Added a simple check that detects when a UTC hour closes and fetches the newly completed candle to update committed indicator baselines idempotently.

I used AI assistance to help draft and extend backend tests, then ran and reviewed the results for universe filtering, cache merging, indicator integration, and WebSocket behavior. The current backend test suite contains 60 tests, all passing. With the shared contracts and live backend working, the project was ready for the frontend.

Phase 4: Frontend Dashboard & Scanner Engine
With the backend streaming 1 Hz market snapshots, I built the client application in frontend/ using React 19, TypeScript, Vite, and Zustand.

Design System & Visual Discipline: Rather than a generic SaaS or neon-saturated look, I built a dark-first terminal instrument aesthetic with custom design tokens (tokens.css) using Instrument Sans and JetBrains Mono. All numbers use monospace tabular figures. Green/red is strictly reserved for price direction, while amber is dedicated to scanner alerts. Unavailable indicators display as an em dash (—), never as 0 or fake numbers.

State & Live Stream Pipeline: Designed a Zustand store that merges 1 Hz snapshot batches into a symbol map and precalculates derived auto-watchlists (Top Gainers, Top Losers, Highest Volume, RSI Extremes) once per tick. The WebSocket hook connects with exponential backoff and automatically resets scanner baselines on reconnect.

Pure Scanner Engine & Transition Tracker: Kept rule evaluation completely outside of React render cycles. The engine supports plain-language operators (>, >=, <, <=) and Match ALL / Match ANY combinators. To prevent alert fatigue and noise:

   - Silent Baseline: The initial snapshot populates current matches without firing an alert storm.

   - Exit Hysteresis: Requires 2 consecutive non-matching batches before a coin drops from active matches.

   - Re-entry Cooldown: Enforces a 10-second buffer before the same symbol can re-trigger an event.

   - Bounded Event Log: Records transitions only (not repeated per-tick matches) up to 50 entries.

Interactive Dashboard:
   - Main Market Table & Rule Monitoring Tabs: Virtualized with @tanstack/react-virtual to handle 500+ pairs at 60 FPS, with sortable columns (including SMA distance), live search, star pinning, and subtle CSS price-flash indicators. When viewing matches, it provides rule-specific live monitoring tabs—one independent tab for each enabled rule plus an "All Rules" overview with matched rule badges, live matching counts, and paused rule status.

   - Rule Builder: Modal with isolated local form state, dynamic condition rows (up to 6), preset templates, and live preview of how many coins match the proposed rule. Rules and starred symbols persist in localStorage with Zod validation.

   - Dedicated Coin Detail Page: Transitioning from a cramped side drawer to a full-screen analytical workspace with browser hash routing (#/BTCUSDT), 480px multi-pane chart (Lightweight Charts v5 with 200 candles + volume + RSI), 24h range slider, and the "Why this coin?" strategy analysis panel.

I used AI assistance to help draft and expand frontend tests, then ran the suite to verify formatting, scanner evaluations, per-rule membership, chart data fallbacks, and transition state lifecycles. The frontend suite contains 93 passing tests; strict typechecking and production builds also completed without errors.

Phase 5: Multi-Pane Analytical Charting & Network Resilience
To give traders immediate visual context when inspecting a coin, I integrated TradingView Lightweight Charts v5 into the dedicated coin detail page.

Three-Pane Synchronized Layout:
   - Pane 0 (Price Candlesticks): Displays 200 historical 1h OHLC candles plus real-time updates for the actively forming candle.

   - Pane 1 (Quote Volume): Color-coded histogram displaying quote-asset volume in USDT (field [7] from Binance klines) rather than base asset volume, guaranteeing consistent units across all pairs.

   - Pane 2 (Wilder's RSI-14): Independent pane with custom reference levels at 30 (oversold) and 70 (overbought) with bounded $0, 100$ scaling and transparent styling.

Dual-Path Data Pipeline & Proxy Fallback:
   - In browser environments, direct REST calls to Binance can be blocked by CORS or network firewalls. I designed the fallback behavior and used AI assistance during implementation of a resilient dual-path fetcher (fetchKlinesWithFallback): it attempts a direct browser fetch first and, upon failure, transparently falls back to the backend /api/klines proxy.

   - The backend proxy endpoint was mounted on the existing Node HTTP server alongside the WebSocket server. It validates symbols against a strict regex, whitelists intervals (1m, 5m, 15m, 1h, 4h, 1d), enforces limit bounds ($1 \le limit \le 1000$), applies a 10-second timeout, and attaches standard CORS headers without exposing arbitrary upstream URLs.

Live Candle Streaming & State Hygiene:
   - On opening a coin, the frontend subscribes to the coin's live 1h kline stream (<symbol>@kline_1h) via Binance WebSocket.

   - Incoming ticks update the currently forming candle without generating duplicate candles or advancing committed RSI history prematurely.

   - Switching symbols or closing the view cleanly tears down existing chart instances, removes ResizeObserver listeners, and unsubscribes from the WebSocket topic to prevent memory leaks and background network churn.

Phase 6: Universe-Wide Seeding, Rate-Limit Hardening & Independent Indicator Availability
Before freezing the system for demonstration, I audited indicator availability across the entire discovered universe (~501 active USDT spot pairs) to resolve why non-top-50 pairs initially displayed — for RSI, SMA, and Volume Ratio.

Root Cause Analysis:
   - The initial setup intentionally prioritized startup speed by clamping seedCoinLimit to 50 volume-ranked coins, leaving the remaining ~451 pairs unseeded.

   - Moreover, coins falling just outside the top 50 (such as AAVEUSDT at rank 51, AMPUSDT at 53, XLMUSDT at 54, ZROUSDT at 55, and DOTUSDT at 57) were completely omitted from seeding, and the hourly maintenance loop skipped unseeded coins, permanently locking them out of indicator calculations.

Binance Weight Limits & Pacing Defense:
   - By querying Binance REST endpoints and inspecting response headers (x-mbx-used-weight-1m), I confirmed that each GET /api/v3/klines request consumes 2 units of rate-limit weight (not 1).

   - High-throughput seeding at 15–20 requests/second would consume 30–40 weight/second (1,800–2,400 weight/minute), which risked hitting Binance's 1,200 weight/minute IP ceiling and triggering HTTP 429 bans.

   - I restructured the seeder into a cooperative 2-worker pool with a 120ms delay between requests (~5–6 requests/second, ~12 weight/second, ~720 weight/minute), comfortably operating at ~60% of Binance's ceiling.

   - Added active header defense: fetchKlinesWithRetry parses x-mbx-used-weight-1m on every response and pauses 2 seconds if consumed weight reaches 800/1200, allowing the 1-minute rolling bucket to decay. HTTP 429 responses honor the Retry-After header with a minimum 2.5-second backoff.

Independent Indicator Availability:
   - Previously, if a coin had fewer than 20 candles, the seeder skipped setting indicators entirely. I decoupled the indicator availability thresholds so each metric activates independently based on its own mathematical requirements:

     - RSI-14: Requires $\ge 15$ completed closes (14 deltas). A coin with 16 candles now displays RSI immediately.

     - SMA-20: Requires $\ge 20$ completed closes. Activates independently once 20 closes are accumulated.

     - Volume Ratio (20h): Requires $\ge 21$ completed candles (comparing the latest quote volume against the 20 preceding completed quote volumes).

   - In commitNewCandle, young coins incrementally accumulate history on each hourly close, naturally unlocking RSI at Hour 15, SMA at Hour 20, and Volume Ratio at Hour 21 without requiring manual restarts or losing existing state.

   - Missing indicator values are rendered honestly in the UI as — and reported as "waiting for indicator data" in strategy breakdowns, never coerced to 0 or causing rule errors.

Phase 7: Deployment, Hosting Issues & Production Validation
The local application was working, but deploying it exposed several environment and monorepo configuration issues. I used the deployment logs to separate build failures from runtime/API-access failures instead of treating them as one problem.

1. Render: Binance REST requests returned HTTP 418
The first Render deployment failed during startup while requesting Binance exchange information. The backend received HTTP 418 from data-api.binance.vision and the api1, api2, api3, and api.binance.com hosts.
Because exchange-info retrieval failed, the backend could not initialize the market universe and stopped before a successful market-data startup could be confirmed.
HTTP 418 can indicate an IP-level restriction or an automatic ban following rate-limit violations, but the response body and Retry-After header were not captured. Therefore, the exact cause on Render was not confirmed.
Rotating between hosts did not resolve the issue. The safer follow-up is to capture the response status, body, Retry-After, and x-mbx-used-weight-1m headers; respect any specified wait; and avoid repeated retries or host rotation when all hosts reject requests.
2. Railway: monorepo root and dependency installation
The initial Railway configuration used backend as the service root directory even though backend code imports TypeScript files from the sibling shared/ package. This meant the shared source was not reliably available in the build context.
After switching the service root to the repository root, Railway detected an npm workspace with three packages and ran the root build scripts.
The first root-level build attempt failed with tsc: not found. The logs showed only one package being audited, suggesting that the backend's compiler/dependencies were not available in that build environment. The production-dependency warning was a clue to inspect, not proof by itself of the cause.
A subsequent Railway build installed dependencies and successfully ran the backend TypeScript compilation step. Railway then created and pushed the container image. The earlier shared-module resolution errors were not present in that successful build log.
The configured start command is node backend/dist/backend/src/index.js. The application subsequently started successfully.
3. Railway runtime: successful Binance connection, limited seeding
The successful runtime logs showed:

exchangeInfo returned 501 eligible USDT pairs.
The in-memory cache initialized for all 501 eligible symbols.
The backend listened on port 8080.
The !miniTicker@arr Binance WebSocket connected successfully.
Indicator seeding completed for the selected 50 coins, with 50/50 seeded, 0 failed.
However, the deployed runtime reported seedLimit=50. This is important: although the code work addressed universe-wide seeding and independent indicator availability, the current Railway runtime configuration was still seeding only the top 50 volume-ranked coins. The other eligible symbols can receive live mini-ticker prices, but their RSI, SMA-20, and volume-ratio history may remain unavailable until they are seeded or otherwise accumulate enough history. If the requirement is indicator coverage across the full universe, set SEED_COIN_LIMIT=0 only if the code explicitly interprets zero as “seed all symbols,” and keep the shared REST rate limiter in place.

4. Rate-limit safeguards and remaining uncertainty
During local seeding and hourly synchronization, Binance reported x-mbx-used-weight-1m values rising from roughly 802 to 976 out of 1,200. The seeder paused at its configured threshold, but usage continued to rise between checks.
These warnings showed that REST usage was approaching the configured safety threshold; they did not by themselves prove that an HTTP 429 or 418 occurred or explain the manual shutdown.
Seeding and hourly synchronization can overlap and may share the same IP-level rate-limit budget. The long-term safeguard is a shared REST request scheduler/budget across seeding, hourly sync, retries, and other Binance REST calls, rather than independent per-task pauses.
The later Railway startup and 50/50 seed completion demonstrate that Binance REST and WebSocket access worked from Railway at that time. They do not prove that the Render 418 cause was specifically an IP ban.
5. Public URL and endpoint checks
Railway's public domain was configured to target port 8080, matching the backend's startup log.
Opening the bare public domain in a browser returned “Endpoint not found.” This is not automatically a deployment failure: the backend is an API/WebSocket server, and a root / route may not exist.
Production verification should use routes actually defined by the application, such as its health or market API route if implemented, and should separately test the frontend's HTTP API requests and WebSocket connection. Do not assume a /health route exists unless it is defined in the code.
The frontend's production VITE_API_URL and VITE_WS_URL values must point to the generated Railway domain using https:// and wss://, respectively, where those variables are used by the application. Rebuild/redeploy the frontend after changing Vite environment variables.
6. Build warnings versus failures
npm warn config production Use --omit=dev instead was a configuration warning; the actionable failure at that stage was tsc: not found.
The npm audit report listed vulnerabilities, but those were not the direct cause of the TypeScript build failure. Avoid running npm audit fix --force blindly because it can introduce breaking dependency upgrades.
The esbuild install-script warning was also separate from the successful build shown in the later Railway logs. Review script approvals and dependency audit findings deliberately, rather than changing unrelated dependencies during deployment debugging.
Current deployment conclusion
The application has built and started successfully on Railway, retrieved the Binance market universe, connected to the live mini-ticker WebSocket, and seeded 50 selected coins. The main deployment issue that remains to be verified is whether the public frontend connects to the Railway backend correctly. If the original requirement expects indicators for all eligible symbols, the current runtime setting seedLimit=50 must also be reconciled with the intended universe-wide seeding behavior. Render's earlier HTTP 418 remains an environment-specific failure with an unconfirmed exact cause.

Current System Status & Verification

The application is thoroughly verified across all three workspaces:

shared/: 86 unit tests covering Wilder RSI, SMA, and quote-volume ratio math with textbook verification. AI assisted with implementation and test drafting; I defined the required formulas and behavior, reviewed the code, and validated the results.

backend/: 64 unit tests covering market cache, mini-ticker ingestion, universe discovery, rate-limit header tracking, independent indicator availability, HTTP klines proxy, demand-driven lifecycle management (on-demand Binance streaming & idle sleep shutdown), and live seeding of representative coins (BTCUSDT, ETHUSDT, AAVEUSDT, AMPUSDT, XLMUSDT, ZROUSDT, DOTUSDT). AI assisted with test drafting and debugging; I ran the tests and assessed the results against the requirements.

frontend/: 93 unit tests covering rule evaluation, strategy analysis, formatters, transition trackers, and chart fallback logic. AI assisted with test drafting and implementation support; I reviewed and ran the resulting checks.

Production Build: Clean TypeScript compilation and Vite production build with zero errors across the entire codebase (243 / 243 tests passing).

Demand-Driven Lifecycle Architecture:
To optimize hosting costs on free-tier platforms like Railway without continuous credit drain, the backend implements a demand-driven lifecycle manager:
- At container boot, only the lightweight HTTP & WebSocket listener starts, taking < 100ms.
- When the first frontend client connects, upstream Binance WebSocket ingestion, indicator seeding, and hourly maintenance start immediately.
- When the last client disconnects, a 60-second grace timer is initiated. If no client reconnects, all upstream sockets and timers are stopped.
- This allows Railway Serverless App Sleeping to scale the container down to 0 replicas during inactivity, keeping credit usage at $0.00 while idle.

AI Assistance & Engineering Ownership

AI was used transparently as a coding assistant in selected implementation tasks, particularly translating the specified technical-indicator behavior into code, drafting and expanding unit tests, exploring edge cases, and troubleshooting build/deployment problems. AI suggestions and generated code were treated as proposals to inspect and verify, not as authoritative results.

The core work that I owned was identifying the problem and requirements, researching and testing Binance data access, selecting the architecture and data flow, defining the indicator semantics and scanner behavior, deciding how the components should interact, investigating real rate-limit and deployment constraints, and deciding how to validate the system. I reviewed AI-assisted changes and used tests, TypeScript/build checks, API behavior, and deployment logs to validate or refine them.

This distinction is intentional: I am not claiming that every line of code or every test was written manually without AI. I am claiming ownership of the research, engineering decisions, integration, review, and validation of the resulting system.



