export default function AboutPanel() {
  return (
    <div>
      <h2 className="we-settings-section-title">关于</h2>
      <div className="we-settings-field-group">
        <div>
          <p className="we-settings-about-name">
            WorldEngine
          </p>
          <p className="we-settings-about-version">
            版本 0.0.0（开发版）
          </p>
        </div>

        <hr className="we-settings-divider" />

        <div>
          <p className="we-settings-about-heading">
            重置数据库
          </p>
          <p className="we-settings-about-desc">
            重置将清除所有数据（世界、角色、会话、消息）。请在后端目录执行：
          </p>
          <pre className="we-settings-about-code">
            {'cd backend && npm run db:reset'}
          </pre>
        </div>
      </div>
    </div>
  );
}
