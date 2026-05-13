import { ToolLoopControlSignal, TOOL_LOOP_SIGNAL } from '../../../../backend/llm/tool-loop-control.js';

import * as planDoc from '../../plan-doc.js';
import * as taskStore from '../../task-store.js';
import { dispatchSubAgent } from '../../sub-agent.js';
import { SSE_EVENTS } from '../../sse-events.js';
import {
  writePlanDocDefinition,
  editPlanDocDefinition,
  dispatchSubagentDefinition,
  deletePlanDocDefinition,
  finalizeTaskDefinition,
} from './index.js';

function unescapeLiteralWhitespace(s) {
  if (typeof s !== 'string') return s;
  return s
    .replace(/\\r\\n/g, '\n')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\n')
    .replace(/\\t/g, '\t');
}

export function buildMetaTools(task, emitFn, runId = null, options = {}) {
  const writePlanDoc = {
    definition: writePlanDocDefinition,
    execute: async (args) => {
      try {
        const steps = (args.steps ?? []).map((s, i) => ({
          id: s.id ?? `step-${i + 1}`,
          title: s.title,
          targetType: s.targetType,
          operation: s.operation,
          dependsOn: s.dependsOn ?? [],
          task: s.task,
          done: false,
        }));
        const md = planDoc.renderPlanDoc({
          title: args.title,
          status: 'awaiting_approval',
          createdAt: new Date().toISOString(),
          intent: args.intent,
          assumptions: args.assumptions ?? [],
          steps,
          log: [],
        });
        const validation = planDoc.validatePlanDoc(md);
        if (!validation.valid) {
          return { ok: false, error: `计划文档格式校验失败：${validation.error}，请修正后重试` };
        }
        await planDoc.writePlanDoc(task.id, md);
        taskStore.setApprovalCheckpoint(task.id, {
          at: Date.now(),
          title: args.title,
          stepCount: steps.length,
        });
        taskStore.setStatus(task.id, 'awaiting_approval');
        emitFn({ type: SSE_EVENTS.PLAN_DOC_UPDATED, taskId: task.id, content: md });
        emitFn({ type: SSE_EVENTS.AWAITING_APPROVAL, taskId: task.id });
        throw new ToolLoopControlSignal(TOOL_LOOP_SIGNAL.AWAITING_APPROVAL, { taskId: task.id });
      } catch (err) {
        if (err instanceof ToolLoopControlSignal) throw err;
        return { ok: false, error: err.message };
      }
    },
  };

  const editPlanDoc = {
    definition: editPlanDocDefinition,
    execute: async (args) => {
      try {
        let md = await planDoc.readPlanDoc(task.id);
        if (args.op === 'mark_done') {
          if (!args.stepId) return { ok: false, error: 'mark_done 需要 stepId' };
          md = planDoc.markStepDone(md, args.stepId, new Date().toISOString().slice(11, 19));
        } else if (args.op === 'append_log') {
          if (!args.line) return { ok: false, error: 'append_log 需要 line' };
          md = planDoc.appendLog(md, args.line);
        } else if (args.op === 'replace_steps') {
          if (!Array.isArray(args.steps)) return { ok: false, error: 'replace_steps 需要 steps 数组' };
          const parsed = planDoc.parsePlanDoc(md);
          const doneSteps = parsed.steps.filter((s) => s.done);
          const doneIds = new Set(doneSteps.map((s) => s.id));
          const allIdNums = parsed.steps
            .map((s) => parseInt(String(s.id ?? '').replace(/^step-/, ''), 10))
            .filter((n) => Number.isFinite(n));
          const maxIdNum = allIdNums.length > 0 ? Math.max(...allIdNums) : 0;
          const incoming = args.steps
            .filter((s) => !s.id || !doneIds.has(s.id))
            .map((s, i) => ({
              id: s.id ?? `step-${maxIdNum + i + 1}`,
              title: s.title,
              targetType: s.targetType,
              operation: s.operation,
              dependsOn: s.dependsOn ?? [],
              task: s.task,
              done: false,
              completedAt: null,
            }));
          md = planDoc.renderPlanDoc({
            title: parsed.title,
            status: parsed.status,
            createdAt: new Date().toISOString(),
            intent: '',
            assumptions: [],
            steps: [...doneSteps, ...incoming],
            log: [],
          });
        } else {
          return { ok: false, error: `unknown op: ${args.op}` };
        }
        await planDoc.writePlanDoc(task.id, md);
        emitFn({ type: SSE_EVENTS.PLAN_DOC_UPDATED, taskId: task.id, content: md });
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
  };

  const dispatchSubagent = {
    definition: dispatchSubagentDefinition,
    execute: async (args) => {
      try {
        if (options.requiresPlanFirst && !options.planDocExists && !args.stepId) {
          return {
            ok: false,
            error: [
              '当前用户请求属于复杂 / 高风险 / 结构化体系任务，必须先调用 write_plan_doc 拆成可审批步骤。',
              '不要直接 dispatch_subagent。',
              '计划至少包含：读取/确认现状、定义字段或条目、创建或定位目标资源、分组写入、最终核对。',
            ].join(''),
          };
        }
        let step = null;
        if (args.stepId) {
          const md = await planDoc.readPlanDoc(task.id);
          const parsed = planDoc.parsePlanDoc(md);
          step = parsed.steps.find((s) => s.id === args.stepId);
          if (!step) return { ok: false, error: `step not found: ${args.stepId}` };
          if (step.done) return { ok: false, error: `step already done: ${args.stepId}` };
        }
        const resolved = step ?? {
          id: args.stepId ?? `adhoc-${Date.now()}`,
          title: args.task?.slice(0, 24) || '临时子任务',
          targetType: args.targetType,
          operation: args.operation ?? 'update',
          dependsOn: args.entityRef ? [args.entityRef] : [],
          task: args.task,
        };
        if (!resolved.targetType || !resolved.task) {
          return { ok: false, error: 'dispatch_subagent 需要 stepId，或直接提供 targetType + task' };
        }

        if (resolved.operation === 'create' && !args.force) {
          const dup = taskStore.findAppliedResource(task.id, (e) =>
            e.kind === resolved.targetType && e.op === 'create');
          if (dup) {
            return {
              ok: false,
              error: `本轮已经成功创建过 ${resolved.targetType}（${dup.name ?? dup.refId ?? '上一条记录'}）。若用户明确还要再建一张，请在 task 字段说明差异并加 force:true；否则用 reply_to_user 告知用户已完成。`,
            };
          }
        }
        taskStore.setCurrentStep(task.id, resolved.id);
        emitFn({ type: SSE_EVENTS.STEP_STARTED, taskId: task.id, stepId: resolved.id, title: resolved.title });
        let outcome;
        try {
          const result = await dispatchSubAgent({
            stepId: resolved.id,
            targetType: resolved.targetType,
            operation: resolved.operation,
            entityRef: resolved.dependsOn?.[0] ?? null,
            task: resolved.task,
            context: task.context,
            emitFn,
            runId,
            cancelCheck: () => task.status === 'cancelled',
            onApplied: (entry) => taskStore.recordAppliedResource(task.id, { ...entry, stepId: resolved.id }),
          });
          if (result?.success === false) {
            emitFn({ type: SSE_EVENTS.STEP_FAILED, taskId: task.id, stepId: resolved.id, error: result.error ?? 'unknown' });
            outcome = { ok: false, error: result.error ?? 'subagent reported failure' };
          } else {
            emitFn({ type: SSE_EVENTS.STEP_COMPLETED, taskId: task.id, stepId: resolved.id, result });
            outcome = { ok: true, summary: result?.summary ?? '' };
          }
        } catch (err) {
          emitFn({ type: SSE_EVENTS.STEP_FAILED, taskId: task.id, stepId: resolved.id, error: err.message });
          outcome = { ok: false, error: err.message };
        } finally {
          taskStore.setCurrentStep(task.id, null);
        }
        taskStore.setLastSubagentResult(task.id, {
          stepId: resolved.id,
          title: resolved.title,
          ok: outcome.ok,
          summary: outcome.summary ?? null,
          error: outcome.error ?? null,
          at: Date.now(),
        });

        const pending = taskStore.takeUserMessages(task.id);
        const pauseRequested = taskStore.consumePauseAfterCurrentStep(task.id);
        if (pending.length > 0 || pauseRequested) {
          taskStore.setStatus(task.id, 'paused');
          emitFn({ type: SSE_EVENTS.PAUSED, taskId: task.id });
          for (const m of pending) {
            taskStore.appendMessage(task.id, { role: 'user', content: m });
          }
          throw new ToolLoopControlSignal(TOOL_LOOP_SIGNAL.PAUSED, {
            taskId: task.id,
            pendingMessages: pending,
            pauseReason: pauseRequested && pending.length === 0 ? 'detach' : 'user_message',
            outcome,
          });
        }
        return outcome;
      } catch (err) {
        if (err instanceof ToolLoopControlSignal) throw err;
        return { ok: false, error: err.message };
      }
    },
  };

  const deletePlanDocTool = {
    definition: deletePlanDocDefinition,
    execute: async () => {
      try {
        await planDoc.deletePlanDoc(task.id);
        taskStore.setApprovalCheckpoint(task.id, null);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: err.message };
      }
    },
  };

  const finalizeTask = {
    definition: finalizeTaskDefinition,
    execute: async (args) => {
      try {
        taskStore.setStatus(task.id, args.terminalStatus);
        const summary = unescapeLiteralWhitespace(args.summary);
        taskStore.appendMessage(task.id, { role: 'assistant', content: summary });
        const eventType = args.terminalStatus === 'completed'
          ? SSE_EVENTS.TASK_COMPLETED
          : args.terminalStatus === 'failed'
            ? SSE_EVENTS.TASK_FAILED
            : SSE_EVENTS.TASK_CANCELLED;
        emitFn({ type: eventType, taskId: task.id, summary });
        throw new ToolLoopControlSignal(TOOL_LOOP_SIGNAL.TERMINAL, {
          taskId: task.id,
          terminalStatus: args.terminalStatus,
          summary,
        });
      } catch (err) {
        if (err instanceof ToolLoopControlSignal) throw err;
        return { ok: false, error: err.message };
      }
    },
  };

  return [writePlanDoc, editPlanDoc, dispatchSubagent, deletePlanDocTool, finalizeTask];
}
