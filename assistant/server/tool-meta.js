// 工具的静态属性，服务端与面板共用。

// 会改动数据的工具：成功回执写进任务记录，面板据此刷新主界面。
export const WRITE_TOOLS = new Set(['create', 'update', 'edit', 'set_state', 'delete']);
