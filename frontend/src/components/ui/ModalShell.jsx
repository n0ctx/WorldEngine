export default function ModalShell({ children, onClose, maxWidth = 'max-w-lg' }) {
  return (
    <div
      className="we-modal-backdrop fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className={['we-modal bg-canvas border border-border rounded-2xl shadow-whisper w-full mx-4 flex flex-col max-h-[90vh]', maxWidth].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
