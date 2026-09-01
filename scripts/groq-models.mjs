/**
 * Lists the models this Groq key can actually use.
 *
 * Written because the default model name returned a 404: Groq deprecates
 * and removes models, so the right name is a fact to look up, not to
 * remember. Reads the key from the environment, never from an argument, so
 * it cannot end up in shell history.
 *
 * Usage: node --env-file=.env scripts/groq-models.mjs
 */
const key = process.env.GROQ_API_KEY;
if (!key) {
  console.error("GROQ_API_KEY is not set.");
  process.exit(1);
}

const res = await fetch("https://api.groq.com/openai/v1/models", {
  headers: { Authorization: `Bearer ${key}` }
});

if (!res.ok) {
  console.error(`Groq responded ${res.status}: ${await res.text()}`);
  process.exit(1);
}

const body = await res.json();
const ids = (body.data ?? []).map((m) => m.id).sort();
console.log(`${ids.length} models available:`);
for (const id of ids) console.log("  " + id);
