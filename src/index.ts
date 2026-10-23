export interface Env {
  API_KEY_PREFIX: string;
  API_KEYS: KVNamespace;
  DB: D1Database;
}

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

// Normaliza la cita del usuario para que coincida con el formato de la DB
function normalizeCitation(input: string): string {
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, " ");

  // Acepta: C-567-2019, C-567 DE 2019, C 567/2019, Sentencia C-567 de 2019
  const match = cleaned.match(
    /([CTSU]|1A\.?\/J\.?|2A\.?\/J\.?)[\s\-\/]+(\d+)[\s\-\/]+(?:(?:DE)\s+)?(\d{4})/
  );
  if (match) {
    const type = match[1].replace(/[.\/]/g, "").trim();
    return `${type}-${match[2]}-${match[3]}`;
  }
  return cleaned;
}

// Verifica relevancia de forma simple: si la proposición comparte palabras clave
// con el texto de la cita o sus notas
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

    if (url.pathname === "/health" && request.method === "GET") {
      return jsonResponse({
        status: "success",
        data: { service: "yellowtips-api", version: "0.2.0" },
      });
    }

    if (url.pathname === "/v1/legal/verify-citation" && request.method === "POST") {
      // 1. Auth
      const apiKey = request.headers.get("X-API-Key");
      if (!apiKey || !apiKey.startsWith(env.API_KEY_PREFIX)) {
        return jsonResponse(
          { status: "error", error: { code: "E401", message: "invalid_api_key" } },
          401
        );
      }

      const keyData = await env.API_KEYS.get(apiKey);
      if (!keyData) {
        return jsonResponse(
          { status: "error", error: { code: "E401", message: "invalid_api_key" } },
          401
        );
      }

      let meta: any = {};
      try {
        meta = JSON.parse(keyData);
      } catch {
        meta = { plan: "unknown" };
      }

      // 2. Parse body
      let body: any;
      try {
        body = await request.json();
      } catch {
        return jsonResponse(
          { status: "error", error: { code: "E500", message: "invalid_json_body" } },
          400
        );
      }

      const { citation, jurisdiction, proposition } = body || {};

      if (!citation || !jurisdiction) {
        const missing = [];
        if (!citation) missing.push("citation");
        if (!jurisdiction) missing.push("jurisdiction");
        return jsonResponse(
          {
            status: "error",
            error: { code: "E400", message: "missing_required_fields", fields: missing },
          },
          400
        );
      }

      const validJurisdictions = ["MX", "CO", "AR", "CL", "PE", "ES"];
      if (!validJurisdictions.includes(jurisdiction)) {
        return jsonResponse(
          {
            status: "error",
            error: {
              code: "E400",
              message: "invalid_jurisdiction",
              supported: validJurisdictions,
            },
          },
          400
        );
      }

      // 3. Normalize and query D1
      const normalizedId = normalizeCitation(citation);

      const result = await env.DB.prepare(
        "SELECT citation_id, citation_text, court, year, status, superseded_by, notes FROM citations WHERE jurisdiction = ? AND (citation_id = ? OR citation_id = ?)"
      )
        .bind(jurisdiction, citation, normalizedId)
        .first();

      // 4. Build response based on DB result
      if (!result) {
        return jsonResponse({
          status: "partial",
          data: {
            citation,
            jurisdiction,
            existence_check: "not_found",
            relevance_check: "not_applicable",
            temporality_check: "unknown",
            overall_confidence: "low",
            error: {
              code: "E_CITATION_NOT_FOUND",
              message: "Citation not found in our database. This does not mean it does not exist — our coverage is limited.",
            },
            plan: meta.plan || "unknown",
            timestamp: new Date().toISOString(),
          },
        });
      }

      const dbStatus = result.status as string;
      let existence_check = "confirmed";
      let temporality_check = "valid";
      let overall_confidence = "high";
      let note: string | null = (result.notes as string) || null;

      if (dbStatus === "dead_law") {
        existence_check = "confirmed";
        temporality_check = "dead_law";
        overall_confidence = "low";
      } else if (dbStatus === "fabricated") {
        existence_check = "fabricated";
        temporality_check = "not_applicable";
        overall_confidence = "none";
      }

      const relevance_check = checkRelevance(
        proposition || null,
        result.citation_text as string,
        (result.notes as string) || ""
      );

      return jsonResponse({
        status: dbStatus === "fabricated" ? "error" : "success",
        data: {
          citation,
          jurisdiction,
          citation_id: result.citation_id,
          citation_text: result.citation_text,
          court: result.court,
          year: result.year,
          existence_check,
          relevance_check,
          temporality_check,
          superseded_by: result.superseded_by || null,
          overall_confidence,
          note,
          plan: meta.plan || "unknown",
          timestamp: new Date().toISOString(),
        },
      });
    }

    return jsonResponse(
      {
        status: "error",
        error: {
          code: "E404",
          message: "not_found",
          available_endpoints: ["/health", "/v1/legal/verify-citation"],
        },
      },
      404
    );
  },
};