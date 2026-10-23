export interface Env {
  API_KEY_PREFIX: string;
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

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return jsonResponse({ status: "ok" });
    }

    // Health check
    if (url.pathname === "/health" && request.method === "GET") {
      return jsonResponse({
        status: "success",
        data: { service: "yellowtips-api", version: "0.1.0" },
      });
    }

    // Verify citation endpoint
    if (url.pathname === "/v1/legal/verify-citation" && request.method === "POST") {
      // 1. Auth check
      const apiKey = request.headers.get("X-API-Key");
      if (!apiKey || !apiKey.startsWith(env.API_KEY_PREFIX)) {
        return jsonResponse(
          {
            status: "error",
            error: {
              code: "E401",
              message: "invalid_api_key",
              hint: "Include X-API-Key header with a valid key",
            },
          },
          401
        );
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

      // 3. Validate required fields
      if (!citation || !jurisdiction) {
        const missing = [];
        if (!citation) missing.push("citation");
        if (!jurisdiction) missing.push("jurisdiction");
        return jsonResponse(
          {
            status: "error",
            error: {
              code: "E400",
              message: "missing_required_fields",
              fields: missing,
            },
          },
          400
        );
      }

      // 4. Validate jurisdiction
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

      // 5. TODO: real verification comes in Step 11
      return jsonResponse({
        status: "success",
        data: {
          citation,
          jurisdiction,
          proposition: proposition || null,
          existence_check: "pending_implementation",
          relevance_check: "pending_implementation",
          temporality_check: "pending_implementation",
          overall_confidence: "pending",
          note: "MVP infrastructure ready. Real verification coming next.",
          timestamp: new Date().toISOString(),
        },
      });
    }

    // 404 fallback
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