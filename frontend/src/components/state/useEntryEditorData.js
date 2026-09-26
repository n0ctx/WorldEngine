import { useEffect, useRef, useState } from 'react';
import { getEntryConditions } from '../../core/api/prompt-entries';
import { listCharacterStateFields } from '../../core/api/character-state-fields';
import { listPersonaStateFields } from '../../core/api/persona-state-fields';
import { loadWorldContent } from '../../core/data/loadWorldContent.js';
import { log } from '../../core/utils/logger.js';
import { buildPrefillCondition, emptyCondition, parseTargetField } from './entryEditorRules.js';

export default function useEntryEditorData({ worldId, entry, isNew, prefillCondition, triggerType }) {
  const [properNouns, setProperNouns] = useState([]);
  const [allStateFieldLabels, setAllStateFieldLabels] = useState([]);
  const [conditions, setConditions] = useState([emptyCondition()]);
  const [rawFieldsByScope, setRawFieldsByScope] = useState({});
  const [fieldTypeMap, setFieldTypeMap] = useState(new Map());
  const conditionsInitRef = useRef(false);
  const initialTriggerTypeRef = useRef(triggerType);
  const prefillRef = useRef(prefillCondition);

  async function loadConditionsInto(typeMap) {
    if (!isNew) {
      const existingConditions = await getEntryConditions(entry.id);
      setConditions(existingConditions.length > 0
        ? existingConditions.map((condition) => ({ ...condition, ...parseTargetField(condition.target_field) }))
        : [emptyCondition()]);
      return;
    }
    setConditions([buildPrefillCondition(prefillRef.current, typeMap) ?? emptyCondition()]);
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [worldContent, charFields, personaFields] = await Promise.all([
          loadWorldContent(worldId),
          listCharacterStateFields(worldId),
          listPersonaStateFields(worldId),
        ]);
        if (cancelled) return;

        const { characters, personas, worldFields, worldEntries } = worldContent;

        const labels = [...new Set([...worldFields, ...charFields, ...personaFields]
          .map((field) => field.label).filter(Boolean))];
        const names = [...new Set([...characters.map((character) => character.name), ...personas.map((persona) => persona.name)]
          .filter(Boolean))];
        // 标题用于建议关键词；状态字段名只用于状态条件建议，避免常见词造成误命中。
        const entryTitles = [...new Set(worldEntries
          .map((item) => item.title).filter((title) => title && title !== entry?.title))];
        setAllStateFieldLabels(labels);
        setProperNouns([...names, ...entryTitles]);

        const fieldsByScope = { 世界: worldFields, 玩家: personaFields, 角色: charFields };
        setRawFieldsByScope(fieldsByScope);
        const typeMap = new Map();
        const addFieldTypes = (scope, fields) => {
          for (const field of fields) {
            const baseKey = `${scope}.${field.label}`;
            if (field.type === 'table') {
              const columns = Array.isArray(field.table_columns) ? field.table_columns : [];
              for (const column of columns) {
                if (column?.key) typeMap.set(`${baseKey}.${column.key}`, 'number');
              }
            } else {
              typeMap.set(baseKey, field.type);
            }
          }
        };
        addFieldTypes('世界', worldFields);
        addFieldTypes('玩家', personaFields);
        addFieldTypes('角色', charFields);
        setFieldTypeMap(typeMap);

        if (initialTriggerTypeRef.current === 'state' && !conditionsInitRef.current) {
          conditionsInitRef.current = true;
          await loadConditionsInto(typeMap);
        }
      } catch (err) {
        log.error('entry.suggestion_context.load_failed', err, { toast: err.message || '加载状态字段失败' });
      }
    })();
    return () => { cancelled = true; };
    // 初次挂载时 worldId 已确定；其余依赖只用于那次初始化。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [worldId]);

  useEffect(() => {
    if (triggerType !== 'state' || conditionsInitRef.current) return;
    if (fieldTypeMap.size === 0 && Object.keys(rawFieldsByScope).length === 0) return;
    conditionsInitRef.current = true;
    (async () => {
      try {
        await loadConditionsInto(fieldTypeMap);
      } catch (err) {
        log.error('entry.fields.load_failed', err, { toast: err.message || '加载状态条件失败' });
      }
    })();
    // 条件初始化依赖稳定引用/ref，只应在切到 state 或元数据到齐时运行。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerType, fieldTypeMap, rawFieldsByScope]);

  return {
    properNouns,
    allStateFieldLabels,
    conditions,
    setConditions,
    rawFieldsByScope,
    fieldTypeMap,
    conditionsInitRef,
  };
}
