import { useRef, useState } from 'react';
import Button from '../../../components/ui/Button.jsx';
import Dialog from '../../../components/ui/Dialog.jsx';
import StateFieldEditor from '../../../components/state/StateFieldEditor';
import EntryEditor from '../../../components/state/EntryEditor';
import StepTrack from '../../../components/motion/StepTrack.jsx';
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
      <Dialog
        size="lg"
        title="新建系统"
        description={`设置各${scope.label}默认值`}
        onClose={onClose}
        bodyClassName="flex flex-col gap-4"
        footerStart={<StepTrack steps={3} current={1} />}
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
      </Dialog>
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
