/**
 * raw-recorder.js — 原始日志的返回记录
 *
 * logRawRequest()（raw-logger.js）落盘请求后返回记录器，provider 拿到结果后用它补记：
 *   非流式 readJsonAndRecord / 流式 recordStream / HTTP 失败 readErrorAndRecord / 连接失败 fetchAndRecord。
 * 结果写回请求所在的同一文件；主日志只留一行摘要。
 */

import fs from 'node:fs';
import path from 'node:path';
import { createLogger, formatMeta } from '../utils/logger.js';
import { readHttpErrorText } from './providers/_shared/fetch-utils.js';

const log = createLogger('llm-raw', 'blue');

/** 从非流式返回里取结束原因：OpenAI 兼容 / Anthropic / Gemini */
function extractFinishReason(data) {
  return data?.choices?.[0]?.finish_reason ?? data?.stop_reason ?? data?.candidates?.[0]?.finishReason ?? undefined;
}

function describeError(err) {
  if (!(err instanceof Error)) return err;
  return { name: err.name, message: err.message, status: err.status, code: err.code };
}

/** 超时 / 取消记为 aborted，其余为 error */
function errorStatus(err) {
  return err?.name === 'AbortError' || err?.name === 'TimeoutError' ? 'aborted' : 'error';
}

export function writeDump(filePath, dump, callType) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(dump, null, 2), 'utf-8');
  } catch (err) {
    log.warn(`RAW WRITE ERROR  callType=${callType}  error=${err.message}`);
  }
}

/**
 * 单次请求的返回记录器：结果写回请求所在的同一文件，同一请求只记第一次结果。
 * 主日志只留一行摘要，完整内容只在文件里。
 */
export function createRawRecorder(filePath, dump, startedAt) {
  const { callType, provider, model } = dump._meta;
  let done = false;

  function finish(status, response, finishReason) {
    if (done) return;
    done = true;
    const durationMs = Date.now() - startedAt;
    dump.response = { status, durationMs, ...response };
    writeDump(filePath, dump, callType);
    log.info(`RAW  ${formatMeta({ callType, provider, model, status, finish: finishReason, ms: durationMs, file: path.basename(filePath) })}`);
  }

  return {
    /** 非流式 / 工具轮：原样存 provider 返回的 JSON */
    response(data) {
      finish('ok', { body: data }, extractFinishReason(data));
    },
    /** 流式：存交给调用方的完整文本（思考包在 <think> 里）；completed=false 表示被调用方提前结束 */
    streamDone({ text, finishReason, usage, completed, error }) {
      const status = error ? errorStatus(error) : (completed ? 'ok' : 'aborted');
      finish(status, { stream: { text, finishReason, usage, completed }, error: describeError(error) }, finishReason);
    },
    /** HTTP 失败传 { status, text }；超时 / 取消 / 网络错误传 Error */
    error(info) {
      finish(errorStatus(info), { error: describeError(info) });
    },
  };
}

/**
 * 包住 provider 的流式输出：原样转交每一段，结束（含中断、出错）时把拼好的文本补记到原始日志。
 * readChunks(...args, meta) 是 provider 的读流生成器，读流时把 finishReason / usage 写进 meta。
 */
export async function* recordStream(raw, readChunks, ...args) {
  const meta = {};
  const chunks = readChunks(...args, meta);
  if (!raw) {
    yield* chunks;
    return;
  }
  let text = '';
  let completed = false;
  let error;
  try {
    for await (const chunk of chunks) {
      text += chunk;
      yield chunk;
    }
    completed = true;
  } catch (err) {
    error = err;
    throw err;
  } finally {
    raw.streamDone({ text, finishReason: meta.finishReason, usage: meta.usage, completed, error });
  }
}

/** 读出 HTTP 报错正文并补记到原始日志 */
export async function readErrorAndRecord(resp, raw, provider) {
  const text = await readHttpErrorText(resp, provider);
  raw?.error({ status: resp.status, text });
  return text;
}

/** 发出请求；连接失败 / 超时 / 取消记为错误后照常抛出 */
export async function fetchAndRecord(url, init, raw) {
  try {
    return await fetch(url, init);
  } catch (err) {
    raw?.error(err);
    throw err;
  }
}

/** 读取非流式 JSON 返回并补记到原始日志；读取失败（中断 / 非 JSON）记为错误后照常抛出 */
export async function readJsonAndRecord(resp, raw) {
  let data;
  try {
    data = await resp.json();
  } catch (err) {
    raw?.error(err);
    throw err;
  }
  raw?.response(data);
  return data;
}
