import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import ChangeText from '../motion/ChangeText.jsx';
import Button from './Button.jsx';
import { useMotion } from '../../core/hooks/useMotion.js';

function capsuleState({ creating, dirty, saving, error, justSaved }) {
  if (saving) return 'saving';
  if (error) return 'error';
  if (dirty || creating) return 'dirty';
  return justSaved ? 'saved' : 'hidden';
}

/**
 * 保存栏：浮在所在滚动区底部的胶囊，同一块编辑区里所有需要手动保存的字段共用这一个按钮。
 * 没有改动时收起；有改动（或新建）时浮起；存好后「已保存」标签停一拍再收起。
 * savedKey 每次保存成功 +1；停靠位始终占一行高度，胶囊出现、收起时正文不跳。
 */
export default function SaveCapsule({ creating = false, dirty, saving, error = '', savedKey = 0, saveLabel, onSave }) {
  const m = useMotion();
  const fxVars = m.fx();
  const holdMs = m.pack.fx.stamp * 1000;
  // 挂载前的保存不再补播「已保存」
  const [expiredKey, setExpiredKey] = useState(savedKey);

  useEffect(() => {
    if (!savedKey) return undefined;
    const t = setTimeout(() => setExpiredKey(savedKey), holdMs);
    return () => clearTimeout(t);
  }, [savedKey, holdMs]);

  const state = capsuleState({ creating, dirty, saving, error, justSaved: savedKey > 0 && savedKey !== expiredKey });
  const text = {
    dirty: creating ? '填写完成后创建' : '有未保存的修改',
    saving: creating ? '创建中…' : '保存中…',
    error: `保存失败：${error}`,
  }[state];

  return (
    <div className="we-save-capsule-dock">
      <AnimatePresence>
        {state !== 'hidden' && (
          <motion.div
            key="capsule"
            role="status"
            className={`we-save-capsule we-save-capsule--${state}`}
            variants={m.variant('overlayEnter')}
            initial="hidden"
            animate="visible"
            exit="exit"
            transition={m.transition('overlay')}
          >
            {state === 'saved' ? (
              <span className={`we-change-tag we-change-tag--up we-save-capsule__tag${fxVars ? ' we-change-tag--play' : ''}`} style={fxVars ?? undefined}>
                <ChangeText text="已保存" playKey={fxVars ? savedKey : null} decode />
              </span>
            ) : (
              <>
                {state === 'dirty' && <span className="we-save-capsule__dot" aria-hidden="true" />}
                <span className="we-save-capsule__text">{text}</span>
                <Button variant="primary" size="sm" onClick={onSave} disabled={state === 'saving'}>
                  {state === 'error' ? '重试' : saveLabel}
                </Button>
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
