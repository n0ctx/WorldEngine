import { getAvatarColor, getAvatarUrl } from '../../core/utils/avatar';
import AvatarUpload from '../ui/AvatarUpload.jsx';
import FormGroup from '../ui/FormGroup.jsx';
import { Input, MarkdownEditor, Textarea } from '../index.js';

/**
 * 角色卡 / 玩家卡「设定」页签：头像、名称、简介、若干 Markdown 提示词；保存走编辑弹层底部的保存栏，头像上传后立即生效。
 * form 来自 useCardEditForm；prompts 按顺序列出 { key, label, placeholder, minHeight }。
 * avatarSeed 决定占位头像的底色；showAvatar 为 false 时不显示头像（新建角色还没有 id，传不了头像）。
 */
export default function CardBasicForm({
  form, avatarSeed, showAvatar = true, onAvatarFile,
  nameField, descriptionPlaceholder, prompts,
}) {
  return (
    <div className="we-edit-form-stack">
      {showAvatar && (
        <AvatarUpload
          name={form.name}
          avatarUrl={getAvatarUrl(form.avatarPath)}
          avatarColor={getAvatarColor(avatarSeed)}
          avatarUploading={form.avatarUploading}
          fileInputRef={form.fileInputRef}
          onAvatarClick={() => form.fileInputRef.current?.click()}
          onFileChange={onAvatarFile}
          hint="点击头像上传图片，上传后立即生效"
        />
      )}
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
