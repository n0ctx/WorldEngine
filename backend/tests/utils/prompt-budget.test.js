import test from 'node:test';
import assert from 'node:assert/strict';

import { enforcePromptBudget } from '../../utils/prompt-budget.js';
import { buildContinuationMessages } from '../../app/turn/continuation-messages.js';
import { countContextTokens } from '../../utils/token-counter.js';

test('generation budget removes oldest history while preserving system instructions and current input', () => {
  const requiredSystem = 'Required role and safety instructions';
  const currentInput = '<user_input>Keep this exact player request.</user_input>';
  const messages = [
    { role: 'system', content: requiredSystem },
    { role: 'user', content: 'old'.repeat(200) },
    { role: 'assistant', content: 'history'.repeat(200) },
    { role: 'user', content: currentInput },
  ];

  const fitted = enforcePromptBudget(messages, { contextLimit: 100, maxTokens: 20, mode: 'chat' });

  assert.equal(fitted.messages[0].content, requiredSystem);
  assert.equal(fitted.messages.at(-1).content, currentInput);
  assert.ok(fitted.inputTokens <= fitted.inputLimit);
  assert.equal(fitted.outputReservation, 20);
  assert.ok(fitted.messages.length < messages.length);
  assert.ok(countContextTokens(fitted.messages) + fitted.outputReservation <= fitted.contextLimit);
});

test('optional evidence is removed before required instruction and user input are changed', () => {
  const messages = [
    { role: 'system', content: '<context_guide>Required instructions</context_guide>' },
    { role: 'user', content: '<expanded_dialogues>optional evidence</expanded_dialogues>\n\n<user_input>Keep this</user_input>\n\nRequired post instruction' },
  ];
  const fitted = enforcePromptBudget(messages, {
    contextLimit: 48, maxTokens: 10, mode: 'chat',
    withoutOptional: () => [messages[0], { role: 'user', content: '<user_input>Keep this</user_input>\n\nRequired post instruction' }],
  });

  assert.equal(fitted.messages[0].content, messages[0].content);
  assert.doesNotMatch(fitted.messages[1].content, /optional evidence|expanded_dialogues/);
  assert.match(fitted.messages[1].content, /<user_input>Keep this<\/user_input>/);
  assert.match(fitted.messages[1].content, /Required post instruction/);
  assert.ok(fitted.inputTokens <= fitted.inputLimit);
});

test('unfit protected current input fails before send without truncating it', () => {
  const currentInput = '玩家原文'.repeat(100);
  assert.throws(
    () => enforcePromptBudget([
      { role: 'system', content: 'Required instructions' },
      { role: 'user', content: currentInput },
    ], { contextLimit: 30, maxTokens: 10, mode: 'writing' }),
    /Prompt budget exceeded for writing: protected request needs approximately/,
  );
  assert.throws(
    () => enforcePromptBudget([{ role: 'user', content: 'input' }], { contextLimit: 10, maxTokens: 10 }),
    /output tokens leave no input capacity/,
  );
});

test('continuation instruction is included in final request budget; provider output reservation remains maxTokens', () => {
  const continueMessages = buildContinuationMessages([
    { role: 'system', content: 'Required instructions' },
    { role: 'user', content: 'Old input' },
    { role: 'assistant', content: 'The response to continue' },
  ], 'The response to continue', { usePrefill: false });
  const fitted = enforcePromptBudget(continueMessages, { contextLimit: 160, maxTokens: 32, mode: 'chat continuation' });

  assert.match(fitted.messages.at(-1).content, /继续/);
  assert.ok(fitted.inputTokens + 32 <= 160);
  assert.equal(fitted.outputReservation, 32);
});
