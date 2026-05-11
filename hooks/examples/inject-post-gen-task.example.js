/**
 * 示例：向生成后任务队列注入自定义任务
 *
 * 将此文件复制到 hooks/ 根目录并重命名（去掉 .example），系统启动时自动加载。
 * hooks/ 根目录下所有 .js 文件均会被加载（按文件名字母序）。
 */

export default function register({ registerHook }) {
  registerHook('generation:post', async ({ sessionId, worldId, taskSpecs, mode }) => {
    // taskSpecs 是引用，push 的任务将与内置任务一起进入异步优先级队列
    taskSpecs.push({
      label: 'my-custom-task',
      priority: 5,          // 数字越小优先级越高；5 = 最低，不阻塞关键任务
      condition: true,      // false 时跳过，支持动态判断
      fn: async () => {
        // 在这里编写自定义逻辑，例如：调用外部 API、写日志、推送通知等
        console.log(`[my-hook] generation:post  session=${sessionId.slice(0, 8)} mode=${mode}`);
      },
      keepSseAlive: false,  // true 时此任务会阻止 SSE 连接关闭（等待推送 sseEvent）
      // sseEvent: 'my_event',                       // 完成后推送的 SSE 事件名
      // ssePayload: (result) => ({ type: 'my_event', data: result }), // 自定义 payload
      // tracksState: false,                         // true 时注册为状态更新追踪
    });
  }, { label: 'example-post-gen' });
}
