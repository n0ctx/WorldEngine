/** Shared lexical tokenization for in-memory and SQLite recall indexes. */
const CJK_RUN = /[㐀-䶿一-鿿]+/gu;
const WORD_RUN = /[\p{L}\p{N}]+/gu;

export function lexicalTerms(text) {
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
