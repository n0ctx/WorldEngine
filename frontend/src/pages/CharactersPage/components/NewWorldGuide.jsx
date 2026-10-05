import { ChevronRight } from 'lucide-react';
import Button from '../../../components/ui/Button.jsx';
import TaskList from '../../../components/motion/TaskList.jsx';
import { cardClassName } from '../../../components/ui/cardClassName.js';

// ── NewWorldGuide（新世界搭建引导）──────────────────────────────────────────
//
// 完成度判断与跳转见 hooks/useOnboardingGuide.js。

const GUIDE_STEPS = [
  {
    key: 'world',
    title: '写下这个世界的前提',
    hint: '这个世界是什么样的、发生在哪、有什么背景。它会存成一条「一直生效」的设定条目，AI 每次讲故事都会读到，才不会跑偏。',
    action: '去写',
  },
  {
    key: 'character',
    title: '加一个角色',
    hint: '角色是故事里会说话、会行动的人。加一个，你就有了对话或写作的对象。',
    action: '去创建',
  },
];

export function NewWorldGuide({ completed, onStepClick, onDismiss }) {
  return (
    <div className="we-onboarding-guide" role="region" aria-label="新世界搭建引导">
      <div className="we-onboarding-guide-head">
        <div>
          <h2 className="we-onboarding-guide-title">先做这两件事，这个世界就活了</h2>
          <p className="we-onboarding-guide-subtitle">
            世界前提和角色是故事最基本的两块，做完之后 AI 才知道该怎么陪你讲故事。
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="we-onboarding-guide-skip we-on-shell"
          onClick={onDismiss}
        >
          跳过引导
        </Button>
      </div>

      <TaskList
        className="we-onboarding-steps"
        itemClassName={cardClassName({ interactive: true, className: 'we-onboarding-step' })}
        tasks={GUIDE_STEPS.map((step) => ({
          id: step.key,
          title: step.title,
          done: !!completed[step.key],
          onClick: () => onStepClick(step.key),
          detail: <span className="we-onboarding-step-hint">{step.hint}</span>,
          trailing: (
            <span className="we-onboarding-step-action">
              {completed[step.key] ? '回去改改' : step.action}
              <ChevronRight size={16} />
            </span>
          ),
        }))}
      />
    </div>
  );
}
