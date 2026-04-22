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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px' }}>
      <div
        style={{ position: 'relative', cursor: 'pointer' }}
        onClick={onAvatarClick}
        onMouseEnter={(e) => {
          const mask = e.currentTarget.querySelector('.we-avatar-mask');
          if (mask) {
            mask.style.background = 'rgba(0,0,0,0.35)';
            const label = mask.querySelector('span');
            if (label) label.style.opacity = '1';
          }
        }}
        onMouseLeave={(e) => {
          const mask = e.currentTarget.querySelector('.we-avatar-mask');
          if (mask) {
            mask.style.background = 'rgba(0,0,0,0)';
            const label = mask.querySelector('span');
            if (label) label.style.opacity = '0';
          }
        }}
      >
        {avatarUrl ? (
          <img
            src={avatarUrl}
            alt={name}
            style={{ width: 80, height: 80, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
          />
        ) : (
          <div
            style={{
              width: 80,
              height: 80,
              borderRadius: '50%',
              background: avatarColor,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'var(--we-font-display)',
              fontSize: '28px',
              fontWeight: 300,
              color: '#fff',
            }}
          >
            {initial}
          </div>
        )}
        {avatarUploading && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              borderRadius: '50%',
              background: 'rgba(0,0,0,0.6)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <span style={{ color: '#fff', fontSize: 12 }}>上传中…</span>
          </div>
        )}
        <div
          className="we-avatar-mask"
          style={{
            position: 'absolute',
            inset: 0,
            borderRadius: '50%',
            background: 'rgba(0,0,0,0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transition: 'background 0.15s',
          }}
        >
          <span style={{ color: '#fff', fontSize: 12, opacity: 0, transition: 'opacity 0.15s' }}>
            更换头像
          </span>
        </div>
      </div>
      <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileChange} />
      <p
        style={{
          fontFamily: 'var(--we-font-serif)',
          fontSize: 12,
          color: 'var(--we-ink-faded)',
          marginTop: 8,
          opacity: 0.7,
        }}
      >
        点击头像上传图片
      </p>
    </div>
  );
}
