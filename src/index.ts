export interface Env {
  API_KEY_PREFIX: string;
  API_KEYS: KVNamespace;
  DB: D1Database;
  PADDLE_WEBHOOK_SECRET: string;
}

const PLAN_LIMITS: Record<string, number> = {
  free: 100,
  starter: 1000,
  pro: 5000,
};

function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-API-Key",
    },
  });
}

function normalizeCitation(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, " ");
  const match = cleaned.match(
    /([CTSU]|1A\.?\/J\.?|2A\.?\/J\.?)[\s\-\/]+(\d+)[\s\-\/]+(?:(?:DE)\s+)?(\d{4})/
  );
  if (match) {
    const type = match[1].replace(/[.\/]/g, "").trim();
    return `${type}-${match[2]}-${match[3]}`;
  }
  return cleaned;
}

function checkRelevance(proposition: string | null, citationText: string, notes: string): string {
  if (!proposition) return "not_provided";
  const words = proposition.toLowerCase().split(/\s+/).filter(w => w.length > 4);
  if (words.length === 0) return "unverified";
  const haystack = `${citationText} ${notes}`.toLowerCase();
  const matches = words.filter(w => haystack.includes(w));
  if (matches.length === 0) return "unverified";
  if (matches.length >= words.length / 2) return "likely_relevant";
  return "partially_relevant";
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return jsonResponse({ status: "ok" });
    }

    // --- 1. HEALTH CHECK ---
    if (url.pathname === "/health" && request.method === "GET") {
      return jsonResponse({
        status: "success",
        data: { service: "yellowtips-api", version: "0.3.0" },
      });
    }

    // --- 2. WEBHOOK DE PADDLE ---
    if (url.pathname === "/v1/webhooks/paddle" && request.method === "POST") {
      const signature = request.headers.get("Paddle-Signature");
      if (!signature) return jsonResponse({ error: "No signature" }, 401);

      const rawBody = await request.text();

      // Verificar firma de Paddle (HMAC SHA256)
      const parts = signature.split(";");
      const ts = parts.find(p => p.startsWith("ts="))?.split("=")[1];
      const h1 = parts.find(p => p.startsWith("h1="))?.split("=")[1];
      
      if (!ts || !h1) return jsonResponse({ error: "Invalid signature format" }, 401);

      const key = await crypto.subtle.importKey(
        "raw", new TextEncoder().encode(env.PADDLE_WEBHOOK_SECRET),
        { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
      );
      const signatureBuffer = await crypto.subtle.sign(
        "HMAC", key, new TextEncoder().encode(`${ts}:${rawBody}`)
      );
      const hashHex = Array.from(new Uint8Array(signatureBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');
      
      if (hashHex !== h1) return jsonResponse({ error: "Invalid signature" }, 401);

      // Procesar el evento
      const event = JSON.parse(rawBody);
      
      if (event.event_type === "transaction.completed") {
        const data = event.data;
        const customerId = data.customer_id;
        const email = data.customer?.email || "unknown@email.com";
        
        // Determinar el plan basado en el price_id
        let plan = "starter";
        const priceId = data.items?.[0]?.price?.id;
        
        // IMPORTANTE: Pon aquí los IDs completos de Paddle
        if (priceId === "pri_01m5nnspwenrdkxn9tpab41p99") { // Reemplaza con tu ID completo si es necesario
          plan = "pro";
        } else if (priceId === "pri_01m5nnww9bxsdwr7a2skse733g") { // Reemplaza con tu ID completo si es necesario
          plan = "starter";
        }

        // Generar API key
        const newApiKey = "yt_live_" + Array.from(crypto.getRandomValues(new Uint8Array(24))).map(b => b.toString(16).padStart(2, '0')).join('');
        
        // Guardar en KV
        const metadata = JSON.stringify({ plan, email, customer_id: customerId, created_at: new Date().toISOString() });
        await env.API_KEYS.put(newApiKey, metadata);

        console.log(`✅ Pago completado. API Key generada para ${email}: ${newApiKey}`);
        // TODO: Aquí conectar un servicio de email para enviar la llave al cliente.
      }

      // Paddle requiere un 2xx en menos de 5 segundos
      return jsonResponse({ status: "received" });
    }

    // --- 3. VERIFICACIÓN LEGAL (CON CONTROL DE CUOTAS) ---
    if (url.pathname === "/v1/legal/verify-citation" && request.method === "POST") {
      // Autenticación
      const apiKey = request.headers.get("X-API-Key");
      if (!apiKey || !apiKey.startsWith(env.API_KEY_PREFIX)) {
        return jsonResponse({ status: "error", error: { code: "E401", message: "invalid_api_key" } }, 401);
      }

      const keyData = await env.API_KEYS.get(apiKey);
      if (!keyData) {
        return jsonResponse({ status: "error", error: { code: "E401", message: "invalid_api_key" } }, 401);
      }

      let meta: any = {};
      try { meta = JSON.parse(keyData); } catch { meta = { plan: "unknown" }; }

      // --- CONTROL DE CUOTAS ---
      const plan = meta.plan || "free";
      const monthlyLimit = PLAN_LIMITS[plan] ?? 100;

      const now = new Date();
      const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      const counterKey = `usage:${apiKey}:${monthKey}`;

      const currentUsageStr = await env.API_KEYS.get(counterKey);
      const currentUsage = currentUsageStr ? parseInt(currentUsageStr, 10) : 0;

      if (currentUsage >= monthlyLimit) {
        return jsonResponse({
          status: "error",
          error: {
            code: "E429",
            message: "quota_exceeded",
            limit: monthlyLimit,
            plan: plan,
            hint: "Upgrade your plan or wait until next month.",
          },
        }, 429);
      }

      await env.API_KEYS.put(counterKey, String(currentUsage + 1), { expirationTtl: 60 * 60 * 24 * 60 });
      // --- FIN CONTROL DE CUOTAS ---

      // Parseo del body
      let body: any;
      try { body = await request.json(); } catch {
        return jsonResponse({ status: "error", error: { code: "E500", message: "invalid_json_body" } }, 400);
      }

      const { citation, jurisdiction, proposition } = body || {};

      if (!citation || !jurisdiction) {
        const missing = [];
        if (!citation) missing.push("citation");
        if (!jurisdiction) missing.push("jurisdiction");
        return jsonResponse({ status: "error", error: { code: "E400", message: "missing_required_fields", fields: missing } }, 400);
      }

      const validJurisdictions = ["MX", "CO", "AR", "CL", "PE", "ES"];
      if (!validJurisdictions.includes(jurisdiction)) {
        return jsonResponse({ status: "error", error: { code: "E400", message: "invalid_jurisdiction", supported: validJurisdictions } }, 400);
      }

      // Consulta a D1
      const normalizedId = normalizeCitation(citation);
      const result = await env.DB.prepare(
        "SELECT citation_id, citation_text, court, year, status, superseded_by, notes FROM citations WHERE jurisdiction = ? AND (citation_id = ? OR citation_id = ?)"
      ).bind(jurisdiction, citation, normalizedId).first();

      if (!result) {
        return jsonResponse({
          status: "partial",
          data: {
            citation, jurisdiction,
            existence_check: "not_found",
            relevance_check: "not_applicable",
            temporality_check: "unknown",
            overall_confidence: "low",
            error: { code: "E_CITATION_NOT_FOUND", message: "Citation not found in our database." },
            plan: meta.plan || "unknown",
            timestamp: new Date().toISOString(),
          },
        });
      }

      const dbStatus = result.status as string;
      let existence_check = "confirmed";
      let temporality_check = "valid";
      let overall_confidence = "high";

      if (dbStatus === "dead_law") {
        temporality_check = "dead_law";
        overall_confidence = "low";
      } else if (dbStatus === "fabricated") {
        existence_check = "fabricated";
        temporality_check = "not_applicable";
        overall_confidence = "none";
      }

      const relevance_check = checkRelevance(proposition || null, result.citation_text as string, (result.notes as string) || "");

      return jsonResponse({
        status: dbStatus === "fabricated" ? "error" : "success",
        data: {
          citation, jurisdiction,
          citation_id: result.citation_id,
          citation_text: result.citation_text,
          court: result.court,
          year: result.year,
          existence_check, relevance_check, temporality_check,
          superseded_by: result.superseded_by || null,
          overall_confidence,
          note: result.notes || null,
          plan: meta.plan || "unknown",
          timestamp: new Date().toISOString(),
        },
      });
    }
    // --- 4. BÚSQUEDA DE JURISPRUDENCIA (FTS5) ---
    if (url.pathname === "/v1/legal/search" && request.method === "GET") {
      // Auth
      const apiKey = request.headers.get("X-API-Key");
      if (!apiKey || !apiKey.startsWith(env.API_KEY_PREFIX)) {
        return jsonResponse({ status: "error", error: { code: "E401", message: "invalid_api_key" } }, 401);
      }
      const keyData = await env.API_KEYS.get(apiKey);
      if (!keyData) {
        return jsonResponse({ status: "error", error: { code: "E401", message: "invalid_api_key" } }, 401);
      }
      let meta: any = {};
      try { meta = JSON.parse(keyData); } catch { meta = { plan: "unknown" }; }

      // Cuota (mismo patrón que verify-citation)
      const plan = meta.plan || "free";
      const monthlyLimit = PLAN_LIMITS[plan] ?? 100;
      const now = new Date();
      const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      const counterKey = `usage:${apiKey}:${monthKey}`;
      const currentUsageStr = await env.API_KEYS.get(counterKey);
      const currentUsage = currentUsageStr ? parseInt(currentUsageStr, 10) : 0;
      if (currentUsage >= monthlyLimit) {
        return jsonResponse({
          status: "error",
          error: { code: "E429", message: "quota_exceeded", limit: monthlyLimit, plan, hint: "Upgrade your plan or wait until next month." },
        }, 429);
      }
      await env.API_KEYS.put(counterKey, String(currentUsage + 1), { expirationTtl: 60 * 60 * 24 * 60 });

      // Parámetros
      const q = (url.searchParams.get("q") || "").trim();
      const tipo = (url.searchParams.get("tipo") || "").trim().toUpperCase();
      const limitRaw = parseInt(url.searchParams.get("limit") || "10", 10);
      const limit = Math.min(Math.max(limitRaw || 10, 1), 20);

      if (!q) {
        return jsonResponse({ status: "error", error: { code: "E400", message: "missing_query_param", field: "q" } }, 400);
      }
      if (tipo && !["T", "C", "SU"].includes(tipo)) {
        return jsonResponse({ status: "error", error: { code: "E400", message: "invalid_tipo", supported: ["T", "C", "SU"] } }, 400);
      }

      // Sanear para FTS5: quitar operadores, dejar letras/números/espacios
      const cleaned = q.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim();
      if (!cleaned) {
        return jsonResponse({ status: "error", error: { code: "E400", message: "invalid_query", detail: "query has no searchable tokens" } }, 400);
      }
      const ftsQuery = cleaned.includes(" ") ? `"${cleaned}"` : cleaned;

      // Query FTS5
      let sql = `
        SELECT
          s.id, s.titulo, s.fecha, s.ponente, s.tipo, s.tipo_proceso, s.fuente_url,
          snippet(sentencias_fts, 2, '<mark>', '</mark>', '…', 20) AS snippet,
          bm25(sentencias_fts) AS rank
        FROM sentencias_fts
        JOIN sentencias s ON s.rowid = sentencias_fts.rowid
        WHERE sentencias_fts MATCH ?
      `;
      const bindings: any[] = [ftsQuery];
      if (tipo) { sql += " AND s.tipo = ?"; bindings.push(tipo); }
      sql += " ORDER BY rank LIMIT ?";
      bindings.push(limit);

      try {
        const stmt = env.DB.prepare(sql).bind(...bindings);
        const { results } = await stmt.all();
        return jsonResponse({
          status: "success",
          data: {
            query: q,
            fts_query: ftsQuery,
            tipo: tipo || null,
            limit,
            count: results?.length ?? 0,
            plan,
            results: results ?? [],
            timestamp: new Date().toISOString(),
          },
        });
      } catch (e: any) {
        return jsonResponse({
          status: "error",
          error: { code: "E500", message: "search_failed", detail: e?.message || String(e) },
        }, 500);
      }
    }
    
    // --- 3.5. LEGAL ARGUMENT (Capa 1: problema jurídico + ratio + decisión) ---
    if (url.pathname === "/v1/legal/argument" && request.method === "GET") {
      // Auth (idéntico a /v1/legal/search)
      const apiKey = request.headers.get("X-API-Key");
      if (!apiKey || !apiKey.startsWith(env.API_KEY_PREFIX)) {
        return jsonResponse({ status: "error", error: { code: "E401", message: "invalid_api_key" } }, 401);
      }
      const keyData = await env.API_KEYS.get(apiKey);
      if (!keyData) {
        return jsonResponse({ status: "error", error: { code: "E401", message: "invalid_api_key" } }, 401);
      }
      let meta: any = {};
      try { meta = JSON.parse(keyData); } catch { meta = { plan: "unknown" }; }

      // Cuota (mismo patrón que /v1/legal/search)
      const plan = meta.plan || "free";
      const monthlyLimit = PLAN_LIMITS[plan] ?? 100;
      const now = new Date();
      const monthKey = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
      const counterKey = `usage:${apiKey}:${monthKey}`;
      const currentUsageStr = await env.API_KEYS.get(counterKey);
      const currentUsage = currentUsageStr ? parseInt(currentUsageStr, 10) : 0;
      if (currentUsage >= monthlyLimit) {
        return jsonResponse({
          status: "error",
          error: { code: "E429", message: "quota_exceeded", limit: monthlyLimit, plan, hint: "Upgrade your plan or wait until next month." },
        }, 429);
      }
      await env.API_KEYS.put(counterKey, String(currentUsage + 1), { expirationTtl: 60 * 60 * 24 * 60 });

      // Parámetros
      const q = (url.searchParams.get("q") || "").trim();
      const sentido = (url.searchParams.get("sentido") || "").trim().toLowerCase();
      const derecho = (url.searchParams.get("derecho") || "").trim().toLowerCase();
      const limitRaw = parseInt(url.searchParams.get("limit") || "10", 10);
      const limit = Math.min(Math.max(limitRaw || 10, 1), 20);

      if (!q) {
        return jsonResponse({ status: "error", error: { code: "E400", message: "missing_query_param", field: "q" } }, 400);
      }
      const validSentidos = ["concede", "niega", "modula", "mixto", "indeterminado"];
      if (sentido && !validSentidos.includes(sentido)) {
        return jsonResponse({ status: "error", error: { code: "E400", message: "invalid_sentido", supported: validSentidos } }, 400);
      }

      // Sanitizar + query expansion para tildes corruptas (U+FFFD en D1)
      // Truncamos palabras len>=6 a len-2 + '*' para matchear 'pensi�n'->'pensi', 'constituci�n'->'constituci'
      const STOPWORDS = new Set(["de","la","el","los","las","un","una","y","o","a","en","por","para","con","del","al","que","se","su","sus","es","son","fue","ser","como","sin","sobre"]);
      const cleanQ = q.replace(/[^\p{L}\p{N}\s]/gu, " ").replace(/\s+/g, " ").trim().toLowerCase();
      if (!cleanQ) {
        return jsonResponse({ status: "error", error: { code: "E400", message: "invalid_query", detail: "query has no searchable tokens" } }, 400);
      }
      const tokens = cleanQ.split(" ").filter((t) => t && !STOPWORDS.has(t));
      if (!tokens.length) {
        return jsonResponse({ status: "error", error: { code: "E400", message: "invalid_query", detail: "query has only stopwords" } }, 400);
      }
      const ftsTokens = tokens.map((t) => (t.length >= 6 ? t.slice(0, t.length - 2) + "*" : t));
      const ftsQuery = ftsTokens.join(" AND ");

      // Query FTS5 sobre resumen_fts
      let sql = `
        SELECT
          r.id,
          r.sentido,
          r.derechos,
          r.problema_juridico,
          r.ratio_decidendi,
          r.decision_texto,
          r.extraction_method,
          s.titulo, s.fecha, s.ponente, s.tipo, s.tipo_proceso, s.fuente_url,
          snippet(resumen_fts, 0, '<mark>', '</mark>', '…', 30) AS snippet_problema,
          snippet(resumen_fts, 1, '<mark>', '</mark>', '…', 30) AS snippet_ratio,
          bm25(resumen_fts) AS rank
        FROM resumen_fts
        JOIN sentencias_resumen r ON r.rowid = resumen_fts.rowid
        LEFT JOIN sentencias s ON s.id = r.id
        WHERE resumen_fts MATCH ?
      `;
      const bindings: any[] = [ftsQuery];
      if (sentido) { sql += " AND r.sentido = ?"; bindings.push(sentido); }
      if (derecho) { sql += " AND r.derechos LIKE ?"; bindings.push(`%${derecho}%`); }
      sql += " ORDER BY rank LIMIT ?";
      bindings.push(limit);

      try {
        const stmt = env.DB.prepare(sql).bind(...bindings);
        const { results } = await stmt.all();
        return jsonResponse({
          status: "success",
          data: {
            query: q,
            fts_query: ftsQuery,
            filters: { sentido: sentido || null, derecho: derecho || null },
            limit,
            count: results?.length ?? 0,
            plan,
            results: results ?? [],
            timestamp: new Date().toISOString(),
          },
        });
      } catch (e: any) {
        return jsonResponse({
          status: "error",
          error: { code: "E500", message: "argument_search_failed", detail: e?.message || String(e) },
        }, 500);
      }
    }


    // --- 4. 404 FALLBACK ---
    return jsonResponse({
      status: "error",
            error: { code: "E404", message: "not_found", available_endpoints: ["/health", "/v1/legal/verify-citation", "/v1/legal/search", "/v1/legal/argument", "/v1/webhooks/paddle"] },
    }, 404);
  },
};