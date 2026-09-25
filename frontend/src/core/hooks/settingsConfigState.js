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
