export default function Input({ className = '', ...props }) {
  return (
    <input
      className={[
        'we-input',
        'w-full px-3 py-2 bg-ivory border border-border rounded-lg',
        'text-text text-sm',
        'focus:outline-none focus:border-accent',
        'disabled:opacity-40',
        'placeholder:text-text-tertiary',
        className,
      ].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
