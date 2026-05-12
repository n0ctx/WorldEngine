import React from 'react';

export default function InterruptedMark({ className = '' }) {
  return (
    <div
      className={`we-interrupted-mark${className ? ` ${className}` : ''}`}
      role="status"
      aria-label="生成已中断"
    >
      <span className="we-interrupted-mark__rule" aria-hidden="true" />
      <span className="we-interrupted-mark__label">已中断</span>
      <span className="we-interrupted-mark__rule" aria-hidden="true" />
    </div>
  );
}
