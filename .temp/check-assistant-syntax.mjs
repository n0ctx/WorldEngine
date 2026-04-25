import { execFileSync } from 'node:child_process';

const files = [
  'assistant/client/api.js',
  'assistant/client/history.js',
  'assistant/client/useAssistantStore.js',
  'assistant/server/routes.js',
  'assistant/server/agent-factory.js',
  'assistant/server/main-agent.js',
  'assistant/server/tools/extract-json.js',
  'assistant/server/tools/project-reader.js',
  'assistant/server/tools/card-preview.js',
  'assistant/server/agents/index.js',
  'assistant/server/agents/world-card.js',
  'assistant/server/agents/character-card.js',
  'assistant/server/agents/persona-card.js',
  'assistant/server/agents/global-prompt.js',
  'assistant/server/agents/css-snippet.js',
  'assistant/server/agents/regex-rule.js',
];

for (const file of files) {
  execFileSync(process.execPath, ['--check', file], { stdio: 'inherit' });
}
