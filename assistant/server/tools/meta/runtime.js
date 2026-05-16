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
} from './index.js';

export function buildMetaTools(task, emitFn, runId = null, options = {}) {
  const MIN_PLAN_STEPS = 3;
  const writePlanDoc = {
    definition: writePlanDocDefinition,
    execute: async (args) => {
      try {
        if (options.planAlreadyApproved || options.planExecutionApproved) {
          return {
            success: false,
            error: '当前计划已批准，继续 dispatch_subagent 或 reply_to_user，不要重新提交计划。',
          };
        }
        const steps = (args.steps ?? []).map((s, i) => ({
          id: s.id ?? `step-${i + 1}`,
          title: s.title,
          targetType: s.targetType,
          operation: s.operation,
          dependsOn: s.dependsOn ?? [],
          task: s.task,
          done: false,
        }));
        if (steps.length < MIN_PLAN_STEPS) {
          return {
            success: false,
            error: [
              `write_plan_doc 至少需要 ${MIN_PLAN_STEPS} 个可执行步骤。`,
              '如果任务只能拆成 1-2 个动作，请直接 dispatch_subagent 执行；',
              '如果这是复杂任务，请拆出读取/确认、定义或定位、分组写入、核对验收等真实依赖步骤后再提交计划。',
            ].join(''),
          };
        }
        const nowIso = new Date().toISOString();
        const md = planDoc.renderPlanDoc({
          title: args.title,
          status: 'awaiting_approval',
          createdAt: nowIso,
          updatedAt: nowIso,
          intent: args.intent,
          assumptions: planDoc.normalizePlanDocList(args.assumptions ?? []),
          steps,
        });
        const validation = planDoc.validatePlanDoc(md);
        if (!validation.valid) {
          return { success: false, error: `计划文档格式校验失败：${validation.error}，请修正后重试` };
        }
        // write_plan_doc 表示"提交全新方案"——先显式清掉上一份方案（被拒绝的、已完成的或废弃的），
        // 再写入新方案；既保证 planDocContent / file 不残留旧数据，也清掉 PLAN_REJECTED 等遗留 error 标记。
        // （writePlanDoc 本身就会覆盖文件，这里加 delete 是为了把意图说明白，并顺带把 task.error 清零。）
        await planDoc.deletePlanDoc(task.id);
        await planDoc.writePlanDoc(task.id, md);
        taskStore.setApprovalCheckpoint(task.id, {
          at: Date.now(),
          title: args.title,
          stepCount: steps.length,
          status: 'pending',
        });
        taskStore.setStatus(task.id, 'awaiting_approval', { error: null });
        emitFn({ type: SSE_EVENTS.PLAN_DOC_UPDATED, taskId: task.id, content: md });
        emitFn({ type: SSE_EVENTS.AWAITING_APPROVAL, taskId: task.id });
        throw new ToolLoopControlSignal(TOOL_LOOP_SIGNAL.AWAITING_APPROVAL, { taskId: task.id });
      } catch (err) {
        if (err instanceof ToolLoopControlSignal) throw err;
        return { success: false, error: err.message };
      }
    },
  };

  const editPlanDoc = {
    definition: editPlanDocDefinition,
    execute: async (args) => {
      try {
        if (args.op === 'replace_steps' && options.planExecutionApproved) {
          return {
            success: false,
            error: '当前计划已批准并开始执行，不要在执行中重写未完成步骤或重新发起审批。',
          };
        }
        let md = await planDoc.readPlanDoc(task.id);
        if (args.op === 'mark_done') {
          if (!args.stepId) return { success: false, error: 'mark_done 需要 stepId' };
          md = planDoc.markStepDone(md, args.stepId, new Date().toISOString().slice(11, 19));
        } else if (args.op === 'replace_steps') {
          if (!Array.isArray(args.steps)) return { success: false, error: 'replace_steps 需要 steps 数组' };
          const parsed = planDoc.parsePlanDoc(md);
          const doneSteps = parsed.steps.filter((s) => s.done);
          const doneIds = new Set(doneSteps.map((s) => s.id));
          if (args.steps.length < MIN_PLAN_STEPS) {
            return {
              success: false,
              error: `replace_steps 至少需要 ${MIN_PLAN_STEPS} 个未完成步骤，避免把复杂任务缩回 1-2 步伪计划。`,
            };
          }
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
            createdAt: parsed.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            intent: parsed.intent ?? '',
            assumptions: parsed.assumptions ?? [],
            steps: [...doneSteps, ...incoming],
          });
          const validation = planDoc.validatePlanDoc(md);
          if (!validation.valid) {
            return { success: false, error: `计划文档校验失败：${validation.error}，请检查 steps 字段是否完整` };
          }
        } else {
          return { success: false, error: `unknown op: ${args.op}` };
        }
        await planDoc.writePlanDoc(task.id, md);
        emitFn({ type: SSE_EVENTS.PLAN_DOC_UPDATED, taskId: task.id, content: md });
        // replace_steps 更新了未完成步骤，需重新等待用户审批
        if (args.op === 'replace_steps') {
          taskStore.setApprovalCheckpoint(task.id, {
            at: Date.now(),
            title: parsedPlanTitle(md),
            stepCount: args.steps.length,
            status: 'pending',
          });
          taskStore.setStatus(task.id, 'awaiting_approval', { error: null });
          emitFn({ type: SSE_EVENTS.AWAITING_APPROVAL, taskId: task.id });
          throw new ToolLoopControlSignal(TOOL_LOOP_SIGNAL.AWAITING_APPROVAL, { taskId: task.id });
        }
        return { success: true };
      } catch (err) {
        if (err instanceof ToolLoopControlSignal) throw err;
        return { success: false, error: err.message };
      }
    },
  };

  const dispatchSubagent = {
    definition: dispatchSubagentDefinition,
    execute: async (args) => {
      try {
        if (options.planApprovalPending) {
          return {
            success: false,
            error: [
              '当前计划还在等待用户审批，不能直接执行子任务。',
              '如需改方案，请继续 write_plan_doc 或 edit_plan_doc.replace_steps；只有用户确认后才能 dispatch_subagent。',
            ].join(''),
          };
        }
        if (options.planRejectedNeedsRewrite) {
          return {
            success: false,
            error: [
              '上一版计划已被用户拒绝，当前计划不能直接执行。',
              '请先调用 write_plan_doc 提交全新方案，或用 edit_plan_doc.replace_steps 更新未完成步骤并重新进入审批。',
            ].join(''),
          };
        }
        if (options.requiresPlanFirst && !options.planDocExists && !args.stepId) {
          return {
            success: false,
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
          if (!step) return { success: false, error: `step not found: ${args.stepId}` };
          if (step.done) return { success: false, error: `step already done: ${args.stepId}` };
        }
        const resolved = step ?? {
          id: args.stepId ?? `adhoc-${Date.now()}`,
          title: args.task?.slice(0, 24) || '临时子任务',
          targetType: args.targetType,
          operation: args.operation,
          dependsOn: args.entityRef ? [args.entityRef] : [],
          task: args.task,
        };
        if (!resolved.targetType || !resolved.task) {
          return { success: false, error: 'dispatch_subagent 需要 stepId，或直接提供 targetType + task' };
        }
        // 早期版本会把缺省 operation 静默回退到 'update'，导致用户说"新建一张卡"时直接覆盖现卡。
        // 这里对 ad-hoc 与 plan-step 两条路径统一校验 resolved.operation。
        if (!resolved.operation) {
          return {
            success: false,
            error: 'dispatch_subagent 必须显式传 operation（create / update / delete）；不要省略，也不要默认 update。如果是要新建一张全新的卡，请传 operation:"create" 且不要带 entityRef。',
          };
        }
        if (!['create', 'update', 'delete'].includes(resolved.operation)) {
          return { success: false, error: `dispatch_subagent operation 非法："${resolved.operation}"，只接受 create / update / delete。` };
        }
        // create 不允许带 entityRef：否则子代理会拿到一个"现有资源 ID"，
        // 在 system prompt + 上下文双重暗示下极易退化为 update 覆盖该资源。
        if (resolved.operation === 'create' && resolved.dependsOn?.length > 0) {
          return {
            success: false,
            error: `dispatch_subagent operation:"create" 不能携带 entityRef / dependsOn（收到 ${JSON.stringify(resolved.dependsOn)}）。新建资源不依赖某张现有卡；如果你其实是想改动这张已有的卡，请改成 operation:"update"。`,
          };
        }
        // 检测 task 字段疑似被 LLM 截断（以中/英文冒号结尾），避免子代理拿到不完整指令后白跑一次
        if (/[：:]\s*$/.test(resolved.task.trim())) {
          return {
            success: false,
            error: `dispatch_subagent 的 task 字段疑似被截断（结尾为"："，缺少具体操作内容）。请补全操作指令后重试。`,
          };
        }

        if (resolved.operation === 'create' && !args.force) {
          const dup = taskStore.findAppliedResource(task.id, (e) =>
            e.kind === resolved.targetType && e.op === 'create');
          if (dup) {
            return {
              success: false,
              error: `本轮已经成功创建过 ${resolved.targetType}（${dup.name ?? dup.refId ?? '上一条记录'}）。若用户明确还要再建一张，请在 task 字段说明差异并加 force:true；否则用 reply_to_user 告知用户已完成。`,
            };
          }
        }
        // 解析 dependsOn 中的 step 引用 → 实际资源 ID
        // step-N 或 step:N 格式是计划步骤 ID，不能直接当 entityId 使用；需从 appliedResources 取回真实 UUID
        let entityRefForDispatch = resolved.dependsOn?.[0] ?? null;
        if (entityRefForDispatch && /^step[-:]\d+$/i.test(entityRefForDispatch)) {
          const normalizedStepId = entityRefForDispatch.replace(':', '-');
          const applied = taskStore.findAppliedResource(task.id, (e) => e.stepId === normalizedStepId);
          if (applied?.refId) {
            entityRefForDispatch = applied.refId;
          } else {
            return {
              success: false,
              error: `entityRef "${entityRefForDispatch}" 引用了步骤 ${normalizedStepId}，但该步骤尚未成功落库或无资源 ID。请先确认依赖步骤已完成，或直接在 task 中指定目标资源 ID。`,
            };
          }
        }

        taskStore.setCurrentStep(task.id, resolved.id);
        emitFn({ type: SSE_EVENTS.STEP_STARTED, taskId: task.id, stepId: resolved.id, title: resolved.title });
        let outcome;
        // pendingPauseSignal：延迟到 setLastSubagentResult 之后再抛，避免 ToolLoopControlSignal 在内层 catch 被吞噬
        let pendingPauseSignal = null;
        try {
          const result = await dispatchSubAgent({
            stepId: resolved.id,
            targetType: resolved.targetType,
            operation: resolved.operation,
            entityRef: entityRefForDispatch,
            task: resolved.task,
            context: task.context,
            taskId: task.id,
            emitFn,
            runId,
            cancelCheck: () => task.status === 'cancelled',
            onApplied: (entry) => taskStore.recordAppliedResource(task.id, { ...entry, stepId: resolved.id }),
          });
          if (result?.success === false) {
            emitFn({ type: SSE_EVENTS.STEP_FAILED, taskId: task.id, stepId: resolved.id, error: result.error ?? 'unknown' });
            const errDetail = result.error ?? 'subagent reported failure';
            outcome = { success: false, error: errDetail };
            pendingPauseSignal = new ToolLoopControlSignal(TOOL_LOOP_SIGNAL.PAUSED, {
              reason: 'subagent_failed',
              stepId: resolved.id,
              title: resolved.title,
              error: errDetail,
              message: [
                `子任务"${resolved.title}"执行失败（${errDetail}）。`,
                '我先暂停，等你确认是要改参数、改计划，还是换一种方式继续。',
              ].join(''),
            });
          } else {
            emitFn({ type: SSE_EVENTS.STEP_COMPLETED, taskId: task.id, stepId: resolved.id, result });
            outcome = { success: true, summary: result?.summary ?? '' };
          }
        } catch (err) {
          emitFn({ type: SSE_EVENTS.STEP_FAILED, taskId: task.id, stepId: resolved.id, error: err.message });
          outcome = { success: false, error: err.message };
        } finally {
          taskStore.setCurrentStep(task.id, null);
        }
        taskStore.setLastSubagentResult(task.id, {
          stepId: resolved.id,
          title: resolved.title,
          success: outcome.success,
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
        // 子代理失败信号：在所有收尾记录完成后统一抛出，让外层 runParentAgent 正确处理暂停
        if (pendingPauseSignal) throw pendingPauseSignal;
        return outcome;
      } catch (err) {
        if (err instanceof ToolLoopControlSignal) throw err;
        return { success: false, error: err.message };
      }
    },
  };

  const deletePlanDocTool = {
    definition: deletePlanDocDefinition,
    execute: async () => {
      try {
        await planDoc.deletePlanDoc(task.id);
        taskStore.setApprovalCheckpoint(task.id, null);
        return { success: true };
      } catch (err) {
        return { success: false, error: err.message };
      }
    },
  };

  return [writePlanDoc, editPlanDoc, dispatchSubagent, deletePlanDocTool];
}

function parsedPlanTitle(md) {
  const match = String(md ?? '').match(/^#\s*任务：(.+)$/m);
  return match?.[1]?.trim() || '计划草案';
}
