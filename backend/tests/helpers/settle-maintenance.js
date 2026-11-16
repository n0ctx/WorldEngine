/**
 * maintainContext 在队列里只做判断，模型调用在后台进行（返回 { outcome: 'started', completion }）。
 * 测试要看最终结果时用这个等后台运行结束；没启动后台运行（idle / skip / busy）时原样返回。
 */
export async function settleMaintenance(pending) {
  const result = await pending;
  return result.completion ? result.completion : result;
}
