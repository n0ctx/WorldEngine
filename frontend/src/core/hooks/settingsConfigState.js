import { DIARY_DATE_MODE } from '../constants/settings.js';

export function readMainModelSettings(config) {
  return {
    llm: config.llm || {},
    embedding: config.embedding || {},
    proxyUrl: config.proxy_url ?? '',
  };
}

export function readAuxiliaryModelSettings(config) {
  return {
    auxLlm: config.aux_llm || {},
    writingAuxLlm: config.writing?.aux_llm || {},
    assistantModelSource: config.assistant?.model_source ?? 'main',
  };
}

export function readWritingModelSettings(config) {
  const writing = config.writing || {};
  return {
    writingLlm: writing.llm || {
      provider: null,
      base_url: null,
      model: '',
      temperature: null,
      max_tokens: null,
      has_key: false,
    },
  };
}

export function readDisplaySettings(config) {
  return {
    showThinking: config.ui?.show_thinking !== false,
    autoCollapseThinking: config.ui?.auto_collapse_thinking !== false,
    showTokenUsage: config.ui?.show_token_usage === true,
    modelPricing: config.llm?.model_pricing ?? null,
    writingModelPricing: config.writing?.llm?.model_pricing ?? null,
  };
}

export function readPromptSettings(config) {
  const writing = config.writing || {};
  return {
    globalSystemPrompt: config.global_system_prompt ?? '',
    globalPostPrompt: config.global_post_prompt ?? '',
    contextRounds: config.context_history_rounds ?? 10,
    writingSystemPrompt: writing.global_system_prompt ?? '',
    writingPostPrompt: writing.global_post_prompt ?? '',
    writingContextRounds: writing.context_history_rounds ?? null,
  };
}

export function readMemorySettings(config) {
  const writing = config.writing || {};
  return {
    memoryExpansionEnabled: config.memory_expansion_enabled !== false,
    suggestionEnabled: config.suggestion_enabled === true,
    writingSuggestionEnabled: writing.suggestion_enabled === true,
    writingMemoryExpansionEnabled: writing.memory_expansion_enabled !== false,
    longTermMemoryEnabled: config.long_term_memory_enabled === true,
    writingLongTermMemoryEnabled: writing.long_term_memory_enabled === true,
    tableMemoryEnabled: config.table_memory_enabled === true,
    writingTableMemoryEnabled: writing.table_memory_enabled === true,
    tableMemoryRowLimits: config.table_memory_row_limits ?? {},
    memoryRecallMaxSessions: config.memory_recall_max_sessions ?? 5,
  };
}

export function readDanmakuSettings(config) {
  const danmaku = config.danmaku || {};
  return {
    danmakuEnabled: danmaku.enabled === true,
    danmakuCount: danmaku.count ?? 5,
    danmakuSpeed: danmaku.speed ?? 'normal',
  };
}

export function readTurnSizeSettings(config) {
  const writing = config.writing || {};
  return {
    chapterTurnSize: config.chapter_turn_size ?? 20,
    writingChapterTurnSize: writing.chapter_turn_size ?? null,
    pageTurnSize: config.page_turn_size ?? 50,
    writingPageTurnSize: writing.page_turn_size ?? null,
  };
}

export function readDiarySettings(config) {
  const diary = config.diary || {};
  return {
    diaryChatEnabled: diary.chat?.enabled === true,
    diaryChatDateMode: diary.chat?.date_mode ?? DIARY_DATE_MODE.VIRTUAL,
    diaryWritingEnabled: diary.writing?.enabled === true,
    diaryWritingDateMode: diary.writing?.date_mode ?? DIARY_DATE_MODE.VIRTUAL,
  };
}

function nestUnder(path, value) {
  return path.reduceRight((inner, key) => ({ [key]: inner }), value);
}

/**
 * 模型配置段（llm / embedding / aux_llm 等）的字段变更处理：
 * 切换 provider 时写回后端并用返回的 base_url/model/has_key 刷新本地；has_key 只改本地；其余字段本地与后端同步写。
 * @param {string[]} path 配置段在 config 中的路径，如 ['writing', 'aux_llm']
 * @param {(provider: string) => object} providerPatch 切换 provider 时提交的补丁
 * @param {'' | null} empty provider/base_url 缺省值
 * @param {'' | null} [emptyModel] model 缺省值
 */
export function createModelSectionChangeHandler(patchConfig, setSection, { path, providerPatch, empty, emptyModel = empty }) {
  return async function handleChange(field, value) {
    if (field === 'provider') {
      const updated = await patchConfig(nestUnder(path, providerPatch(value)), { reload: true });
      const section = path.reduce((node, key) => node?.[key], updated);
      setSection((previous) => ({
        ...previous,
        provider: value || empty,
        base_url: section?.base_url ?? empty,
        model: section?.model ?? emptyModel,
        has_key: section?.has_key ?? false,
      }));
    } else if (field === 'has_key') {
      setSection((previous) => ({ ...previous, has_key: value }));
    } else {
      setSection((previous) => ({ ...previous, [field]: value }));
      await patchConfig(nestUnder(path, { [field]: value }));
    }
  };
}
