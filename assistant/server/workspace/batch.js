// 批量写入：先把整批全部校验，有一项不合格就整批不写；全部合格后逐项落库，中途出错时逐项报告。
//
// 每一项由调用方的 plan(item, ctx) 校验并返回一个落库函数（返回该项的回执）。
// plan 阶段不得写库；ctx 在同一批内共享，供后面的项看到前面的项将要新建的内容。

import { fail } from './common.js';

class PartialBatchError extends Error {
  constructor(message) {
    super(message);
    this.name = 'PartialBatchError';
    this.partial = true;
  }
}

const stripVerb = (receipt) => String(receipt).replace(/^已(创建|更新|删除) ?/, '');
const messageOf = (err) => String(err?.message ?? err);

function assertBatchSize(items, max) {
  if (!Array.isArray(items)) fail('批量参数必须是数组');
  if (items.length === 0) fail('批量参数不能为空数组');
  if (items.length > max) fail(`一次最多 ${max} 项，收到 ${items.length} 项；请拆成多次调用（未写入任何内容）`);
}

function planAll(items, order, plan, labelOf) {
  const ctx = { pendingFields: new Map(), claimed: new Set() };
  const steps = new Array(items.length);
  const problems = [];
  for (const index of order) {
    try {
      steps[index] = plan(items[index], ctx);
    } catch (err) {
      problems.push({ index, message: messageOf(err) });
    }
  }
  if (problems.length === 0) return steps;
  if (items.length === 1) fail(problems[0].message);
  problems.sort((a, b) => a.index - b.index);
  const lines = problems.map((p) => `第 ${p.index + 1} 项 ${labelOf(items[p.index])}：${p.message}`);
  return fail(`整批未写入（共 ${items.length} 项，${problems.length} 项有问题）：${lines.join('；')}`);
}

function partialReport(items, order, receipts, failedAt, err, labelOf) {
  const done = order.slice(0, failedAt).map((index) => stripVerb(receipts[index]));
  const pending = order.slice(failedAt).map((index, offset) => (
    `第 ${index + 1} 项 ${labelOf(items[index])} — ${offset === 0 ? messageOf(err) : '未执行'}`
  ));
  return `部分完成（已写入 ${done.length} 项，未写入 ${pending.length} 项）。`
    + `已写入：${done.join('；') || '无'}。未写入：${pending.join('；')}。先 read 核对，不要整批重发。`;
}

/**
 * @param {Array} items
 * @param {object} opts
 * @param {string} opts.verb      回执动词：已创建 / 已更新 / 已删除
 * @param {number} opts.max       项数上限
 * @param {(item) => string} opts.labelOf  报错里指代该项的写法
 * @param {(item) => number} [opts.rankOf] 校验与落库顺序（小的先做）；回执仍按传入顺序
 * @param {(item, ctx) => (() => Promise<string>)} opts.plan
 */
export async function runBatch(items, { verb, max, labelOf, rankOf = () => 0, plan }) {
  assertBatchSize(items, max);
  const order = items.map((_, index) => index).sort((a, b) => rankOf(items[a]) - rankOf(items[b]) || a - b);
  const steps = planAll(items, order, plan, labelOf);
  const receipts = new Array(items.length);
  for (let n = 0; n < order.length; n += 1) {
    try {
      receipts[order[n]] = await steps[order[n]]();
    } catch (err) {
      if (items.length === 1) throw err;
      throw new PartialBatchError(partialReport(items, order, receipts, n, err, labelOf));
    }
  }
  if (items.length === 1) return receipts[0];
  return `${verb} ${items.length} 项：${receipts.map(stripVerb).join('；')}`;
}
