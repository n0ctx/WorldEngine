export default function Input({ className = '', ...props }) {
  return (
    <input
      className={['we-input', className].filter(Boolean).join(' ')}
      {...props}
    />
  );
}
