import Icon from '../../../components/ui/Icon.jsx';
import TaskList from '../../../components/motion/TaskList.jsx';

// ── NewWorldGuide（新世界搭建引导）──────────────────────────────────────────
//
// 「新世界」判断标准：世界观描述 / 角色 / 规则三项是否都已存在内容，纯客观完成度，
// 不看创建时间——时间阈值会过期（老账号里几分钟前建的世界和半年前建的世界该一视同
// 仁），完成度不会。三项全部完成后引导自动消失，不再占位；未完成时即使用户来回
// 切换页面也会稳定复现，不会像"已读标记"那样过几天自己消失。
//
// 「关闭」与「完成」是两件独立的事：完成是可计算的客观状态，关闭是用户的主观选择
// （persisted 到 worlds.onboarding_dismissed）。关闭后即便三步仍未做完也不再弹出，
// 尊重用户"我知道，不用管我"的意愿；但反过来，只要三步真的做完了，引导必然消失，
// 不依赖是否点过关闭——不会出现「已经把三件事都做完了，却因为没点过关闭一直被打扰」
// 的情况。

const GUIDE_STEPS = [
  {
    key: 'world',
    title: '写一写这个世界观',
    hint: '这个世界是什么样的、发生在哪、有什么背景——写清楚了，AI 之后讲故事才不会跑偏。',
    action: '去填写',
  },
  {
    key: 'character',
    title: '加一个角色',
    hint: '角色是故事里会说话、会行动的人。加一个，你就有了对话或写作的对象。',
    action: '去创建',
  },
  {
    key: 'rule',
    title: '定一条这里的规则',
    hint: '规则是这个世界里「什么是真的」——比如没有魔法、货币是贝壳。定下来，AI 每次讲故事都会记得。',
    action: '去设定',
  },
];

export function NewWorldGuide({ completed, onStepClick, onDismiss }) {
  return (
    <div className="we-onboarding-guide" role="region" aria-label="新世界搭建引导">
      <div className="we-onboarding-guide-head">
        <div>
          <h2 className="we-onboarding-guide-title">先做这三件事，这个世界就活了</h2>
          <p className="we-onboarding-guide-subtitle">
            世界观、角色、规则是这个产品最重要的三块拼图，做完之后 AI 才知道该怎么陪你讲故事。
          </p>
        </div>
        <button
          type="button"
          className="we-onboarding-guide-skip"
          onClick={onDismiss}
        >
          跳过引导
        </button>
      </div>

      <TaskList
        className="we-onboarding-steps"
        itemClassName="we-onboarding-step"
        tasks={GUIDE_STEPS.map((step) => ({
          id: step.key,
          title: step.title,
          done: !!completed[step.key],
          onClick: () => onStepClick(step.key),
          detail: <span className="we-onboarding-step-hint">{step.hint}</span>,
          trailing: (
            <span className="we-onboarding-step-action">
              {completed[step.key] ? '回去改改' : step.action}
              <Icon size={16}>
                <polyline points="9 18 15 12 9 6" />
              </Icon>
            </span>
          ),
        }))}
      />
    </div>
  );
}
