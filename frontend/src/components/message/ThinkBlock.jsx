import { useState } from 'react';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { IconChevronRight } from '../ui/icons.jsx';
import { markdownSanitizeSchema } from '../../core/utils/markdown-sanitize.js';
import { stripNextPromptBlocks } from '../../core/utils/next-prompt.js';
import InterruptedMark from './InterruptedMark.jsx';
import StreamingMarkdown, { StreamCaret } from './StreamingMarkdown.jsx';

const THINK_REMARK_PLUGINS = [remarkGfm];
const THINK_REHYPE_PLUGINS = [[rehypeSanitize, markdownSanitizeSchema]];

// 思考过程：流式时跟着 open 展开，用户点过之后以用户的选择为准；autoCollapse 由对话 / 写作各自的设置传入
export default function ThinkBlock({ content, autoCollapse, open = false, streaming = false, caret = false, interrupted = false }) {
  const [userToggled, setUserToggled] = useState(false);
  const [userExpanded, setUserExpanded] = useState(!autoCollapse);
  const expanded = userToggled ? userExpanded : (open || !autoCollapse);
  const cleanContent = stripNextPromptBlocks(content);

  return (
    <div className="we-think-block">
      <button
        onClick={() => { setUserExpanded(!expanded); setUserToggled(true); }}
        aria-label={expanded ? '折叠思考过程' : '展开思考过程'}
        aria-expanded={expanded}
        className="we-think-block-toggle"
      >
        <IconChevronRight
          size={16}
          className={`we-think-block-chevron${expanded ? ' we-think-block-chevron--expanded' : ''}`}
        />
        {open ? '思考中' : '思考过程'}
        {!open && <span className="we-think-block-status">已完成</span>}
        {caret && !expanded && <StreamCaret />}
      </button>
      <div className={`we-think-block-body-wrap${expanded ? ' we-think-block-body-wrap--open' : ''}`}>
        <div className="we-think-block-body-inner">
          <div className="we-think-block-body">
            <StreamingMarkdown streaming={streaming} caret={caret} remarkPlugins={THINK_REMARK_PLUGINS} rehypePlugins={THINK_REHYPE_PLUGINS}>
              {cleanContent}
            </StreamingMarkdown>
            {interrupted && <InterruptedMark />}
          </div>
        </div>
      </div>
    </div>
  );
}
