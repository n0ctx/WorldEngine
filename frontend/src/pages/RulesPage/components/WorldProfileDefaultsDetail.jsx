import WorldProfileDefaultsFields from '../../../components/state/WorldProfileDefaultsFields.jsx';

/** 规则页「世界状态」里的档案默认值：开场时间、开场地点。 */
export default function WorldProfileDefaultsDetail({ worldId }) {
  return (
    <div className="we-entry-editor-panel we-workshop-detail-inner">
      <div className="we-workshop-detail-head">
        <div>
          <h3 className="we-entry-editor-title we-workshop-detail-title">档案默认值</h3>
          <p className="we-workshop-detail-desc">开场时间和开场地点。新会话开始时带入，已有会话不受影响。</p>
        </div>
      </div>
      <WorldProfileDefaultsFields worldId={worldId} />
    </div>
  );
}
