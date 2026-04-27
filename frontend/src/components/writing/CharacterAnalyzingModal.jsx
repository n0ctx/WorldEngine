import ModalShell from '../ui/ModalShell.jsx';

export default function CharacterAnalyzingModal() {
  return (
    <ModalShell onClose={() => {}} maxWidth="max-w-sm">
      <div className="we-dialog-header">
        <h2>制卡分析</h2>
      </div>
      <div className="we-character-analyzing-body">
        <div className="we-character-analyzing-spinner" />
        <p className="we-character-analyzing-text">正在分析角色，请稍候…</p>
      </div>
    </ModalShell>
  );
}
