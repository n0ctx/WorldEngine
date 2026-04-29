import * as llm from '../llm/index.js';

const TITLE_EMPTY_RETRY_MAX = 2;

export function stripThinkTags(text) {
  return (text || '').replace(/<think>[\s\S]*?<\/think>\n*/g, '').replace(/<think>[\s\S]*$/, '').trim();
}

export function normalizeTitle(raw) {
  return stripThinkTags(raw)
    .replace(/["'"'「」『』《》【】]/g, '')
    .replace(/[，。！？；：,.!?;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 15);
}

export async function generateTitleWithRetry({ prompts, maxTokens, temperature, log, logLabel, logMeta, conversationId, configScope = 'aux' }) {
  for (let attempt = 1; attempt <= TITLE_EMPTY_RETRY_MAX; attempt++) {
    if (attempt > 1) {
      log.warn(`${logLabel} RETRY  ${logMeta}  attempt=${attempt}`);
    }

    const prompt = prompts[Math.min(attempt - 1, prompts.length - 1)];
    const raw = await llm.complete(prompt, { temperature, maxTokens, thinking_level: null, configScope, callType: 'title_gen', conversationId });
    const title = normalizeTitle(raw);
    if (title) {
      return { title, source: 'llm', attempts: attempt };
    }
    log.warn(`${logLabel} EMPTY  ${logMeta}  attempt=${attempt}  raw=${JSON.stringify(raw ?? '')}`);
  }

  log.warn(`${logLabel} GIVEUP  ${logMeta}  attempts=${TITLE_EMPTY_RETRY_MAX}`);
  return null;
}
