# YellowTips API

> Context APIs for AI agents in LATAM & Spain.

A set of production-ready endpoints that give AI agents verified context about legal, tax, privacy and shipping rules in Latin America and Spain — so they don't hallucinate, cite dead law, or invent regulations.

**Live API:** https://api.yellowtips.com

---

## Endpoints

### `GET /health`

Returns the service status.

```bash
curl https://api.yellowtips.com/health
```

Response:
```json
{"status":"success","data":{"service":"yellowtips-api","version":"0.1.0"}}
```

---

### `POST /v1/legal/verify-citation`

Verifies a legal citation in three layers: **existence**, **relevance** and **temporality** (dead law detection).

**Headers:**
- `X-API-Key: yt_live_...` (required)
- `Content-Type: application/json`

**Body:**
```json
{
  "citation": "Sentencia C-1234 de 2014",
  "jurisdiction": "CO",
  "proposition": "derecho de retracto en compras online"
}
```

**Supported jurisdictions:** `MX`, `CO`, `AR`, `CL`, `PE`, `ES`

**Response (success):**
```json
{
  "status": "success",
  "data": {
    "citation": "Sentencia C-1234 de 2014",
    "jurisdiction": "CO",
    "existence_check": "confirmed",
    "relevance_check": "confirmed",
    "temporality_check": "dead_law",
    "overall_confidence": "low",
    "note": "Citation exists but was repealed by Sentencia C-567 de 2019."
  }
}
```

**Response (missing fields):**
```json
{
  "status": "error",
  "error": {
    "code": "E400",
    "message": "missing_required_fields",
    "fields": ["citation"]
  }
}
```

**Response (invalid API key):**
```json
{
  "status": "error",
  "error": { "code": "E401", "message": "invalid_api_key" }
}
```

---

## Error codes

| Code | Meaning |
| :--- | :--- |
| `E400` | Missing or invalid request fields |
| `E401` | Invalid or missing API key |
| `E404` | Endpoint not found |
| `E500` | Invalid JSON body |

---

## Pricing

| Plan | Price | Calls/month |
| :--- | :--- | :--- |
| **Free** | $0 | 100 |
| **Starter** | $19 | 1,000 |
| **Pro** | $49 | 5,000 |

Get an API key at [yellowtips.com](https://yellowtips.com).

---

## Local development

```bash
npm install -g wrangler
wrangler login
npx wrangler dev
```

Deploy:
```bash
npx wrangler deploy
```

---

## Stack

- **Runtime:** Cloudflare Workers
- **Language:** TypeScript
- **Deployment:** Wrangler CLI

---

## License

MIT — see [LICENSE](LICENSE).

---

🔗 **Part of the [LATAM AI Context Ecosystem](https://github.com/ProcontextMax)** — open context layers for AI agents in LATAM & Spain.