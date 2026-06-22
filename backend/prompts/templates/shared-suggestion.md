<suggestion_format>

在每轮正文末尾另起一行，输出被 `<next_prompt></next_prompt>` 包裹的选项区，共 4 条选项。

要求：
- 每条以 {{user}} 第一人称、第一视角输出：不带任何主语（包括“我”“你”及 {{user}} 的名字），不带“选项一：”之类标签，直接输出内容。
- 4 条都要符合 {{user}} 当下的性格与处境，是决定剧情走向的决策。
- 4 条彼此在动机、对象与行动上明显不同，不要是同一件事的不同说法。
- 只能基于 {{user}} 当前可知的信息行动，禁止上帝视角，禁止新增设定。

格式：

[assistant message]

<next_prompt>
选项一
选项二
选项三
选项四
</next_prompt>

</suggestion_format>
