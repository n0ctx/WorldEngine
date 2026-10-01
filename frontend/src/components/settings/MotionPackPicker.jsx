import { useState } from 'react';
import { updateConfig } from '../../core/api/config.js';
import { useMotion } from '../../core/hooks/useMotion.js';
import { MOTION_PACKS, setMotionPack } from '../../core/motion/motionPack.js';
import Button from '../ui/Button.jsx';
import Badge from '../ui/Badge.jsx';
import { log } from '../../core/utils/logger.js';

// 动效包选择：点切换立刻生效（整个应用一起换），同时写进配置；保存失败时换回原来的包
export default function MotionPackPicker() {
  const active = useMotion().pack.id;
  const [busy, setBusy] = useState(false);

  async function switchPack(id) {
    const previous = active;
    setBusy(true);
    setMotionPack(id);
    try {
      await updateConfig({ ui: { motion: id } });
    } catch (err) {
      setMotionPack(previous);
      log.error('motion.switch_failed', err, { toast: `切换失败：${err.message}` });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="we-theme-list">
      {Object.values(MOTION_PACKS).map((pack) => {
        const isActive = pack.id === active;
        return (
          <article key={pack.id} className={`we-theme-card${isActive ? ' active' : ''}`}>
            <div className="we-theme-card-main">
              <div className="we-theme-meta">
                <div className="we-theme-title-row">
                  <h3 className="we-theme-name">{pack.name}</h3>
                  {isActive && <Badge tone="accent">使用中</Badge>}
                </div>
                <p className="we-theme-desc">{pack.description}</p>
              </div>
            </div>
            {!isActive && (
              <div className="we-theme-actions">
                <Button variant="secondary" size="sm" onClick={() => switchPack(pack.id)} disabled={busy}>
                  切换
                </Button>
              </div>
            )}
          </article>
        );
      })}
    </div>
  );
}
