import FormGroup from '../ui/FormGroup.jsx';
import { Input, MarkdownEditor, Textarea } from '../index.js';

/**
 * 角色卡 / 玩家卡「设定」页签：名称、简介、若干 Markdown 提示词；保存走编辑弹层底部的保存栏。
 * 头像在弹层左栏（CardPortrait），不在这里。
 * form 来自 useCardEditForm；prompts 按顺序列出 { key, label, placeholder, minHeight }。
 */
export default function CardBasicForm({ form, nameField, descriptionPlaceholder, prompts }) {
  return (
    <div className="we-edit-form-stack">
      <FormGroup label={nameField.label} required={nameField.required}>
        <Input value={form.name} onChange={(e) => form.setName(e.target.value)} placeholder={nameField.placeholder} autoFocus={nameField.autoFocus} />
      </FormGroup>
      <FormGroup label="简介" hint="纯展示用途，不注入提示词">
        <Textarea
          rows={3}
          value={form.description}
          onChange={(e) => form.setDescription(e.target.value)}
          placeholder={descriptionPlaceholder}
        />
      </FormGroup>
      {prompts.map((p) => (
        <FormGroup key={p.key} label={p.label}>
          <MarkdownEditor value={form.prompts[p.key]} onChange={(v) => form.setPrompt(p.key, v)} placeholder={p.placeholder} minHeight={p.minHeight} />
        </FormGroup>
      ))}
    </div>
  );
}
