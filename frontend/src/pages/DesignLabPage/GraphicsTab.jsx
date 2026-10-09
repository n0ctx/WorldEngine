/**
 * 设计实验室的「图形」分页：产品里自绘的矢量图形——品牌标识、无封面世界的场景画、全套图标。
 * 主题与世界强调色由页面顶部统一切换，第二色跟强调色走。
 */
import BrandMark from '../../components/ui/BrandMark.jsx';
import Button from '../../components/ui/Button.jsx';
import IconButton from '../../components/ui/IconButton.jsx';
import WorldSceneArt from '../../components/ui/WorldSceneArt.jsx';
import { worldSceneTint } from '../../core/utils/worldScene.js';
import * as icons from '../../components/ui/icons.jsx';
import Section from './Section.jsx';

const SCENE_NAMES = ['豪宅世界', '魔王与勇者', '纯爱', '缅北黑暗面'];
const MARK_SIZES = [96, 48, 32, 20, 16];

// 图标导出名 → 中文名；测试核对 icons.jsx 的每个导出都在这里
const ICON_GROUPS = [
  {
    label: '操作',
    items: {
      IconPencil: '编辑', IconSquarePen: '编辑（带框）', IconUserPen: '代写', IconTrash: '删除', IconPlus: '新建', IconCheck: '确认',
      IconClose: '关闭', IconEllipsis: '更多', IconRotateCcw: '重新生成', IconRotateCw: '重试', IconFastForward: '续写', IconStop: '停止',
      IconPin: '置顶', IconDownload: '导出', IconUpload: '导入', IconCopy: '复制', IconSettings: '设置', IconSearch: '搜索',
      IconEraser: '清空', IconImagePlus: '添加图片', IconChatPlus: '新对话', IconGrip: '拖动',
    },
  },
  {
    label: '方向',
    items: {
      IconArrowUp: '发送 / 上', IconArrowDown: '回到底部 / 下', IconChevronRight: '右', IconChevronLeft: '左', IconChevronDown: '展开',
      IconAlignLeft: '目录', IconPanelRight: '侧栏',
    },
  },
  {
    label: '产品概念',
    items: {
      IconAssistant: '写卡助手', IconState: '状态记忆', IconSummary: '剧情摘要', IconCharacterCard: '角色卡', IconMapPin: '当前地点',
      IconBookOpen: '读取', IconWrench: '工具',
    },
  },
];

function Marks() {
  return (
    <Section id="graphics-brand" title="品牌标识「骰界」">
      <p className="we-design-lab__note">二十面骰的正视图，正对你的那一面走强调色；20px 以下去掉内部棱线。网页小图标是同一图形的固定配色版（public/favicon.svg）。</p>
      <div className="we-design-lab__graphics-marks we-design-lab__desk">
        {MARK_SIZES.map((size) => (
          <span key={size} className="we-design-lab__graphics-mark"><BrandMark size={size} /></span>
        ))}
      </div>
    </Section>
  );
}

function SceneTile({ name, variant, wide = false }) {
  return (
    <figure className={`we-design-lab__graphics-scene${wide ? ' we-design-lab__graphics-scene--wide' : ''}`}>
      <WorldSceneArt name={name} variant={variant} className="we-design-lab__graphics-scene-art" />
      <figcaption className="we-design-lab__graphics-scene-name">{name}</figcaption>
      <span className="we-design-lab__graphics-tint" style={{ '--tint': worldSceneTint(name) }} title="氛围染色" />
    </figure>
  );
}

function Scenes() {
  return (
    <Section id="graphics-scene" title="无封面世界的场景画「古地图」">
      <p className="we-design-lab__note">按世界名稳定生成：同一个名字永远是同一张地图。右下角圆点是这幅画给世界页环境光和正文氛围光晕的染色。</p>
      <p className="we-design-lab__note">世界卡：4:3，带图框；罗盘、船和海蛇不进左下角（那里写着名字）。正文中间栏的氛围底图用同一张，不画图框。</p>
      <div className="we-design-lab__graphics-scenes">
        {SCENE_NAMES.map((name) => <SceneTile key={name} name={name} variant="card" />)}
      </div>
      <p className="we-design-lab__note">对话、写作页的台前横幅：镜头拉宽，主岛和岛上的山林城镇与世界卡完全一样，两侧添两座远岛；顶边对齐，下沿淡进纸面。</p>
      <div className="we-design-lab__graphics-banners">
        {SCENE_NAMES.slice(0, 2).map((name) => <SceneTile key={name} name={name} variant="banner" wide />)}
      </div>
    </Section>
  );
}

function IconSet() {
  return (
    <Section id="graphics-icons" title="图标「切角」">
      <p className="we-design-lab__note">只有直线，圆画成八边形，转角切 45°，方头尖角；每个图标至多一段走强调色，压在强调色或危险色实底上时改回按钮文字色。新增图标照 components/ui/icons.jsx 头部的规则画。</p>
      {ICON_GROUPS.map((group) => (
        <div key={group.label} className="we-design-lab__graphics-group">
          <p className="we-design-lab__note">{group.label}</p>
          <ul className="we-design-lab__graphics-icons">
            {Object.entries(group.items).map(([key, label]) => {
              const Icon = icons[key];
              return (
                <li key={key} className="we-design-lab__graphics-icon" title={key}>
                  <span className="we-design-lab__graphics-icon-sizes">
                    <Icon size={24} />
                    <Icon size={16} />
                  </span>
                  <span className="we-design-lab__graphics-icon-label">{label}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      <div className="we-design-lab__graphics-inplace">
        <p className="we-design-lab__note">放进真实按钮里：强调色的那一段在主按钮、危险按钮上改回文字色，悬停删除时整枚变红。</p>
        <div className="we-design-lab__graphics-row">
          <IconButton size="sm" label="复制"><icons.IconCopy size={16} /></IconButton>
          <IconButton size="sm" label="重新生成"><icons.IconRotateCcw size={16} /></IconButton>
          <IconButton size="sm" label="编辑"><icons.IconPencil size={16} /></IconButton>
          <IconButton size="sm" variant="danger" label="删除"><icons.IconTrash size={16} /></IconButton>
          <IconButton variant="primary" label="发送"><icons.IconArrowUp size={20} /></IconButton>
          <IconButton variant="primary" label="停止"><icons.IconStop size={16} /></IconButton>
          <Button variant="danger" size="sm"><icons.IconTrash size={16} />删除</Button>
        </div>
        <div className="we-design-lab__graphics-row">
          <Button variant="secondary" size="sm"><icons.IconSummary size={16} />剧情摘要</Button>
          <Button variant="secondary" size="sm"><icons.IconState size={16} />状态记忆</Button>
          <Button variant="ghost" size="sm"><icons.IconAssistant size={16} />助手</Button>
          <Button variant="primary" size="sm"><icons.IconPlus size={16} />新建</Button>
        </div>
      </div>
    </Section>
  );
}

export default function GraphicsTab() {
  return (
    <div className="we-design-lab__graphics">
      <Marks />
      <Scenes />
      <IconSet />
    </div>
  );
}
