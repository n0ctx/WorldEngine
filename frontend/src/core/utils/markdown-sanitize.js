import { defaultSchema } from 'rehype-sanitize';

// 允许正则替换/世界书条目写入的内联样式生效（颜色、阴影、字体等）。
// 默认 GitHub schema 不允许 style 属性，会把 `<span style="...">` 静默剥成纯文本。
const inlineStyleTags = ['span', 'em', 'strong', 'p', 'div', 'mark', 'small', 'sup', 'sub', 'a', 'code', 'pre'];

export const markdownSanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    ...Object.fromEntries(inlineStyleTags.map((tag) => [
      tag,
      [...(defaultSchema.attributes?.[tag] ?? []), 'style', 'className', 'class'],
    ])),
  },
};
