import { getAvatarColor, getAvatarUrl } from '../../core/utils/avatar';
import AvatarUpload from '../ui/AvatarUpload.jsx';

/**
 * 角色卡 / 玩家卡编辑弹层左栏的立绘框：就是头像，换成 3:4 的大框；上传后立即生效。
 * form 来自 useCardEditForm；avatarSeed 决定占位头像的底色。
 */
export default function CardPortrait({ form, avatarSeed, onAvatarFile }) {
  return (
    <AvatarUpload
      name={form.name}
      avatarUrl={getAvatarUrl(form.avatarPath)}
      avatarColor={getAvatarColor(avatarSeed)}
      avatarUploading={form.avatarUploading}
      fileInputRef={form.fileInputRef}
      onAvatarClick={() => form.fileInputRef.current?.click()}
      onFileChange={onAvatarFile}
      shape="portrait"
      hint="点击上传立绘，上传后立即生效"
    />
  );
}
