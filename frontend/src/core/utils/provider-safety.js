export function providerSafetyMetaRows(event) {
  const rows = [];
  if (event.rawFinishReason) rows.push(['finish_reason', event.rawFinishReason]);
  if (event.nativeFinishReason) rows.push(['native_finish_reason', event.nativeFinishReason]);
  if (event.stopReason) rows.push(['stop_reason', event.stopReason]);
  if (event.providerErrorCode) rows.push(['error.code', event.providerErrorCode]);
  return rows;
}
