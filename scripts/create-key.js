#!/usr/bin/env node

const crypto = require("crypto");
const { execSync } = require("child_process");

// Parse args
const args = process.argv.slice(2);
const getArg = (name, defaultValue = null) => {
  const arg = args.find((a) => a.startsWith(`--${name}=`));
  return arg ? arg.split("=")[1] : defaultValue;
};

const plan = getArg("plan", "free");
const email = getArg("email", null);
const namespaceId = "623c93a551ff438bbb609efbea8999a1";

if (!["free", "starter", "pro"].includes(plan)) {
  console.error("❌ Error: --plan must be one of: free, starter, pro");
  process.exit(1);
}

// Generate key
const apiKey = "yt_live_" + crypto.randomBytes(24).toString("hex");

// Build metadata
const metadata = { plan };
if (email) metadata.email = email;
metadata.created_at = new Date().toISOString();

// Save to KV (remote = production)
try {
  const value = JSON.stringify(metadata);
  execSync(
    `npx wrangler kv key put --namespace-id=${namespaceId} "${apiKey}" "${value.replace(/"/g, '\\"')}" --remote`,
    { stdio: "pipe" }
  );

  console.log("");
  console.log("✅ API key creada y guardada en producción");
  console.log("");
  console.log("┌─────────────────────────────────────────────────────────────────┐");
  console.log(`│ API Key: ${apiKey}  │`);
  console.log("└─────────────────────────────────────────────────────────────────┘");
  console.log("");
  console.log(`  Plan:        ${plan}`);
  console.log(`  Email:       ${email || "(no asignado)"}`);
  console.log(`  Creada:      ${metadata.created_at}`);
  console.log("");
  console.log("⚠️  Guárdala ahora. Esta es la única vez que la verás.");
  console.log("");
  console.log("Prueba con:");
  console.log(`  curl -X POST https://api.yellowtips.com/v1/legal/verify-citation \\`);
  console.log(`    -H "Content-Type: application/json" \\`);
  console.log(`    -H "X-API-Key: ${apiKey}" \\`);
  console.log(`    -d '{"citation":"Sentencia C-567 de 2019","jurisdiction":"CO"}'`);
  console.log("");
} catch (error) {
  console.error("❌ Error guardando la key en KV:");
  console.error(error.message);
  process.exit(1);
}