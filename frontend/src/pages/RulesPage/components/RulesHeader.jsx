import Button from '../../../components/ui/Button.jsx';
import Icon from '../../../components/ui/Icon.jsx';

export default function RulesHeader({ onBack, onOpenWizard }) {
  return (
    <>
      <button className="we-workshop-back we-on-shell" onClick={onBack}>
        <Icon size={14}>
          <polyline points="15 18 9 12 15 6" />
        </Icon>
        返回世界
      </button>
      <header className="we-workshop-header we-on-shell">
        <h1 className="we-workshop-title">这个世界的规则</h1>
        <p className="we-workshop-subtitle">设定条目、状态字段、注入顺序都在这一处管理</p>
        <Button size="sm" variant="primary" onClick={onOpenWizard}>
          + 新建系统（向导）
        </Button>
      </header>
    </>
  );
}
