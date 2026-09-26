import { getCharactersByWorld } from '../api/characters.js';
import { listPersonas } from '../api/personas.js';
import { listWorldEntries } from '../api/prompt-entries.js';
import { listWorldStateFields } from '../api/world-state-fields.js';

export async function loadWorldContent(worldId) {
  const [characters, personas, worldFields, worldEntries] = await Promise.all([
    getCharactersByWorld(worldId),
    listPersonas(worldId),
    listWorldStateFields(worldId),
    listWorldEntries(worldId),
  ]);
  return { characters, personas, worldFields, worldEntries };
}
