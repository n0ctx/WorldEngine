import Button from '../../../components/ui/Button.jsx';
import { ChevronLeft } from 'lucide-react';

export default function RulesHeader({ onBack, onOpenWizard }) {
  return (
    <>
      <Button variant="text" size="sm" className="we-workshop-back we-on-shell" onClick={onBack}>
        <ChevronLeft size={16} />
        返回世界
      </Button>
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
