export default function AboutPanel() {
  return (
    <div>
      <h2 className="we-settings-section-title">关于</h2>
      <div className="we-settings-field-group">
        <div>
          <p style={{ fontFamily: 'var(--we-font-display)', fontSize: '15px', fontStyle: 'italic', color: 'var(--we-ink-secondary)', margin: '0 0 4px' }}>
            WorldEngine
          </p>
          <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '13px', color: 'var(--we-ink-faded)', margin: 0 }}>
            版本 0.0.0（开发版）
          </p>
        </div>

        <hr className="we-settings-divider" />

        <div>
          <p style={{ fontFamily: 'var(--we-font-display)', fontSize: '14px', fontStyle: 'italic', color: 'var(--we-ink-secondary)', margin: '0 0 8px' }}>
            重置数据库
          </p>
          <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '13px', color: 'var(--we-ink-faded)', fontStyle: 'italic', lineHeight: '1.6', margin: '0 0 12px' }}>
            重置将清除所有数据（世界、角色、会话、消息）。请在后端目录执行：
          </p>
          <pre style={{
            fontFamily: 'Courier New, monospace',
            fontSize: '12.5px',
            background: 'var(--we-paper-aged)',
            border: '1px solid var(--we-paper-shadow)',
            padding: '10px 14px',
            color: 'var(--we-ink-secondary)',
            margin: 0,
          }}>
            {'cd backend && npm run db:reset'}
          </pre>
        </div>
      </div>
    </div>
  );
}
