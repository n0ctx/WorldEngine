const CN_NUMS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];

function toChapterNum(n) {
  return n <= 10 ? CN_NUMS[n - 1] : String(n);
}

/**
 * 右页底部页脚
 * Props: { chapterIndex, worldName }
 */
export default function PageFooter({ chapterIndex = 1, worldName = '' }) {
  return (
    <div className="we-page-footer">
      <span>第{toChapterNum(chapterIndex)}章 · 第一页</span>
      <span className="we-page-footer-fleuron">❧</span>
      <span>{worldName}</span>
    </div>
  );
}
