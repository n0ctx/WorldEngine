import { useMemo } from 'react';
import { groupMessagesIntoChapters } from '../../core/utils/chapter-grouping.js';
import { parseStreamingBlocks } from '../../core/utils/think-blocks.js';
import { areOptionsEqual } from '../../core/utils/next-prompt.js';

// 刻度提示取正文开头，跳过思考块
const railLabelOf = (content) => parseStreamingBlocks(content)
  .filter((b) => b.type === 'text')
  .map((b) => b.content)
  .join(' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, 24) || '（空）';

// 本页每条已落定的消息一根刻度
const toRailItems = (messages) => messages
  .filter((m) => !m._isStream && m.id != null)
  .map((m) => ({ id: m.id, kind: m.role === 'user' ? 'user' : 'assistant', label: railLabelOf(m.content) }));

// 展示派生：追加末页流式 stub、定位最后一条 assistant、按章节投影可见消息、生成刻度条目
export default function useMessageDisplay({
  messages,
  pageMessages,
  onLastPage,
  prose,
  generating,
  continuingMessageId,
  streamingKey,
  streamingText,
  options,
  chapterTurnSize,
}) {
  const messagesForDisplay = useMemo(() => {
    // streaming 仅在末页（followLast 语义）追加，翻到旧页时不展示
    if (!prose || !generating || !!continuingMessageId || !onLastPage) return pageMessages;
    const lastMsg = pageMessages[pageMessages.length - 1];
    const fakeTs = (lastMsg?.created_at ?? 0) + 1;
    return [
      ...pageMessages,
      {
        _key: streamingKey || '__streaming__',
        id: streamingKey || '__streaming__',
        role: 'assistant',
        content: streamingText || '',
        _isStream: true,
        created_at: fakeTs,
      },
    ];
  }, [prose, pageMessages, onLastPage, generating, continuingMessageId, streamingKey, streamingText]);

  const lastAssistantId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'assistant') return messages[i].id;
    }
    return null;
  }, [messages]);

  const lastAssistantFrozenOptions = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const msg = messages[i];
      if (msg.role === 'assistant') return Array.isArray(msg._options) ? msg._options : [];
    }
    return [];
  }, [messages]);
  const suppressLastFrozen = options.length > 0 && areOptionsEqual(options, lastAssistantFrozenOptions);
  // 选项流式时正文已写完，「正在生成」只由选项卡给出，正文不再挂光标
  const optionsStreaming = generating && options.length > 0;

  // 章节按全局 messages 分（保留稳定 chapterIndex），再投影出当前页可见的章节子集；末页 streaming stub 单独并入末章。
  // 全局分组只依赖 messages（流式期间引用稳定，不随 token 重算）；窗口投影依赖 messagesForDisplay。
  const globalChapters = useMemo(() => {
    if (!prose) return [];
    return groupMessagesIntoChapters(messages, chapterTurnSize);
  }, [prose, messages, chapterTurnSize]);
  const chapters = useMemo(() => {
    if (globalChapters.length === 0) return globalChapters;
    // 必须按 m.id 建集合：onUserSaved 后用户消息 id=realId/_key=tempId、appendMessage 后助手 id=realId/_key=streamKey；用 _key 会与下面 ch.messages.filter(m=>visibleIds.has(m.id)) 错位导致整条消息被过滤
    const visibleIds = new Set(messagesForDisplay.map((m) => m.id));
    const streamStub = messagesForDisplay.find((m) => m._isStream) || null;
    const visible = globalChapters
      .map((ch) => ({ ...ch, messages: ch.messages.filter((m) => visibleIds.has(m.id)) }))
      .filter((ch) => ch.messages.length > 0);
    if (streamStub && visible.length > 0) {
      visible[visible.length - 1].messages = [...visible[visible.length - 1].messages, streamStub];
    }
    return visible;
  }, [globalChapters, messagesForDisplay]);
  // 刻度只消费已落定消息（stub 被过滤），依赖 pageMessages（流式期间引用稳定）即可，避免每个 token 重跑 parseStreamingBlocks
  const railItems = useMemo(() => toRailItems(pageMessages), [pageMessages]);

  return { messagesForDisplay, lastAssistantId, suppressLastFrozen, optionsStreaming, chapters, railItems };
}
