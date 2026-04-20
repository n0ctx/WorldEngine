import { motion, AnimatePresence } from 'framer-motion';

/**
 * 选项卡：AI 回复后展示若干行动选项，点击后直接发送，点击取消则关闭。
 * streaming=true 时选项实时更新但不可交互（流式进行中）。
 * @param {{ options: string[], streaming?: boolean, onSelect: (text: string) => void, onDismiss: () => void }} props
 */
export default function OptionCard({ options, streaming, onSelect, onDismiss }) {
  if (!options?.length) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 6 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="px-4 pb-2 shrink-0"
      >
        <div className="max-w-[800px] mx-auto">
          <div
            className="flex flex-col gap-1.5 rounded-[10px] p-2.5"
            style={{ background: 'var(--we-paper-aged)', border: '1px solid var(--we-paper-shadow)' }}
          >
            <div className="flex flex-col gap-1">
              {options.map((opt, i) => (
                <button
                  key={i}
                  className={`we-option-btn${streaming ? ' opacity-60 cursor-default pointer-events-none' : ''}`}
                  onClick={() => onSelect(opt)}
                >
                  {opt}
                </button>
              ))}
            </div>
            {!streaming && (
              <button className="we-option-dismiss" onClick={onDismiss}>
                取消
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
