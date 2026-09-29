import { useState } from 'react';
import Button from '../../../components/ui/Button.jsx';
import Compare from '../sketch/Compare.jsx';
import LegacyEnterMock from '../sketch/LegacyEnterMock.jsx';
import SlotSection from '../SlotSection.jsx';

export function LegacyEnterDemo() {
  const [run, setRun] = useState(0);
  return (
    <SlotSection
      id="legacy-css-enter"
      actions={<Button variant="secondary" size="sm" onClick={() => setRun((n) => n + 1)}>重播</Button>}
    >
      <Compare key={run} now={<LegacyEnterMock tone="now" />} sketch={<LegacyEnterMock tone="sketch" />} />
    </SlotSection>
  );
}
