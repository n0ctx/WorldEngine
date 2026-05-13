# StateValueOps 速查表

> `stateValueOps` 中 `value_json` 的写法（按字段 type）。
> 所有值必须是**JSON 字符串**（外层带双引号），或 `null`。

| type | `value_json` 写法 | 示例 |
|---|---|---|
| `number` | 直接写数字字符串 | `"50"` |
| `text` | JSON 转义后的字符串 | `"\"警觉\""` |
| `enum` | 必须是该字段 `enum_options` 之一 | `"\"轻伤\""` |
| `list` | JSON 数组字符串 | `"[\"短刀\",\"钥匙\"]"` |
| `boolean` | `"true"` 或 `"false"` | `"false"` |
| `datetime` | ISO 局部时间 `"YYYY-MM-DDTHH:mm"` | `"\"1000-03-15T14:30\""` |
| `table` | 对象 JSON，key 必须是 `table_columns` 已声明的列 | `"{\"atk\":30,\"def\":20}"` |
| 清空（字段允许为空）| `null` | `null` |

> 注意：`datetime` 年份为正整数、可任意位数；月/日/时/分各 2 位。
