import { formatTokens, calcCost, formatCost } from '../../core/utils/token-usage.js';
import ActivatedEntriesRow from './ActivatedEntriesRow.jsx';

// 助手消息下方的用量行；激活条目与用量同时显示时并在这一行末尾
export default function TokenUsageRow({ message, currentModelPricing, showEntries }) {
  const cost = formatCost(calcCost(message.token_usage, currentModelPricing));

  return (
    <div className="we-token-usage">
      <span title="输入 tokens">↑{formatTokens(message.token_usage.prompt_tokens)}</span>
      <span title="输出 tokens">↓{formatTokens(message.token_usage.completion_tokens)}</span>
      {message.token_usage.cache_read_tokens != null && message.token_usage.cache_read_tokens > 0 && (
        <span title="缓存命中 tokens">命中 {formatTokens(message.token_usage.cache_read_tokens)}</span>
      )}
      {message.token_usage.cache_creation_tokens != null && message.token_usage.cache_creation_tokens > 0 && (
        <span title="缓存写入 tokens">写入 {formatTokens(message.token_usage.cache_creation_tokens)}</span>
      )}
      <span className="we-token-usage-unit">tokens</span>
      {cost && (
        <span className="we-token-usage-cost" title="本条消息估算费用（美元）">
          {cost}
        </span>
      )}
      {showEntries && <ActivatedEntriesRow entries={message.activated_entries} />}
    </div>
  );
}
