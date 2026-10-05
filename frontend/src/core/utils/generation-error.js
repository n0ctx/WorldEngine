// 生成失败的提示：后端只透传错误文本（服务商报错形如「<Provider> API error: <状态码> <原文>」，
// 超时形如「LLM … timed out after …ms」，连不上时是网络层的英文报错），这里把常见几类翻成
// 用户能处理的说法；fixInSettings 表示改设置能解决，界面据此给「去设置」。认不出的原样显示。

const STATUS_RE = /API error:\s*(\d{3})/;
const NETWORK_RE = /fetch failed|ECONNREFUSED|ENOTFOUND|ECONNRESET|EAI_AGAIN|network/i;
const QUOTA_RE = /insufficient|quota|balance|billing|credit/i;

function describeStatus(status, message) {
  if (status === 401 || status === 403) return { text: 'API Key 无效或没有权限，检查设置里的密钥', fixInSettings: true };
  if (status === 402 || QUOTA_RE.test(message)) return { text: '服务商账户余额或额度不足', fixInSettings: false };
  if (status === 404) return { text: '找不到这个模型，检查设置里的模型名和接口地址', fixInSettings: true };
  if (status === 429) return { text: '请求太频繁，稍等一会再重新生成', fixInSettings: false };
  if (status >= 500) return { text: '服务商暂时出错，稍后再重新生成', fixInSettings: false };
  return null;
}

/**
 * @param {string} message 后端透传的错误文本
 * @returns {{ text: string, detail: string | null, fixInSettings: boolean }}
 */
export function describeGenerationError(message) {
  const raw = String(message || '');
  const match = raw.match(STATUS_RE);
  const known = match
    ? describeStatus(Number(match[1]), raw)
    : /timed out/i.test(raw)
      ? { text: '模型太久没有回应，稍后再重新生成', fixInSettings: false }
      : NETWORK_RE.test(raw)
        ? { text: '连不上模型服务，检查网络或设置里的接口地址', fixInSettings: true }
        : null;
  if (!known) return { text: raw || '生成失败', detail: null, fixInSettings: false };
  return { ...known, detail: raw };
}
