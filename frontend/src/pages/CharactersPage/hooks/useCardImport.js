import { useState, useRef } from 'react';
import { getCharactersByWorld } from '../../../core/api/characters';
import { importCharacter, importPersona, readJsonFile } from '../../../core/api/import-export';
import { listCharacterStateFields } from '../../../core/api/character-state-fields';
import { listPersonas } from '../../../core/api/personas';
import { log } from '../../../core/utils/logger.js';

// ── 角色卡 / 玩家卡导入 ────────────────────────────────────────────────────

export function useCardImport(worldId, setCharacters, setPersonas) {
  const [importingChar, setImportingChar] = useState(false);
  const [importingPersona, setImportingPersona] = useState(false);
  const charImportRef = useRef(null);
  const personaImportRef = useRef(null);

  async function handleImportCharFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingChar(true);
    try {
      const data = await readJsonFile(file);
      const stateValues = data.character_state_values;
      if (stateValues && stateValues.length > 0) {
        const fields = await listCharacterStateFields(worldId);
        const worldFieldKeys = new Set(fields.map((f) => f.field_key));
        const incompatibleKeys = stateValues
          .filter((sv) => !worldFieldKeys.has(sv.field_key))
          .map((sv) => sv.field_key);
        if (incompatibleKeys.length > 0) {
          log.error('character.import.incompatible', null, { toast: `导入失败：该角色卡包含与当前世界不兼容的状态字段：${incompatibleKeys.join('、')}。请在同一世界中导入。` });
          return;
        }
      }
      await importCharacter(worldId, data);
      const chars = await getCharactersByWorld(worldId);
      setCharacters(chars);
    } catch (err) {
      log.error('character.import_failed', err, { toast: `导入失败：${err.message}` });
    } finally {
      setImportingChar(false);
      e.target.value = '';
    }
  }

  async function handleImportPersonaFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportingPersona(true);
    try {
      const data = await readJsonFile(file);
      await importPersona(worldId, data);
      const ps = await listPersonas(worldId);
      setPersonas(ps);
    } catch (err) {
      log.error('character.import_failed', err, { toast: `导入失败：${err.message}` });
    } finally {
      setImportingPersona(false);
      e.target.value = '';
    }
  }

  return {
    importingChar,
    importingPersona,
    charImportRef,
    personaImportRef,
    handleImportCharFile,
    handleImportPersonaFile,
  };
}
