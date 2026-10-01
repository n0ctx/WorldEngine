import Card from '../../../components/ui/Card.jsx';
import SectionTitle from '../../../components/ui/SectionTitle.jsx';
import WorldProfileDefaultsFields from '../../../components/rules/WorldProfileDefaultsFields.jsx';

/** 规则页「世界状态」里的档案默认值：开场时间、开场地点。 */
export default function WorldProfileDefaultsDetail({ worldId }) {
  return (
    <Card variant="sunken" className="we-entry-editor-panel we-workshop-detail-inner">
      <div className="we-workshop-detail-head">
        <div>
          <SectionTitle level="group">档案默认值</SectionTitle>
          <p className="we-workshop-detail-desc">开场时间和开场地点。新会话开始时带入，已有会话不受影响。</p>
        </div>
      </div>
      <WorldProfileDefaultsFields worldId={worldId} />
    </Card>
  );
}
