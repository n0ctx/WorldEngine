#!/usr/bin/env node
/**
 * run.mjs — 上下文压缩的确定性对照评测（不连真实模型）
 *
 * 用法：
 *   node scripts/eval-context/run.mjs --repo <WorldEngine 检出目录> --out <结果.json>
 *        [--rounds 150] [--budget 2000] [--ctx 32768] [--restart-at 75] [--rollback-to 100] [--seed 7]
 *        [--fail compress,middle]   这些调用类型一律失败（维护模型持续不可用）
 *
 * 对给定检出目录启动一个独立的后端（临时数据目录，不碰真实数据），模型指向本目录的 fake-llm.mjs，
 * 用固定种子的虚构语料走完 --rounds 轮对话：中途在 --restart-at 轮后重启后端一次，结束后删掉第
 * --rollback-to+1 轮起的消息（回退），再发一轮，检查回退后的提示词里有没有被撤销剧情的事实。
 * 语料与摘要器都在本仓库（新版）里，新旧两版用同一份语料、同一个假模型和同一个 token 计数器。
 *
 * 结果是架构层面的度量：同一个确定性摘要器下各轮的主提示词规模、维护调用的次数与输入量、事实与未了承诺的保留率、
 * 回退后的污染、每轮耗时。不代表任何真实模型的摘要质量。
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';

import { buildStoryCorpus } from '../../backend/tests/helpers/story-corpus.js';
import { startFakeLlm } from './fake-llm.mjs';

const CHECKPOINTS = [25, 50, 75, 100, 125, 150];
const ROLLBACK_PROBE = '（第999轮）林遥停下脚步，回头看了一眼。';

function parseArgs(argv) {
  const args = { rounds: 150, budget: 2000, ctx: 32768, restartAt: 75, rollbackTo: 100, seed: 7 };
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i].replace(/^--/, '').replace(/-([a-z])/g, (_, c) => c.toUpperCase());
    args[key] = ['repo', 'out', 'fail'].includes(key) ? argv[i + 1] : Number(argv[i + 1]);
  }
  if (!args.repo || !args.out) throw new Error('需要 --repo 与 --out');
  return args;
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address();
  await new Promise((resolve) => server.close(resolve));
  return port;
}

async function startBackend(repo, dataDir, port) {
  const child = spawn(process.execPath, ['server.js'], {
    cwd: path.join(repo, 'backend'),
    env: { ...process.env, PORT: String(port), WE_DATA_DIR: dataDir, WE_LLM_RETRY_MAX: '0', NODE_ENV: 'production' },
    stdio: ['ignore', 'ignore', 'pipe'],
  });
  let stderr = '';
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  const base = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 200; i++) {
    try {
      if ((await fetch(`${base}/api/worlds`)).ok) return { child, base };
    } catch { /* 还没起来 */ }
    if (child.exitCode != null) throw new Error(`后端启动失败：${stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('后端启动超时');
}

async function stopBackend(backend) {
  if (backend.child.exitCode != null) return;
  await new Promise((resolve) => {
    backend.child.once('exit', resolve);
    backend.child.kill('SIGTERM');
  });
}

async function api(base, method, url, body) {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${method} ${url} → ${res.status} ${await res.text()}`);
  return res.status === 204 ? null : res.json();
}

/** 发一轮对话，读完 SSE（连接在本轮的后台记忆任务结束后才关闭） */
async function chat(base, sessionId, content) {
  const started = performance.now();
  const res = await fetch(`${base}/api/sessions/${sessionId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content }),
  });
  if (!res.ok) throw new Error(`chat → ${res.status} ${await res.text()}`);
  const events = [];
  const decoder = new TextDecoder();
  let buffer = '';
  for await (const chunk of res.body) {
    buffer += decoder.decode(chunk, { stream: true });
    for (const line of buffer.split('\n')) {
      if (line.startsWith('data: ')) {
        try { events.push(JSON.parse(line.slice(6))); } catch { /* 非 JSON 行 */ }
      }
    }
    buffer = buffer.slice(buffer.lastIndexOf('\n') + 1);
  }
  return { ms: performance.now() - started, failures: events.filter((event) => /failed|error/.test(event.type ?? '')) };
}

const factKey = (fact) => fact.text.replace(/^※/, '').replace(/。$/, '');

/** 第 k 轮主提示词里，k 之前的事实与当时仍未兑现的承诺各保住了多少 */
function retention(prompt, corpus, round) {
  const earlier = corpus.facts.filter((fact) => fact.round < round);
  const fulfilRound = new Map();
  for (const fact of corpus.facts.filter((item) => item.kind === 'fulfil')) {
    fulfilRound.set(fact.text.match(/对(.+?)的承诺/)[1] + fact.text.match(/已经(.+?)，/)[1], fact.round);
  }
  const openPromises = earlier.filter((fact) => fact.kind === 'promise' && !(fulfilRound.get(fact.who + fact.task) < round));
  const kept = (list) => list.filter((fact) => prompt.includes(factKey(fact))).length;
  return {
    facts: earlier.length,
    factsKept: kept(earlier),
    openPromises: openPromises.length,
    openPromisesKept: kept(openPromises),
    earlyFacts: earlier.filter((fact) => fact.round <= round / 2).length,
    earlyFactsKept: kept(earlier.filter((fact) => fact.round <= round / 2)),
  };
}

function percentile(values, p) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length === 0 ? null : Math.round(sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]);
}

function writeConfig(dataDir, fakePort, args) {
  fs.writeFileSync(path.join(dataDir, 'config.json'), JSON.stringify({
    llm: { provider: 'llamacpp', base_url: `http://127.0.0.1:${fakePort}`, model: 'fake-model', max_tokens: 1024 },
    short_term_token_budget: args.budget,
    memory_expansion_enabled: true,
    suggestion_enabled: false,
  }, null, 2));
}

/** 建世界、角色、会话，走完语料；在 restartAt 轮后重启一次后端。返回每轮耗时与仍在运行的后端 */
async function playCorpus(repo, dataDir, port, corpus, fake, args) {
  let backend = await startBackend(repo, dataDir, port);
  const world = await api(backend.base, 'POST', '/api/worlds', { name: '雾川（评测）', profile_defaults: { time: '1000-03-07' } });
  const character = await api(backend.base, 'POST', `/api/worlds/${world.id}/characters`, { name: '旁白', system_prompt: '你是这个故事的叙述者。' });
  const session = await api(backend.base, 'POST', `/api/characters/${character.id}/sessions`, {});
  const turns = [];
  for (const entry of corpus.rounds) {
    const { ms, failures } = await chat(backend.base, session.id, entry.user);
    await fake.idle();
    turns.push({ round: entry.round, ms, failures: failures.length });
    if (entry.round === args.restartAt) {
      await stopBackend(backend);
      backend = await startBackend(repo, dataDir, port);
    }
  }
  return { backend, session, turns };
}

/** 删掉第 rollbackTo+1 轮起的消息（回退），再发一轮探针 */
async function rollbackAndProbe(backend, session, fake, args) {
  const messages = await api(backend.base, 'GET', `/api/sessions/${session.id}/messages`);
  const cut = messages.find((msg) => msg.role === 'user' && msg.content.includes(`（第${args.rollbackTo + 1}轮）`));
  await api(backend.base, 'DELETE', `/api/sessions/${session.id}/messages/${cut.id}`);
  await chat(backend.base, session.id, ROLLBACK_PROBE);
  await fake.idle();
}

function auxStats(calls) {
  const aux = {};
  for (const call of calls.filter((item) => item.kind !== 'main')) {
    aux[call.kind] ??= { calls: 0, promptTokens: 0, failed: 0 };
    aux[call.kind].calls += 1;
    aux[call.kind].promptTokens += call.promptTokens;
    if (call.failed) aux[call.kind].failed += 1;
  }
  return aux;
}

function summarizeRun({ repo, args, corpus, calls, turns }) {
  const mainCalls = calls.filter((call) => call.kind === 'main');
  const mainByRound = new Map(mainCalls.filter((call) => call.round).map((call) => [call.round, call]));
  const probe = mainByRound.get(999);
  const keptKeys = new Set(corpus.facts.filter((fact) => fact.round <= args.rollbackTo).map(factKey));
  const undone = corpus.facts.filter((fact) => fact.round > args.rollbackTo && !keptKeys.has(factKey(fact)));
  const result = {
    repo,
    params: { rounds: args.rounds, budget: args.budget, contextLimit: args.ctx, restartAt: args.restartAt, rollbackTo: args.rollbackTo, seed: args.seed, fail: args.fail ?? null },
    checkpoints: CHECKPOINTS.filter((round) => round <= args.rounds).map((round) => ({
      round,
      promptTokens: mainByRound.get(round)?.promptTokens ?? null,
      ...retention(mainByRound.get(round)?.prompt ?? '', corpus, round),
    })),
    maxPromptTokens: Math.max(...mainCalls.map((call) => call.promptTokens)),
    aux: auxStats(calls),
    rollback: {
      undoneFacts: undone.length,
      leakedFacts: undone.filter((fact) => probe?.prompt.includes(factKey(fact))).length,
      probePromptTokens: probe?.promptTokens ?? null,
      factsKeptAfterRollback: retention(probe?.prompt ?? '', corpus, args.rollbackTo + 1),
    },
    turnMs: {
      p50: percentile(turns.map((turn) => turn.ms), 0.5),
      p95: percentile(turns.map((turn) => turn.ms), 0.95),
      last20p50: percentile(turns.slice(-20).map((turn) => turn.ms), 0.5),
    },
    turnFailures: turns.reduce((sum, turn) => sum + turn.failures, 0),
    promptTokensByRound: mainCalls.filter((call) => call.round && call.round !== 999).map((call) => [call.round, call.promptTokens]),
  };
  const prompts = Object.fromEntries([...CHECKPOINTS, 999].map((round) => [round, mainByRound.get(round)?.prompt ?? null]));
  return { result, prompts };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const repo = path.resolve(args.repo);
  const corpus = buildStoryCorpus({ rounds: args.rounds, seed: args.seed });
  const fake = await startFakeLlm({ corpus, contextLimit: args.ctx, failKinds: args.fail ? args.fail.split(',') : [] });
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'we-eval-context-'));
  writeConfig(dataDir, fake.port, args);
  const port = await freePort();
  try {
    const { backend, session, turns } = await playCorpus(repo, dataDir, port, corpus, fake, args);
    await rollbackAndProbe(backend, session, fake, args);
    await stopBackend(backend);
    const { result, prompts } = summarizeRun({ repo, args, corpus, calls: fake.calls, turns });
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(args.out, JSON.stringify(result, null, 2));
    fs.writeFileSync(args.out.replace(/\.json$/, '.prompts.json'), JSON.stringify(prompts, null, 2));
    const { promptTokensByRound: _byRound, ...brief } = result;
    console.log(JSON.stringify(brief, null, 2));
  } finally {
    await fake.close();
    fs.rmSync(dataDir, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
