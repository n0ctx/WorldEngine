/**
 * 逐条写入状态提取结果；部分失败时汇总成功/失败条数和失败字段后抛出，已成功的写入不回滚
 * @param {Array<{ label: string }>} items
 * @param {(item: object) => Promise<unknown>} writeValue
 */
export async function applyExtractedValues(items, writeValue) {
  const failed = [];
  for (const item of items) {
    try {
      await writeValue(item);
    } catch (err) {
      failed.push({ item, err });
    }
  }
  if (failed.length > 0) {
    const okCount = items.length - failed.length;
    throw new Error(`成功 ${okCount} 条，失败 ${failed.length} 条（${failed.map((f) => f.item.label).join('、')}）：${failed[0].err.message || '写入失败'}`);
  }
}
