/**
 * search.js — 压缩块与原文轮次的词法检索（纯函数，无 I/O）
 *
 * 中文按相邻两字切词（单字词保留单字），其余按连续字母数字切词，再用 BM25 打分。
 * 人名、地名、物品名多为两到四字，两字切分能命中它们的任意部分，又不需要分词词典。
 *
 * 对外暴露：
 *   rankDocuments(query, docs) → [{ id, score }]  只返回得分大于 0 的文档，按得分降序
 */

const CJK_RUN = /[㐀-䶿一-鿿]+/gu;
const WORD_RUN = /[\p{L}\p{N}]+/gu;
const K1 = 1.2;
const B = 0.75;

function searchTerms(text) {
  const source = String(text ?? '').toLowerCase();
  const terms = [];
  for (const run of source.match(CJK_RUN) ?? []) {
    const chars = [...run];
    if (chars.length === 1) terms.push(run);
    for (let i = 0; i + 1 < chars.length; i++) terms.push(chars[i] + chars[i + 1]);
  }
  for (const word of source.replace(CJK_RUN, ' ').match(WORD_RUN) ?? []) terms.push(word);
  return terms;
}

function termCounts(terms) {
  const counts = new Map();
  for (const term of terms) counts.set(term, (counts.get(term) ?? 0) + 1);
  return counts;
}

/**
 * @param {string} query
 * @param {Array<{id:string|number, text:string}>} docs
 * @returns {Array<{id:string|number, score:number}>}
 */
export function rankDocuments(query, docs) {
  const queryTerms = [...new Set(searchTerms(query))];
  if (queryTerms.length === 0 || docs.length === 0) return [];
  const indexed = docs.map((doc) => {
    const terms = searchTerms(doc.text);
    return { id: doc.id, length: terms.length, counts: termCounts(terms) };
  });
  const avgLength = indexed.reduce((sum, doc) => sum + doc.length, 0) / indexed.length || 1;
  const docFreq = new Map(queryTerms.map((term) => [term, indexed.filter((doc) => doc.counts.has(term)).length]));
  const ranked = [];
  for (const doc of indexed) {
    let score = 0;
    for (const term of queryTerms) {
      const tf = doc.counts.get(term);
      if (!tf) continue;
      const df = docFreq.get(term);
      const idf = Math.log(1 + (indexed.length - df + 0.5) / (df + 0.5));
      score += idf * ((tf * (K1 + 1)) / (tf + K1 * (1 - B + (B * doc.length) / avgLength)));
    }
    if (score > 0) ranked.push({ id: doc.id, score });
  }
  return ranked.sort((a, b) => b.score - a.score);
}
