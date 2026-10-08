# WorldEngine — Agent 规则

## 修改边界

- 先确认改动的现有归属、调用链和相关测试；以当前代码和测试判断行为。只改任务所需的路径，保留工作区里其他人的改动。
- 前后端只通过 HTTP 通信，不跨端导入源码。后端按 `routes → app → services / memory / prompts → db` 分层；数据库查询和 SQL 收口在 `backend/db/queries/`。接口层和写卡助手服务端的业务写入须经 `backend/services/`。具体边界由 `check:architecture` 检查。
- `frontend/src/` 的网络请求放在 `frontend/src/core/api/`；前端页面接入写卡助手须经 `frontend/src/core/features/assistant/`。

## 验证

- 先运行与改动对应的测试和 lint；跨层改动同时检查相关端。界面行为或外观改动的浏览器检查由用户完成，不自行打开浏览器验证；完成时列出需要检查的页面和主题，并说明视觉验证留给用户。
- 源码守卫运行 `npm run check:guards`，也可按范围运行 `npm run check:<名称>`；守卫脚本的测试运行 `npm run test:guards`。检查项及其基线以 `package.json` 和 `scripts/` 中的当前实现为准。新增违规须修复；已有问题消失导致基线虚挂时，按检查器提示更新对应基线，不提高基线掩盖问题。
- 完成前核对实际用户行为、`git diff --check` 和工作区状态；只提交本次任务的文件。
