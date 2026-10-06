// 一次工具调用能处理的数量上限与输出上限。

export const MAX_BATCH_ITEMS = 20;
export const MAX_DELETE_REFS = 50;
export const MAX_READ_REFS = 20;
// 工具结果在一次任务里每轮都会重发给模型，所以单次读取的输出要有上限。
export const MAX_READ_CHARS = 30_000;
export const MAX_EDITS = 20;
export const FIND_DEFAULT_LIMIT = 30;
export const FIND_MAX_LIMIT = 100;
