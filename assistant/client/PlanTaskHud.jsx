/**
 * 写卡助手任务进度 HUD
 *
 * 挂载于输入框正上方，紧凑展示当前 plan_doc 中的任务勾选状态。
 * 全部勾选完成 / 任务进入终态时返回 null，不残留。
 */

import { useMemo } from 'react';
import { useAssistantStore } from './useAssistantStore.js';
import { parseTaskLines } from './plan-doc-utils.js';

const MAX_VISIBLE = 6;
// HUD 只在"计划已批准、正在或可继续执行"时显示：
//   - awaiting_approval：用户尚未确认计划，不亮 HUD
//   - 终态 + idle：没有可执行的计划
//   - paused + error === PLAN_REJECTED_PAUSE_REASON：计划被拒，等用户重新沟通修改方案
const HIDDEN_STATUSES = new Set(['completed', 'cancelled', 'failed', 'idle', 'awaiting_approval']);
const PLAN_REJECTED_PAUSE_REASON = 'plan rejected by user';

export default function PlanTaskHud() {
  const planDoc = useAssistantStore((s) => s.planDoc);
  const status = useAssistantStore((s) => s.status);
  const error = useAssistantStore((s) => s.error);

  const tasks = useMemo(() => parseTaskLines(planDoc), [planDoc]);
  const total = tasks.length;
  const done = tasks.filter((t) => t.checked).length;

  if (HIDDEN_STATUSES.has(status)) return null;
  if (status === 'paused' && error === PLAN_REJECTED_PAUSE_REASON) return null;
  if (total === 0) return null;
  if (done >= total) return null;

  const pct = Math.round((done / total) * 100);
  const visible = tasks.slice(0, MAX_VISIBLE);
  const overflow = total - visible.length;

  return (
    <div className="flex flex-shrink-0 flex-col gap-1 border-t border-black/10 bg-[var(--we-paper-aged)] px-3 py-2 text-[12px] leading-relaxed text-[var(--we-ink-primary)]">
      <div className="flex items-center gap-2 text-[11px] text-[var(--we-ink-muted)]">
        <span className="font-medium text-[var(--we-ink-primary)]">任务进度 {done}/{total}</span>
        <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-black/10">
          <div
            className="absolute inset-y-0 left-0 bg-[var(--we-vermilion)] transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span>{pct}%</span>
      </div>
      <ul className="m-0 list-none p-0">
        {visible.map((t, i) => (
          <li
            key={i}
            className={
              'flex items-start gap-1.5 ' +
              (t.checked ? 'text-[var(--we-ink-muted)] line-through opacity-70' : '')
            }
          >
            <span aria-hidden="true" className="mt-[1px] text-[var(--we-vermilion)]">
              {t.checked ? '☑' : '☐'}
            </span>
            <span className="min-w-0 flex-1 truncate">{t.text}</span>
          </li>
        ))}
        {overflow > 0 && (
          <li className="mt-0.5 text-[11px] text-[var(--we-ink-muted)]">
            还有 {overflow} 项…
          </li>
        )}
      </ul>
    </div>
  );
}
