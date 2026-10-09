import GridReveal from '../motion/GridReveal.jsx';

// circle 圆头像；rect 世界封面（240×150）；portrait 编辑弹窗左栏的立绘框，3:4，宽度铺满所在栏
const ASPECT = { circle: 1, rect: 240 / 150, portrait: 3 / 4 };

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
  const mod = (base) => (shape === 'circle' ? base : `${base} ${base}--${shape}`);

  return (
    <div className={mod('we-avatar-upload')}>
      <button type="button" className="we-avatar-wrap" onClick={onAvatarClick} aria-label={hint}>
        {avatarUrl ? (
          <GridReveal src={avatarUrl} alt={name} aspect={ASPECT[shape]} className={mod('we-avatar-img')} />
        ) : (
          <div className={mod('we-avatar-placeholder')} style={{ '--avatar-bg': avatarColor }}>
            {initial}
          </div>
        )}
        {avatarUploading && (
          <div className={mod('we-avatar-uploading')}>
            <span>上传中…</span>
          </div>
        )}
        <div className={mod('we-avatar-mask')}>
          <span>更换图片</span>
        </div>
      </button>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
      <p className="we-avatar-hint">{hint}</p>
    </div>
  );
}
