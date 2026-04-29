/**
 * Gemini explicit context caching (cachedContents API).
 *
 * Why: Gemini 3.x 系列 implicit caching 在常见 prompt size 区间存在 dead zone（issue #2064），
 * 且 flash-lite preview 实测 cachedContentTokenCount 持续为 0。explicit cache 在 Gemini 2.5/3.x 都支持，
 * 命中可省 90% input cost。
 *
 * 使用方式：getOrCreateCache 输入稳定 system 文本，返回 cachedContents/{id} 资源名。
 * 失败一律 throw，调用方降级到无缓存路径。
 */
import crypto from 'node:crypto';
import { createLogger } from '../../utils/logger.js';

const log = createLogger('gemini-cache', 'cyan');

const TTL_SECONDS = 600;
const REFRESH_BEFORE_MS = 60 * 1000;
const MAX_ENTRIES = 64;
const NEGATIVE_TTL_MS = 5 * 60 * 1000;

const cache = new Map(); // hash -> { name, expireAt }
const negative = new Map(); // hash -> retryAt (跳过创建失败的 key 一段时间)

function hashKey(model, text) {
  return crypto.createHash('sha256').update(`${model}\n${text}`).digest('hex');
}

function lruEvict() {
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
}

function normalizeModel(model) {
  return `models/${(model || '').replace(/^models\//, '')}`;
}

async function createCachedContent({ model, systemText, baseUrl, apiKey, signal }) {
  const url = `${baseUrl}/v1beta/cachedContents?key=${apiKey}`;
  const body = {
    model: normalizeModel(model),
    systemInstruction: { parts: [{ text: systemText }] },
    // contents 必填且非空：使用占位 user/model 对，使后续请求 contents 起始 role=user 时仍合法
    contents: [
      { role: 'user', parts: [{ text: '.' }] },
      { role: 'model', parts: [{ text: '.' }] },
    ],
    ttl: `${TTL_SECONDS}s`,
  };
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`cache create ${resp.status} ${text}`);
  }
  const data = await resp.json();
  return { name: data.name, totalTokens: data.usageMetadata?.totalTokenCount };
}

async function refreshCachedContent({ name, baseUrl, apiKey, signal }) {
  const url = `${baseUrl}/v1beta/${name}?key=${apiKey}`;
  const resp = await fetch(url, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ttl: `${TTL_SECONDS}s` }),
    signal,
  });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new Error(`cache refresh ${resp.status} ${text}`);
  }
}

/**
 * 获取或创建 cachedContents 资源，返回资源名（cachedContents/xxx）。
 * @param {object} args
 * @param {string} args.model
 * @param {string} args.systemText  稳定 system 前缀（[1-3.5]）
 * @param {string} args.baseUrl
 * @param {string} args.apiKey
 * @param {AbortSignal} [args.signal]
 * @returns {Promise<string>}
 */
export async function getOrCreateCache({ model, systemText, baseUrl, apiKey, signal }) {
  const key = hashKey(model, systemText);
  const now = Date.now();

  const negUntil = negative.get(key);
  if (negUntil && negUntil > now) throw new Error(`negative-cached until ${new Date(negUntil).toISOString()}`);
  if (negUntil && negUntil <= now) negative.delete(key);

  const entry = cache.get(key);
  if (entry) {
    if (entry.expireAt - now > REFRESH_BEFORE_MS) {
      cache.delete(key); cache.set(key, entry); // LRU touch
      return entry.name;
    }
    try {
      await refreshCachedContent({ name: entry.name, baseUrl, apiKey, signal });
      const refreshed = { name: entry.name, expireAt: now + TTL_SECONDS * 1000 };
      cache.delete(key); cache.set(key, refreshed);
      log.debug(`REFRESH  name=${entry.name}`);
      return refreshed.name;
    } catch (err) {
      log.warn(`REFRESH FAIL  name=${entry.name}  err=${err.message}  recreating`);
      cache.delete(key);
    }
  }

  try {
    const created = await createCachedContent({ model, systemText, baseUrl, apiKey, signal });
    cache.set(key, { name: created.name, expireAt: now + TTL_SECONDS * 1000 });
    lruEvict();
    log.info(`CREATE  name=${created.name}  tokens=${created.totalTokens}`);
    return created.name;
  } catch (err) {
    negative.set(key, now + NEGATIVE_TTL_MS);
    throw err;
  }
}

export const __testables = { hashKey, normalizeModel, cache, negative };
