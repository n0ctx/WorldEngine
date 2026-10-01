/**
 * 骨架占位：等数据时用。lines 给每行宽度（百分比），整组读作一次「加载中」；
 * block 是一整块（卡片、封面），只做装饰，由外层容器负责读屏说明。
 * 等 AI 分析这类要说明在做什么的等待，用文字，不用骨架。
 */
export default function Skeleton({ lines = [85, 65, 90], block = false, label = '加载中', className = '' }) {
  if (block) return <span aria-hidden="true" className={['we-skel we-skel--block', className].filter(Boolean).join(' ')} />;
  return (
    <div role="status" aria-label={label} className={['we-skel-stack', className].filter(Boolean).join(' ')}>
      {lines.map((width, index) => (
        <span key={index} aria-hidden="true" className="we-skel we-skel-line" style={{ '--skel-width': `${width}%` }} />
      ))}
    </div>
  );
}
