import { useState } from 'react';
import InputBox from '../../../components/chat/InputBox.jsx';
import Pager from '../../../components/chat/Pager.jsx';
import Button from '../../../components/ui/Button.jsx';
import VisualSection from '../VisualSection.jsx';

const noop = () => {};

export function ChatControlsDemo() {
  const [page, setPage] = useState(1);
  const [generating, setGenerating] = useState(false);
  return (
    <VisualSection
      id="chat-controls"
      actions={<Button variant="secondary" size="sm" onClick={() => setGenerating((g) => !g)}>{generating ? '结束生成' : '模拟生成中'}</Button>}
    >
      <div className="we-chat-center-pane we-design-lab__pane we-design-lab__pane--composer">
        <InputBox
          sessionId="design-lab"
          generating={generating}
          onSend={noop}
          onStop={() => setGenerating(false)}
          pagerSlot={<Pager totalPages={5} currentPage={page} onChange={setPage} />}
        />
      </div>
    </VisualSection>
  );
}
