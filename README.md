# CitySense

CitySense is a city-signal recommendation demo for the hackathon. The P0 path is a Next.js App Router workspace with a recommendation API, mock source adapters, AMap-ready traffic hooks, and Prisma models for Supabase Postgres.

## Run

```bash
pnpm install
pnpm dev
```

## Core Routes

- `POST /api/recommend` returns three executable city routes.
- `POST /api/feedback` records lightweight feedback events.
- `POST /api/ingest/run` triggers source adapter ingestion stubs.
- `GET /api/ingest/status` reports connector readiness.
- `POST /api/amap/route` estimates or fetches route ETA.

## Architecture

The realtime recommendation path does not crawl external platforms. Source adapters and workers gather city signals ahead of time; the recommendation API reads normalized candidates and calls traffic only for the short list.
