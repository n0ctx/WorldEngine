import { AnimatePresence, motion } from 'framer-motion';
import { RotateCcw } from 'lucide-react';
import CharacterSeal from '../../../components/chat/CharacterSeal.jsx';

export default function ChatErrorBubble({ character, errorBubble, generating, onRetry, motionPrefs }) {
  return (
    <AnimatePresence>
      {errorBubble && !generating && (
        <motion.div
          key="error-bubble"
          variants={motionPrefs.variant('enter')}
          initial="hidden"
          animate="visible"
          exit="exit"
          transition={motionPrefs.transition('enter')}
          className="px-4 pb-2 shrink-0"
        >
          <div className="max-w-[800px] mx-auto">
            <div className="flex items-start gap-3">
              <CharacterSeal character={character} size={24} />
              <div className="flex flex-col gap-1 max-w-[75%]">
                <span className="we-type-caption text-[var(--we-color-text-faint)]">{character?.name}</span>
                {errorBubble.partialContent && (
                  <div className="px-4 py-3 rounded-[var(--we-radius-lg)] rounded-tl-[var(--we-radius-xs)] bg-[var(--we-color-bg-surface)] border border-[var(--we-color-border-default)] text-[var(--we-color-text-secondary)] we-type-body whitespace-pre-wrap">
                    {errorBubble.partialContent}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="we-type-caption px-2 py-1 rounded-[var(--we-radius-full)] bg-[var(--we-color-accent-bg)] text-[var(--we-color-status-danger)] border border-[var(--we-color-border-focus)]">
                    生成失败：{errorBubble.errorMsg}
                  </span>
                  <button
                    onClick={onRetry}
                    className="we-type-caption px-3 py-1 rounded-[var(--we-radius-lg)] border border-[var(--we-color-border-default)] hover:bg-[var(--we-color-bg-sunken)] transition-colors flex items-center gap-1 text-[var(--we-color-text-secondary)]"
                  >
                    <RotateCcw size={16} />
                    重新生成
                  </button>
                </div>
              </div>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
