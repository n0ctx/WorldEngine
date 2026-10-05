/**
 * 产品图标（切角）：24 网格，只有直线，圆画成八边形，转角切 45°，方头尖角、2.5 粗；箭头一律实心三角。
 * 每个图标至多一段走强调色（.we-icon-accent），压在强调色或危险色实底上时由样式改回文字色。
 * 箭头、勾选这类指示性的小记号保持单色。只画产品里用到的，新增照同一套规则画。
 */

const STROKE = { fill: 'none', stroke: 'currentColor', strokeWidth: 2.5, strokeLinecap: 'square', strokeLinejoin: 'miter' };

// parts：每段 d 为路径；accent 走强调色；fill 为实心块，否则是描边
function makeIcon(parts) {
  return function Icon({ size = 24, className, style }) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" className={className} style={style} aria-hidden="true" focusable="false">
        {parts.map(({ d, accent, fill }) => (
          <path key={d} d={d} className={accent ? 'we-icon-accent' : undefined} {...(fill ? { fill: 'currentColor' } : STROKE)} />
        ))}
      </svg>
    );
  };
}

export const IconPencil = makeIcon([
  { d: 'M15 4.5 19.5 9 9 19.5H4.5V15Z' },
  { d: 'M12.5 7 17 11.5' },
  { d: 'M4.5 15.5 8.5 19.5H4.5Z', accent: true, fill: true },
]);

export const IconSquarePen = makeIcon([
  { d: 'M11 4H6L4 6v12l2 2h12l2-2v-7' },
  { d: 'M10 14v-3.5L18 2.5 21.5 6l-8 8Z', accent: true },
]);

export const IconUserPen = makeIcon([
  { d: 'M7 3h4l2 2v4l-2 2H7L5 9V5Z' },
  { d: 'M2.5 21.5v-3l3-3h7' },
  { d: 'M14 22v-3.5l5.5-5.5 3.5 3.5-5.5 5.5Z', accent: true, fill: true },
]);

export const IconTrash = makeIcon([
  { d: 'M3 6h18', accent: true },
  { d: 'M8 6V3h8v3' },
  { d: 'M19 9v11l-2 2H7l-2-2V9' },
]);

export const IconPlus = makeIcon([{ d: 'M12 4v16' }, { d: 'M4 12h16', accent: true }]);

export const IconCheck = makeIcon([{ d: 'M3.5 12.5 9 18' }, { d: 'M9 18 20.5 6.5', accent: true }]);

export const IconClose = makeIcon([{ d: 'M5 5l14 14' }, { d: 'M19 5 5 19', accent: true }]);

export const IconEllipsis = makeIcon([
  { d: 'M5 9.5 7.5 12 5 14.5 2.5 12Z', fill: true },
  { d: 'M12 9.5 14.5 12 12 14.5 9.5 12Z', accent: true, fill: true },
  { d: 'M19 9.5 21.5 12 19 14.5 16.5 12Z', fill: true },
]);

export const IconArrowUp = makeIcon([{ d: 'M12 21v-9' }, { d: 'M12 2.5 20 11.5H4Z', accent: true, fill: true }]);

export const IconArrowDown = makeIcon([{ d: 'M12 3v9' }, { d: 'M12 21.5 4 12.5h16Z', accent: true, fill: true }]);

export const IconChevronRight = makeIcon([{ d: 'M9 5l7 7-7 7' }]);

export const IconChevronLeft = makeIcon([{ d: 'M15 5l-7 7 7 7' }]);

export const IconChevronDown = makeIcon([{ d: 'M5 9l7 7 7-7' }]);

export const IconRotateCcw = makeIcon([
  { d: 'M4.5 12v4.5l3 3h9l3-3v-9l-3-3H10' },
  { d: 'M3 4.5 9.5 0.75v7.5Z', accent: true, fill: true },
]);

export const IconRotateCw = makeIcon([
  { d: 'M19.5 12v4.5l-3 3h-9l-3-3v-9l3-3H14' },
  { d: 'M21 4.5 14.5 0.75v7.5Z', accent: true, fill: true },
]);

export const IconFastForward = makeIcon([
  { d: 'M2.5 5.5 11.5 12l-9 6.5Z', fill: true },
  { d: 'M12.5 5.5 21.5 12l-9 6.5Z', accent: true, fill: true },
]);

export const IconStop = makeIcon([{ d: 'M8 4.5h8L19.5 8v8L16 19.5H8L4.5 16V8Z', fill: true }]);

export const IconPin = makeIcon([{ d: 'M8.5 3h7v6l3 3h-13l3-3Z' }, { d: 'M12 13v8.5', accent: true }]);

export const IconDownload = makeIcon([
  { d: 'M12 2.5v8' },
  { d: 'M12 16 6 9.5h12Z', accent: true, fill: true },
  { d: 'M3.5 15v5.5h17V15' },
]);

export const IconUpload = makeIcon([
  { d: 'M12 16.5v-8' },
  { d: 'M12 2.5 18 9H6Z', accent: true, fill: true },
  { d: 'M3.5 15v5.5h17V15' },
]);

export const IconCopy = makeIcon([
  { d: 'M8 5V3h11l2 2v11h-2', accent: true },
  { d: 'M3 10l2-2h9l2 2v9l-2 2H5l-2-2Z' },
]);

// 齿轮：八边形轮身，正向四齿是方块、斜向四齿是菱形
export const IconSettings = makeIcon([
  { d: 'M9 4h6l5 5v6l-5 5H9l-5-5V9Z' },
  {
    d: 'M10.5 1h3v3h-3ZM10.5 20h3v3h-3ZM1 10.5h3v3H1ZM20 10.5h3v3h-3Z'
      + 'M18.9 3 21 5.1 18.9 7.2 16.8 5.1ZM18.9 16.8 21 18.9 18.9 21 16.8 18.9Z'
      + 'M5.1 16.8 7.2 18.9 5.1 21 3 18.9ZM5.1 3 7.2 5.1 5.1 7.2 3 5.1Z',
    fill: true,
  },
  { d: 'M12 9 15 12 12 15 9 12Z', accent: true, fill: true },
]);

export const IconSearch = makeIcon([
  { d: 'M8 3.5h4.5L16 7v4.5L12.5 15H8l-3.5-3.5V7Z' },
  { d: 'M15 14l5.5 5.5', accent: true },
]);

export const IconAlignLeft = makeIcon([
  { d: 'M3 5h18' },
  { d: 'M3 10h11', accent: true },
  { d: 'M3 15h18' },
  { d: 'M3 20h9' },
]);

export const IconPanelRight = makeIcon([
  { d: 'M5 4h14l2 2v12l-2 2H5l-2-2V6Z' },
  { d: 'M14.5 7H18v10h-3.5Z', accent: true, fill: true },
]);

export const IconChatPlus = makeIcon([
  { d: 'M3 4h18v13H11l-5 4v-4H3Z' },
  { d: 'M12 7.5v6M9 10.5h6', accent: true },
]);

export const IconImagePlus = makeIcon([
  { d: 'M11.5 4H3v16h18v-8.5' },
  { d: 'M3 17l5-5 4 4 2-2 4 4' },
  { d: 'M18 1.5v7M14.5 5h7', accent: true },
]);

export const IconGrip = makeIcon([
  { d: 'M8 4h3v3H8ZM13 4h3v3h-3ZM8 10.5h3v3H8ZM13 10.5h3v3h-3ZM8 17h3v3H8ZM13 17h3v3h-3Z', fill: true },
]);

export const IconEraser = makeIcon([
  { d: 'M7.4 9.1 14.9 16.6 11.5 20 4 12.5Z', accent: true, fill: true },
  { d: 'M13 3.5 20.5 11 11.5 20 4 12.5Z' },
  { d: 'M14.5 21.5h7' },
]);

export const IconBookOpen = makeIcon([
  { d: 'M12 6.5 9.5 4h-7v15h7l2.5 2.5' },
  { d: 'M12 6.5 14.5 4h7v15h-7L12 21.5' },
  { d: 'M12 6.5v15', accent: true },
]);

export const IconWrench = makeIcon([
  { d: 'M10 9.5V6l3-3h4l-3 3v3h3l3-3v4l-3 3h-3.5Z' },
  { d: 'M11.5 11.5 4.5 18.5', accent: true },
]);

// 写卡助手：钢笔尖加一点火花
export const IconAssistant = makeIcon([
  { d: 'M11 2.5l5.5 7L11 19.5 5.5 9.5Z' },
  { d: 'M11 19.5v-7' },
  { d: 'M11 7.5l2 2-2 2-2-2Z', accent: true, fill: true },
  { d: 'M19.5 1.5v5M17 4h5', accent: true },
]);

// 状态记忆：分格状态条
export const IconState = makeIcon([
  { d: 'M2.5 8h17l2 2v6h-19Z' },
  { d: 'M5 14l2-4h2.5l-2 4ZM9.5 14l2-4H14l-2 4ZM14 14l2-4h2.5l-2 4Z', accent: true, fill: true },
]);

// 剧情摘要：两行收成一行
export const IconSummary = makeIcon([
  { d: 'M3 4h18M3 8h18' },
  { d: 'M8 11.5l4 3.5 4-3.5', accent: true },
  { d: 'M7 19.5h10' },
]);

// 角色卡：竖版卡面里一个半身像
export const IconCharacterCard = makeIcon([
  { d: 'M5 3h11l3 3v15H5Z' },
  { d: 'M12 6.5 15 9.5 12 12.5 9 9.5Z', accent: true, fill: true },
  { d: 'M8.5 18v-1.5L10.5 15h3l2 1.5V18' },
]);
