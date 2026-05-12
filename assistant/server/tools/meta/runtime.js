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

export function buildMetaTools(task, emitFn, runId = null) {
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
        await planDoc.writePlanDoc(task.id, md);
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
        const md = await planDoc.readPlanDoc(task.id);
        const parsed = planDoc.parsePlanDoc(md);
        const step = parsed.steps.find((s) => s.id === args.stepId);
        if (!step) return { ok: false, error: `step not found: ${args.stepId}` };
        if (step.done) return { ok: false, error: `step already done: ${args.stepId}` };
        taskStore.setCurrentStep(task.id, step.id);
        emitFn({ type: SSE_EVENTS.STEP_STARTED, taskId: task.id, stepId: step.id, title: step.title });
        let outcome;
        try {
          const result = await dispatchSubAgent({
            stepId: step.id,
            targetType: step.targetType,
            operation: step.operation,
            entityRef: step.dependsOn[0] ?? null,
            task: step.task,
            context: task.context,
            emitFn,
            runId,
            cancelCheck: () => task.status === 'cancelled',
          });
          if (result?.success === false) {
            emitFn({ type: SSE_EVENTS.STEP_FAILED, taskId: task.id, stepId: step.id, error: result.error ?? 'unknown' });
            outcome = { ok: false, error: result.error ?? 'subagent reported failure' };
          } else {
            emitFn({ type: SSE_EVENTS.STEP_COMPLETED, taskId: task.id, stepId: step.id, result });
            outcome = { ok: true, summary: result?.summary ?? '' };
          }
        } catch (err) {
          emitFn({ type: SSE_EVENTS.STEP_FAILED, taskId: task.id, stepId: step.id, error: err.message });
          outcome = { ok: false, error: err.message };
        } finally {
          taskStore.setCurrentStep(task.id, null);
        }

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
