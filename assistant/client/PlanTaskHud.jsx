/**
 * 写卡助手任务进度 HUD
 *
 * 挂载于输入框正上方，紧凑展示当前 plan_doc 中的任务勾选状态。
 * 全部勾选完成 / 任务进入终态时返回 null，不残留。
 *
 * 视觉规则：
 *  - 未完成项在前，已完成项沉底
 *  - 当前执行项（第一个未完成）显示 pulse 微动画 + ▶ 标记
 *  - line-through 仅划文字，不划勾选框
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

  // 未完成项在前（执行顺序感），已完成项沉底（清晰区分完成状态）
  // useMemo 必须在所有 early return 之前调用（Rules of Hooks）
  const sorted = useMemo(
    () => [...tasks].sort((a, b) => {
      if (a.checked === b.checked) return 0;
      return a.checked ? 1 : -1;
    }),
    [tasks],
  );

  const total = tasks.length;
  const done = tasks.filter((t) => t.checked).length;

  if (HIDDEN_STATUSES.has(status)) return null;
  if (status === 'paused' && error === PLAN_REJECTED_PAUSE_REASON) return null;
  if (total === 0) return null;
  // 运行期间保持 HUD 可见（避免步骤完成时瞬间消失再出现的闪烁）；
  // 仅在非运行状态下才因 done >= total 隐藏。
  if (done >= total && status !== 'running') return null;

  const pct = Math.round((done / total) * 100);
  const visible = sorted.slice(0, MAX_VISIBLE);
  const overflow = total - visible.length;

  // 当前执行项：已排序后第一个未完成的任务
  const runningIndex = visible.findIndex((t) => !t.checked);

  return (
    <div className="flex flex-shrink-0 flex-col gap-1 border-t border-black/10 bg-[var(--we-color-bg-subtle)] px-3 py-2 text-[12px] leading-relaxed text-[var(--we-color-text-primary)]">
      <div className="flex items-center gap-2 text-[11px] text-[var(--we-color-text-tertiary)]">
        <span className="font-medium text-[var(--we-color-text-primary)]">任务进度 {done}/{total}</span>
        <div className="relative h-1 flex-1 overflow-hidden rounded-full bg-black/10">
          <div
            className="absolute inset-y-0 left-0 bg-[var(--we-color-accent)] transition-[width] duration-300 ease-out"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span>{pct}%</span>
      </div>
      <ul className="m-0 list-none p-0">
        {visible.map((t, i) => {
          const isRunning = i === runningIndex;
          // 去掉 **step-n** 前缀（含全角/半角变体），再循环去掉所有末尾的工具调用标注如 (world-card.update)／（world-card.update）
          const TOOL_SUFFIX_RE = /\s*[（(][a-z][a-z0-9]*(?:-[a-z0-9]+)*\.[a-z][a-z0-9-]*[）)]\s*$/i;
          let displayText = t.text.replace(/^\*{0,2}step-\d+\*{0,2}\s*/i, '');
          while (TOOL_SUFFIX_RE.test(displayText)) {
            displayText = displayText.replace(TOOL_SUFFIX_RE, '');
          }
          displayText = displayText.trim();
          return (
            <li
              key={i}
              className={`flex items-center gap-1.5 transition-opacity duration-200 ${
                t.checked ? 'opacity-40' : ''
              }`}
            >
              {isRunning ? (
                <span className="we-hud-spinner" aria-hidden="true" />
              ) : (
                <span
                  aria-hidden="true"
                  className={`flex-shrink-0 text-[11px] ${
                    t.checked ? 'text-[var(--we-color-text-tertiary)]' : 'text-[var(--we-color-text-disabled)]'
                  }`}
                >
                  {t.checked ? '☑' : '☐'}
                </span>
              )}
              <span
                className={`min-w-0 flex-1 truncate ${
                  t.checked ? 'line-through text-[var(--we-color-text-tertiary)]' : ''
                } ${isRunning ? 'we-hud-running-item font-medium' : ''}`}
              >
                {displayText}
              </span>
            </li>
          );
        })}
        {overflow > 0 && (
          <li className="mt-0.5 text-[11px] text-[var(--we-color-text-tertiary)]">
            还有 {overflow} 项…
          </li>
        )}
      </ul>
    </div>
  );
}
