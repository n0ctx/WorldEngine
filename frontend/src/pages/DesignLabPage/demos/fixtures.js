export const PROSE = '雨从傍晚一直下到后半夜。你推开拳场的铁门，潮气和汗味一起涌出来，'
  + '灯泡在头顶晃，照得围栏上的血迹时明时暗。台下有人认出了你，低声报出一个数字——'
  + '那是上一场你输掉的赔率。你没有停，径直走到场边，把湿透的外套搭在栏杆上。';

export const TURNS = [
  { hp: 87, favor: 40, gold: 1200, place: '贫民区' },
  { hp: 62, favor: 55, gold: 1200, place: '地下拳场，灯光昏暗，四周站满下注的人' },
  { hp: 91, favor: 48, gold: 850, place: '诊所后巷' },
];

export const TOASTS = ['设置已保存', '已保存为角色卡', '标题已更新：雨夜里的拳场'];
export const NAV = ['世界规则', '状态字段', '开场白', '写作风格'];
export const CARDS = ['艾拉推开了门', '雨声忽然变大', '台下有人喊你的名字', '灯灭了一瞬'];
export const CODE = JSON.stringify({ category: 'violence', severity: 'medium', filtered: false }, null, 2);

export const CHAT = [
  { id: 'lab-m1', role: 'user', content: '我推开铁门，走进拳场。', created_at: '2026-01-01T12:00:00Z' },
  { id: 'lab-m2', role: 'assistant', content: '雨从傍晚一直下到后半夜。灯泡在头顶晃，照得围栏上的血迹时明时暗。', created_at: '2026-01-01T12:00:05Z' },
  { id: 'lab-m3', role: 'user', content: '我问台下的人，今晚谁上场。', created_at: '2026-01-01T12:01:00Z' },
  { id: 'lab-m4', role: 'assistant', content: '有人低声报出一个数字，那是上一场你输掉的赔率。', created_at: '2026-01-01T12:01:05Z' },
  { id: 'lab-m5', role: 'user', content: '我把外套搭在栏杆上。', created_at: '2026-01-01T12:02:00Z' },
  { id: 'lab-m6', role: 'assistant', content: '灯灭了一瞬，再亮起时，对面的台阶上多了一个人。', created_at: '2026-01-01T12:02:05Z' },
];

export const SPEAKERS = [
  { id: 'lab-s1', name: '艾拉', description: '拳场的老板娘' },
  { id: 'lab-s2', name: '老K', description: '总在角落里数钱' },
  { id: 'lab-s3', name: '旁白', description: '' },
];

export const SELECT_OPTIONS = [
  { value: 'a', label: '写作风格 A' },
  { value: 'b', label: '写作风格 B' },
  { value: 'c', label: '写作风格 C' },
  { value: 'd', label: '写作风格 D' },
];

export const OPTIONS = ['上前搭话', '继续观察', '转身离开'];

export function toRows(turn) {
  return [
    { field_key: 'hp', label: '生命', type: 'number', max_value: 100, effective_value_json: JSON.stringify(turn.hp) },
    { field_key: 'favor', label: '好感度', type: 'number', effective_value_json: JSON.stringify(turn.favor) },
    { field_key: 'gold', label: '金钱', type: 'number', unit: '元', effective_value_json: JSON.stringify(turn.gold) },
    { field_key: 'place', label: '位置', type: 'text', effective_value_json: JSON.stringify(turn.place) },
  ];
}

export function changedKeysBetween(prev, next) {
  return new Set(Object.keys(next).filter((key) => prev[key] !== next[key]));
}

export const CAST = [
  { id: 'lab-c1', name: '艾拉', description: '拳场的老板娘，认得每一个欠债的人' },
  { id: 'lab-c2', name: '老K', description: '总在角落里数钱' },
];

export const STORYLINES = [
  { id: 'lab-t1', mode: 'chat', character_id: 'lab-c1', title: '雨夜里的拳场', last_message: '灯灭了一瞬，再亮起时，对面的台阶上多了一个人。', updated_at: '2026-01-01T12:00:00Z' },
  { id: 'lab-t2', mode: 'writing', title: '诊所后巷', last_message: '你在后巷等到天亮。', updated_at: '2025-12-30T12:00:00Z' },
  { id: 'lab-t3', mode: 'chat', character_id: 'lab-c2', title: '', last_message: '', updated_at: '2025-12-28T12:00:00Z' },
];

const WORLD_NAMES = [
  ['无限轮回', '雨夜、拳场与欠下的债。'],
  ['凡人修仙', '一个没有灵根的少年。'],
  ['丧尸末日', ''],
];

export const WORLDS = WORLD_NAMES.map(([name, description], index) => ({
  id: `lab-w${index}`,
  name,
  description,
  cover_path: null,
  character_count: index === 2 ? 0 : CAST.length + index,
  cast: index === 2 ? [] : CAST,
  updated_at: '2026-01-01T12:00:00Z',
}));
