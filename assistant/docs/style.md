# 界面样式与文本处理：主题包、CSS 片段、正则规则各管什么

## 选哪一个

- 整套换肤、全局换色、"这个主题别这么红" → 主题包（theme）。
- 在当前主题之上改某个组件（气泡、思考链、写作正文版式、特效）→ CSS 片段（css）。
- 改动文字本身（替换、包 HTML、清洗 Markdown 标记）→ 正则规则（regex）。CSS 改不了文字内容。
- 同时要换肤又要改组件，就分别改主题和 CSS 片段。
- 主题是否启用由用户在设置里切换，不要替用户切换。

## 主题包

- 只在 `:root` 里覆写已有的 `--we-*` token（read("doc:theme-tokens") 查看）。改 `--we-base-*` 会让依赖它的语义色一起变，最省事。
- 换某个颜色时，先 read 主题全文，把这个颜色的 hex 和所有带透明度的 rgba 写法都找出来一起换，透明度保持不变；边框、阴影、光晕里的同色也要换，否则会留下旧色。
- "弹窗背景太黑 / 差分太大"只调 `--we-color-bg-overlay` 和 `--we-color-overlay-heavy` 的透明度（常用 0.40-0.55），和换主色是两件事。
- 改内置主题会自动复制成用户主题，原主题不受影响。

## CSS 片段

- 所有启用的片段全局生效，没有按世界区分。chat 片段只放聊天界面的样式，写作界面的样式放 writing 片段。
- 颜色、圆角、阴影用 `var(--we-color-*)` 等语义 token，不写裸 hex；不写渐变、发光、毛玻璃。
- 常用类名：聊天 `.we-message-bubble-assistant` / `.we-message-bubble-user` / `.we-message-content` / `.we-think-block`；写作 `.we-writing-prose` / `.we-writing-think`；面板 `.we-panel-card`。不确定类名就不要凭猜测写深层选择器。

## 正则规则

- scope：只改显示效果用 `display_only`（不影响历史和模型）；只在发给模型前替换用 `prompt_only`；永久改写 AI 输出用 `ai_output`；改写用户输入用 `user_input`。
- 包裹 `<think>` 这类纯展示需求用 `display_only`，不要用 `ai_output` 污染历史。
- pattern 尽量窄，避免误伤正常文本；跨行匹配用 `[\s\S]*?`。
- 只对当前世界生效时设 `world_only: true`，否则全局生效。
