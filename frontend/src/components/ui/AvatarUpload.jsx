// frontend/src/components/ui/AvatarUpload.jsx
export default function AvatarUpload({
  name,
  avatarUrl,
  avatarColor,
  avatarUploading,
  fileInputRef,
  onAvatarClick,
  onFileChange,
}) {
  const initial = (name || '?')[0].toUpperCase();

  return (
    <div className="we-avatar-upload">
      <div className="we-avatar-wrap" onClick={onAvatarClick}>
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="we-avatar-img" />
        ) : (
          <div className="we-avatar-placeholder" style={{ background: avatarColor }}>
            {initial}
          </div>
        )}
        {avatarUploading && (
          <div className="we-avatar-uploading">
            <span>上传中…</span>
          </div>
        )}
        <div className="we-avatar-mask">
          <span>更换头像</span>
        </div>
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
      <p className="we-avatar-hint">点击头像上传图片</p>
    </div>
  );
}
