export default function Textarea({ className = '', ...props }) {
  return (
    <textarea
      className={['we-textarea', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
