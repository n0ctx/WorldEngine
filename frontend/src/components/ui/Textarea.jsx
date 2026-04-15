export default function Textarea({ className = '', ...props }) {
  return (
    <textarea
      className={[
        'we-textarea',
        'w-full px-3 py-2 bg-ivory border border-border rounded-lg',
        'text-text text-sm resize-none',
        'focus:outline-none focus:border-accent',
        'disabled:opacity-40',
        'placeholder:text-text-tertiary',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
