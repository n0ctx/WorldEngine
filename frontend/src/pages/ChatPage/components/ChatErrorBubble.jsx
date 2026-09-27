import { AnimatePresence, motion } from 'framer-motion';
import Icon from '../../../components/ui/Icon.jsx';
import CharacterSeal from '../../../components/chat/CharacterSeal.jsx';

export default function ChatErrorBubble({ character, errorBubble, generating, onRetry, motionPrefs }) {
  return (
    <AnimatePresence>
      {errorBubble && !generating && (
        <motion.div
          key="error-bubble"
          variants={motionPrefs.variant('messageEnter')}
          initial="hidden"
          animate="visible"
          exit={{ opacity: 0, transition: motionPrefs.transition('retract') }}
          transition={motionPrefs.spring('message')}
          className="px-4 pb-2 shrink-0"
        >
          <div className="max-w-[800px] mx-auto">
            <div className="flex items-start gap-3">
              <CharacterSeal character={character} size={24} />
              <div className="flex flex-col gap-1 max-w-[75%]">
                <span className="text-xs opacity-50">{character?.name}</span>
                {errorBubble.partialContent && (
                  <div className="px-4 py-3 rounded-[var(--we-radius-lg)] rounded-tl-sm bg-[var(--we-color-bg-surface)] border border-[var(--we-color-border-default)] text-[var(--we-color-text-primary)] text-sm leading-relaxed whitespace-pre-wrap opacity-60">
                    {errorBubble.partialContent}
                  </div>
                )}
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs px-2 py-1 rounded-full bg-[var(--we-color-accent-bg)] text-[var(--we-color-text-danger)] border border-[var(--we-color-border-focus)]">
                    生成失败：{errorBubble.errorMsg}
                  </span>
                  <button
                    onClick={onRetry}
                    className="text-xs px-3 py-1 rounded-[var(--we-radius-lg)] border border-[var(--we-color-border-default)] hover:bg-[var(--we-color-bg-subtle)] transition-colors flex items-center gap-1 text-[var(--we-color-text-secondary)]"
                  >
                    <Icon size={16}>
                      <polyline points="1 4 1 10 7 10" />
                      <path d="M3.51 15a9 9 0 1 0 .49-4.98" />
                    </Icon>
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
