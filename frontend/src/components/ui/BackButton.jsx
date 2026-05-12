// BackButton — 通用返回按钮 Block
// Props:
//   onClick: () => void
//   label: string（可选，默认 "返回"）

export default function BackButton({ onClick, label = '返回' }) {
  return (
    <button className="we-back-btn" onClick={onClick}>
      ← {label}
    </button>
  );
}
