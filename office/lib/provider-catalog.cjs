'use strict';

// Generated metadata describes the upstream tools and their event contracts.
// It does not grant permission decisions or claim an integration is installed.
const raw = require('./provider-catalog.json');
function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const item of Object.values(value)) deepFreeze(item);
  return Object.freeze(value);
}
if (raw.version !== 1 || !Array.isArray(raw.providers)) throw new Error('Unsupported provider catalog format');
const CATALOG = deepFreeze(raw);
const PROVIDERS = CATALOG.providers;
const PROVIDER_IDS = Object.freeze(PROVIDERS.map((provider) => provider.id));
const byId = new Map(PROVIDERS.map((provider) => [provider.id, provider]));
// Keep established office event identities compatible while looking up their
// authoritative upstream definitions. Canonical catalog IDs remain unchanged.
const aliases = Object.freeze({ cursor: 'cursor-agent', claude: 'claude-code' });
function normalizeProviderId(id) {
  if (typeof id !== 'string') return null;
  const canonical = aliases[id] || id;
  return byId.has(canonical) ? canonical : null;
}
function getProvider(id) { return byId.get(normalizeProviderId(id)) || null; }
function getAllProviders() { return PROVIDERS; }

module.exports = { CATALOG, PROVIDERS, PROVIDER_IDS, normalizeProviderId, getProvider, getAllProviders };
