---
title: "Docker Self-Hosting"
description: "Run OpenSEO locally with Docker Compose using a local build by default."
---

Run OpenSEO locally with Docker.

In Docker mode, OpenSEO uses `AUTH_MODE=local_noauth` (no auth checks, local admin user `admin@localhost`). Only expose it behind your own auth-protected reverse proxy, tunnel, or private network. For internet-facing self-hosting, use [Cloudflare](/docs/self-hosting/cloudflare) instead.

The default `compose.yaml` builds this checkout as `open-seo:local` whenever
you run `docker compose up`, so it never pulls the upstream image.

## Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (or Docker Engine + Docker Compose)
- A [DataForSEO API key](/docs/self-hosting#dataforseo-api-key-setup)

## Quickstart

Clone the repo, then:

```bash
git clone https://github.com/every-app/open-seo.git
cd open-seo
cp .env.example .env
```

Set `DATAFORSEO_API_KEY` in `.env` using the [DataForSEO setup guide](/docs/self-hosting#dataforseo-api-key-setup), then start OpenSEO:

```bash
docker compose up -d
```

Open `http://localhost:<PORT>` (default `3001`). Each container start builds the app and may take 1-2 minutes; follow progress with `docker compose logs -f`.

Optional env values:

- `PORT` (defaults to `3001`)
- `ALLOWED_HOST` (single reverse-proxy hostname to allow in Vite preview)
- `AUTH_MODE=local_noauth` (already set in compose)
- `OPEN_SEO_IMAGE` (defaults to `open-seo:local`)
- `OPEN_SEO_PULL_POLICY` (defaults to `build`)

If you are putting Docker behind a reverse proxy or a temporary tunnel, remember that Docker self-hosting runs with app auth disabled. Only expose it behind your own auth-protected reverse proxy, tunnel, or private network, and add the public hostname before restarting:

```bash
ALLOWED_HOST=yourdomain.com docker compose up -d
```

You can also persist it in `.env`.

## Telemetry

OpenSEO collects anonymized telemetry for core usage events: heartbeats with aggregate counts (installs, users, projects, feature usage) tied to a random install ID, sent every 5 minutes during the first two hours after install, then at most once daily. Telemetry also includes failed setup check names and statuses, never values or error messages. No URLs, keywords, prompts, emails, or IP-derived location are collected, and idle installs send nothing.

To disable it, set `OPENSEO_TELEMETRY_DISABLED=1` (or `DO_NOT_TRACK=1`) in `.env`, then run `docker compose up -d --force-recreate open-seo`.

## Run a prebuilt private image

To use a private Docker Hub or registry image instead of building this
checkout, set both values in `.env` and restart:

```bash
OPEN_SEO_IMAGE=your-registry/open-seo:v1.2.3
OPEN_SEO_PULL_POLICY=missing
docker compose up -d
```

## Common commands

Restart service after env changes:

```bash
docker compose up -d open-seo
```

Pull a configured prebuilt image and restart:

```bash
docker compose pull && docker compose up -d
```

Stop:

```bash
docker compose down
```

## Health and troubleshooting

Startup checks appear in `docker compose logs` before the build. Once running, `/api/health` reports configuration and database status, and `docker compose ps` reports container health.

## Troubleshooting environment variables

To confirm Docker Compose is using the expected environment variables:

```bash
docker compose config
```

Check that `AUTH_MODE=local_noauth`, and that `DATAFORSEO_API_KEY` is the base64 encoded value of your DataForSEO email and API password in this format: `email:password`.

If you changed `.env`, recreate the container so Compose reapplies it:

```bash
docker compose up -d --force-recreate open-seo
```
