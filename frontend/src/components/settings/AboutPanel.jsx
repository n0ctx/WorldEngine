import Divider from '../ui/Divider';
import SectionTitle from '../ui/SectionTitle';

export default function AboutPanel() {
  return (
    <div>
      <SectionTitle level="section" rule="under" as="h2">关于</SectionTitle>
      <div className="we-settings-field-group">
        <div>
          <p className="we-settings-about-name">
            WorldEngine
          </p>
          <p className="we-settings-about-version">
            版本 {__APP_VERSION__}（开发版）
          </p>
        </div>

        <Divider size="lg" />

        <div>
          <p className="we-settings-about-heading">
            致谢
          </p>
          <p className="we-settings-about-desc">
            部分动效组件移植自{' '}
            <a className="we-settings-about-link" href="https://rareui.com" target="_blank" rel="noreferrer">Rare UI（rareui.com）</a>
            ，按其许可保留署名。
          </p>
        </div>

        <Divider size="lg" />

        <div>
          <p className="we-settings-about-heading">
            重置数据库
          </p>
          <p className="we-settings-about-desc">
            重置将清除所有数据（世界、角色、会话、消息）。请在后端目录执行：
          </p>
          <pre className="we-settings-about-code we-settings-about-code--content">
            {'cd backend && npm run db:reset'}
          </pre>
        </div>
      </div>
    </div>
  );
}
