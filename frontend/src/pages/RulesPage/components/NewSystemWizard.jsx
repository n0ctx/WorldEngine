import { useRef, useState } from 'react';
import Button from '../../../components/ui/Button.jsx';
import StateFieldEditor from '../../../components/state/StateFieldEditor';
import EntryEditor from '../../../components/state/EntryEditor';
import StepTrack from '../../../components/motion/StepTrack.jsx';
import { useEscapeKey } from '../../../core/hooks/useEscapeKey.js';
import DefaultValueMatrix from './DefaultValueMatrix.jsx';

// ── 新建系统向导：定义字段 → 设默认值 → 配触发条目（可跳过）──
export default function NewSystemWizard({ worldId, scope, scopeKey, onClose, onFinish }) {
  const [step, setStep] = useState(1);
  const [createdField, setCreatedField] = useState(null);
  // 用 ref 实时记录是否已建字段：StateFieldEditor 保存后会同步调用 onClose，
  // 而 onClose 闭包捕获的 createdField 仍是建字段前的旧值（null），靠它判断会误关向导。
  const createdRef = useRef(null);

  // step1：复用 StateFieldEditor 创建字段。保存成功 → 推进到 step2；
  // 其内部随后调用的 onClose 因 createdRef 已置位而放行（不取消向导）。
  if (step === 1) {
    return (
      <StateFieldEditor
        field={null}
        scope={scopeKey}
        onSave={async (payload) => {
          const created = await scope.createFn(worldId, payload);
          const field = created ?? { field_key: payload.field_key, label: payload.label, type: payload.type };
          createdRef.current = field;
          setCreatedField(field);
          setStep(2);
        }}
        onClose={() => { if (!createdRef.current) onClose(); }}
      />
    );
  }

  if (step === 2) {
    return (
      <WizardShell title={`设置各${scope.label}默认值`} step={2}
        onClose={onClose}
        footer={(
          <>
            <Button variant="ghost" onClick={() => onFinish(createdField?.field_key)}>
              跳过，不配条目
            </Button>
            <Button variant="primary" onClick={() => setStep(3)}>下一步：配触发条目</Button>
          </>
        )}
      >
        <DefaultValueMatrix worldId={worldId} scope={scope} field={createdField} />
      </WizardShell>
    );
  }

  // step3：复用 EntryEditor，预填刚建字段为条件
  return (
    <EntryEditor
      worldId={worldId}
      entry={null}
      defaultTriggerType="state"
      prefillCondition={{ scope: scope.cnScope, field_label: createdField.label }}
      onClose={() => onFinish(createdField?.field_key)}
      onSave={() => onFinish(createdField?.field_key)}
    />
  );
}

function WizardShell({ title, step, children, footer, onClose }) {
  useEscapeKey(onClose);
  return (
    <div className="fixed inset-0 z-[var(--we-z-modal)] flex items-center justify-center we-modal-backdrop px-4">
      <div className="we-dialog-panel w-full max-w-2xl flex flex-col max-h-[90vh]">
        <div className="we-dialog-header flex items-center justify-between">
          <h2 className="flex items-center gap-3">新建系统<StepTrack steps={3} current={step - 1} /></h2>
          <Button size="sm" variant="ghost" onClick={onClose}>关闭</Button>
        </div>
        <div className="we-dialog-body flex flex-col gap-4">
          <p className="we-workshop-section-title">{title}</p>
          {children}
        </div>
        <div className="we-dialog-footer">{footer}</div>
      </div>
    </div>
  );
}
