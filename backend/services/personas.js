import { upsertPersona, getPersonaByWorldId } from '../db/queries/personas.js';

export function getOrCreatePersona(worldId) {
  const existing = getPersonaByWorldId(worldId);
  if (existing) return existing;
  return upsertPersona(worldId, {});
}

export function updatePersona(worldId, patch) {
  return upsertPersona(worldId, patch);
}
