// frontend/src/components/ui/AvatarUpload.jsx
export default function AvatarUpload({
  name,
  avatarUrl,
  avatarColor,
  avatarUploading,
  fileInputRef,
  onAvatarClick,
  onFileChange,
  shape = 'circle',
  hint = '点击头像上传图片',
}) {
  const initial = (name || '?')[0].toUpperCase();
  const isRect = shape === 'rect';
  const imgClass = isRect ? 'we-avatar-img we-avatar-img--rect' : 'we-avatar-img';
  const placeholderClass = isRect ? 'we-avatar-placeholder we-avatar-placeholder--rect' : 'we-avatar-placeholder';
  const uploadingClass = isRect ? 'we-avatar-uploading we-avatar-uploading--rect' : 'we-avatar-uploading';
  const maskClass = isRect ? 'we-avatar-mask we-avatar-mask--rect' : 'we-avatar-mask';

  return (
    <div className="we-avatar-upload">
      <button type="button" className="we-avatar-wrap" onClick={onAvatarClick} aria-label={hint}>
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className={imgClass} />
        ) : (
          <div className={placeholderClass} style={{ '--avatar-bg': avatarColor }}>
            {initial}
          </div>
        )}
        {avatarUploading && (
          <div className={uploadingClass}>
            <span>上传中…</span>
          </div>
        )}
        <div className={maskClass}>
          <span>更换图片</span>
        </div>
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
      <p className="we-avatar-hint">{hint}</p>
    </div>
  );
}
