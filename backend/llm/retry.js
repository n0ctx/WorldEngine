// 单次模型请求的重试与超时。
//
// chat / complete 的重试循环与工具循环里的每次模型请求共用这里的判定：
//   - 4xx（除 429）不重试；
//   - 每次尝试一个全新的超时窗口，超时不重试，错误码 LLM_TIMEOUT；
//   - 调用方 signal 已中止时不重试，原样抛出，由上层决定如何表达取消。

/** 判断是否不可重试的客户端错误（4xx 且非 429） */
export function isNonRetryable(err) {
  const s = err.status;
  return s && s >= 400 && s < 500 && s !== 429;
}

/** 等待 ms 毫秒；传了 signal 时，中止会让等待提前结束（不抛错，由调用方自行检查 signal） */
export function sleep(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      resolve();
    }, { once: true });
  });
}

export function buildTimedSignal(signal, timeoutMs) {
  const parsed = Number(timeoutMs);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { signal, didTimeout: () => false };
  }
  const timeoutSignal = AbortSignal.timeout(parsed);
  return {
    signal: signal ? AbortSignal.any([signal, timeoutSignal]) : timeoutSignal,
    didTimeout: () => timeoutSignal.aborted && !signal?.aborted,
  };
}

export function createTimeoutError(label, timeoutMs) {
  const err = new Error(`LLM ${label || 'request'} timed out after ${timeoutMs}ms`);
  err.status = 504;
  err.code = 'LLM_TIMEOUT';
  return err;
}

/**
 * 带超时窗口与重试地跑一次模型请求。
 *
 * @param {(signal: AbortSignal|undefined) => Promise<any>} run  发出请求；必须把收到的 signal 传给底层 fetch
 * @param {object}   [opts]
 * @param {AbortSignal} [opts.signal]     调用方的取消信号
 * @param {number}   [opts.timeoutMs]     每次尝试的超时窗口；<=0 或缺省表示不限时
 * @param {{max:number, delayMs:number}} [opts.retry]  缺省不重试
 * @param {string}   [opts.label]         超时错误信息里的调用名
 * @param {(err: Error) => boolean} [opts.isFatal]  返回 true 的错误原样抛出、不重试
 * @param {(info: {attempt:number, error:Error}) => void} [opts.onRetry]
 */
export async function requestWithRetry(run, opts = {}) {
  const { signal, timeoutMs, label, isFatal, onRetry } = opts;
  const max = Number.isInteger(opts.retry?.max) ? opts.retry.max : 0;
  const delayMs = Number.isInteger(opts.retry?.delayMs) ? opts.retry.delayMs : 0;
  let lastError;
  for (let attempt = 0; attempt <= max; attempt++) {
    // 每次尝试都用一个全新的超时窗口，避免上一次超时后 signal 保持已中止状态
    const timeout = buildTimedSignal(signal, timeoutMs);
    try {
      return await run(timeout.signal);
    } catch (err) {
      if (timeout.didTimeout()) throw createTimeoutError(label, timeoutMs);
      if (signal?.aborted || err.name === 'AbortError' || isNonRetryable(err) || isFatal?.(err)) throw err;
      lastError = err;
      if (attempt >= max) break;
      onRetry?.({ attempt: attempt + 1, error: err });
      await sleep(delayMs, signal);
      if (signal?.aborted) throw err;
    }
  }
  throw lastError;
}
