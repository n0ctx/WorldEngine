import { ALL_AGENTS } from './agents/index.js';
import { createPreviewCardTool } from './tools/card-preview.js';
import { runAgentDefinition } from './agent-factory.js';
import { createLogger, formatMeta } from '../../backend/utils/logger.js';

const log = createLogger('as-exec', 'yellow');

const AGENT_BY_TARGET = Object.fromEntries(
  ALL_AGENTS.map((agent) => [agent.proposalType, agent]),
);

function cloneStep(step) {
  return {
    ...step,
    dependsOn: Array.isArray(step.dependsOn) ? [...step.dependsOn] : [],
  };
}

function isHighRiskStep(step) {
  return step.approvalPolicy === 'requires_step_approval'
    || step.operation === 'delete'
    || step.operation === 'update'
    || /删除|清空|覆盖/.test(step.task);
}

function resolveEntityRef(task, step) {
  const ref = step.entityRef;
  if (!ref) return null;
  if (ref === 'context.worldId') return task.context.worldId;
  if (ref === 'context.characterId') return task.context.characterId;
  if (typeof ref === 'string' && ref.startsWith('step:')) {
    const stepId = ref.slice(5);
    return task.artifacts?.[stepId]?.entityId ?? null;
  }
  return ref;
}

function canRunStep(task, step) {
  return (step.dependsOn || []).every((depId) => task.graph.find((candidate) => candidate.id === depId)?.status === 'completed');
}

function summarizeProposal(proposal) {
  const entryCount = Array.isArray(proposal.entryOps) ? proposal.entryOps.length : 0;
  const stateFieldCount = Array.isArray(proposal.stateFieldOps) ? proposal.stateFieldOps.length : 0;
  return {
    type: proposal.type,
    operation: proposal.operation,
    entityId: proposal.entityId ?? null,
    changeKeys: Object.keys(proposal.changes || {}),
    entryCount,
    stateFieldCount,
    explanation: proposal.explanation,
  };
}

export async function executeTaskSteps({
  task,
  normalizeProposal,
  applyProposal,
  emit,
  startFromStepId = null,
  autoApproveHighRisk = false,
}) {
  const previewCardTool = createPreviewCardTool({
    worldId: task.context.worldId,
    characterId: task.context.characterId,
    world: task.context.world ?? null,
    character: task.context.character ?? null,
  });

  let resumeGateOpened = !startFromStepId;
  for (const current of task.graph) {
    const step = cloneStep(current);
    if (step.status === 'completed') continue;
    if (!resumeGateOpened) {
      resumeGateOpened = step.id === startFromStepId;
      if (!resumeGateOpened) continue;
    }
    if (!canRunStep(task, step)) continue;

    current.status = 'running';
    log.info(`STEP START  ${formatMeta({
      taskId: task.id,
      stepId: step.id,
      targetType: step.targetType,
      operation: step.operation,
      highRisk: isHighRiskStep(step),
    })}`);
    emit({
      type: 'step_started',
      taskId: task.id,
      stepId: step.id,
      step: current,
    });

    const agent = AGENT_BY_TARGET[step.targetType];
    if (!agent) {
      current.status = 'failed';
      current.error = `不支持的 targetType: ${step.targetType}`;
      task.status = 'failed';
      task.error = current.error;
      log.warn(`STEP UNSUPPORTED  ${formatMeta({ taskId: task.id, stepId: step.id, targetType: step.targetType })}`);
      emit({
        type: 'step_failed',
        taskId: task.id,
        stepId: step.id,
        error: current.error,
        step: current,
      });
      return task;
    }

    const entityId = resolveEntityRef(task, step);
    try {
      let proposal = current.proposal;
      if (!proposal) {
        proposal = await runAgentDefinition(agent, {
          task: step.task,
          operation: step.operation,
          entityId,
          normalizeProposal,
          previewCardTool,
        });
        current.proposal = proposal;
        emit({
          type: 'step_proposal_ready',
          taskId: task.id,
          stepId: step.id,
          proposal,
          proposalSummary: summarizeProposal(proposal),
          step: current,
        });
      }

      if (isHighRiskStep(step) && !autoApproveHighRisk && !current.approved) {
        current.status = 'awaiting_approval';
        task.status = 'awaiting_step_approval';
        task.awaitingStepId = step.id;
        log.info(`STEP AWAIT_APPROVAL  ${formatMeta({ taskId: task.id, stepId: step.id, operation: step.operation })}`);
        emit({
          type: 'step_approval_requested',
          taskId: task.id,
          stepId: step.id,
          step: current,
        });
        return task;
      }

      const result = await applyProposal(current.proposal, entityId);
      current.status = 'completed';
      current.result = result;
      current.entityId = result?.id ?? entityId ?? null;
      task.artifacts[step.id] = {
        entityId: current.entityId,
        result,
        proposal,
      };
      if (!task.context.worldId && proposal.type === 'world-card' && proposal.operation === 'create' && current.entityId) {
        task.context.worldId = current.entityId;
      }
      if (!task.context.characterId && proposal.type === 'character-card' && proposal.operation === 'create' && current.entityId) {
        task.context.characterId = current.entityId;
      }
      log.info(`STEP DONE  ${formatMeta({
        taskId: task.id,
        stepId: step.id,
        type: proposal.type,
        operation: proposal.operation,
        entityId: current.entityId,
      })}`);
      emit({
        type: 'step_completed',
        taskId: task.id,
        stepId: step.id,
        result: current.result,
        step: current,
      });
    } catch (error) {
      current.status = 'failed';
      current.error = error.message;
      task.status = 'failed';
      task.error = error.message;
      log.error(`STEP FAIL  ${formatMeta({ taskId: task.id, stepId: step.id, error: error.message })}`);
      emit({
        type: 'step_failed',
        taskId: task.id,
        stepId: step.id,
        error: error.message,
        step: current,
      });
      return task;
    }
  }

  task.status = 'completed';
  task.awaitingStepId = null;
  log.info(`TASK DONE  ${formatMeta({ taskId: task.id, steps: task.graph.length })}`);
  emit({
    type: 'task_completed',
    taskId: task.id,
  });
  return task;
}
