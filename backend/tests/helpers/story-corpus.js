/**
 * story-corpus.js — 固定的长剧情回归语料与脚本化摘要器（上下文压缩的回归测试与对照评测共用）
 *
 * 语料是虚构的（人物、地点、物品都是编的），由固定种子生成，同一参数每次逐字相同。
 * 每轮回复里有一两句「事实句」（以 ※ 开头）和若干与剧情无关的描写；事实分五类：
 *   intro 人物登场 / promise 承诺（之后某段兑现）/ item 物品交接 / relation 关系变化 / secret 揭示的秘密，
 * 后面的轮次会提到更早的人物与物品（跨章节引用）。※ 只是给脚本化摘要器认事实用的记号。
 *
 * 脚本化摘要器只做确定性的抽取与截断，用来比较「同样的摘要策略下」新旧架构保住了多少事实，
 * 不代表任何真实模型的摘要质量。
 *
 * 对外暴露：
 *   buildStoryCorpus({ rounds, seed }) → { rounds:[{ round, scene, user, assistant, facts }], facts }
 *   scriptedSummary(texts, maxChars) → string    从原文或下级摘要里抽事实句，未了事项优先
 *   scriptedLimit(texts, tier) → number           脚本摘要的字数上限：不超过该级上限，也明显短于来源（像守规矩的模型那样）
 */

import { CONTEXT_SUMMARY_MAX_CHARS } from '../../utils/constants.js';

const PEOPLE = [
  ['老魏', '渡口的船夫', '左手缺了两根指头'],
  ['沈三娘', '青石镇客栈的老板娘', '说话总带三分笑'],
  ['阿蛮', '山里的猎户', '背一张铁胎弓'],
  ['白先生', '盐仓的账房', '记性极好'],
  ['卫九', '镇上的捕快', '腰间挂着旧铜牌'],
  ['苏绾', '游方的医女', '药箱上刻着莲花'],
  ['陆沉舟', '北岸灯塔的守塔人', '十年没下过塔'],
  ['小满', '客栈跑堂的少年', '跑得比谁都快'],
];
const PLACES = ['渡口', '青石镇客栈', '北岸灯塔', '山神庙', '盐仓', '旧码头', '药铺后院', '镇外驿道'];
const ITEMS = ['青铜罗盘', '半块玉佩', '铁钥匙', '盐引', '药方', '地图残页', '旧铜牌', '油纸伞'];
const TASKS = ['送一封信到北岸', '找回丢失的盐引', '护送苏绾出镇', '查清灯塔夜里的火光', '还清三两银子', '替阿蛮打听妹妹的下落'];
const RELATIONS = ['结为盟友', '翻了脸', '互相起了疑心', '重归于好', '订下师徒名分'];
const SECRETS = ['盐仓的账本有两本', '灯塔下面有一条暗道', '卫九其实是朝廷的密探', '玉佩的另一半在沈三娘手里', '药方里少写了一味药'];
const DEADLINES = ['三日后', '月底', '开春前', '下一个十五', '端午之前'];
const FILLERS = [
  '风从河面上吹过来，带着潮湿的腥气，远处的芦苇一阵一阵地伏下去。',
  '屋檐下的灯笼晃了晃，火苗缩成豆大一点，又慢慢亮起来。',
  '街角有人在吆喝卖炊饼，声音拖得很长，混在雨声里听不真切。',
  '桌上的茶已经凉了，杯沿留着一圈淡淡的水痕。',
  '天色暗得很快，云层压在山脊上，像一块湿透的旧棉絮。',
  '木板路在脚下吱呀作响，每走一步都像要陷进去。',
  '有只野猫从墙头跳下，停了停，又钻进了柴堆后面。',
  '炉子里的炭噼啪响了一声，溅出几点火星。',
];

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick(rand, list) {
  return list[Math.floor(rand() * list.length)];
}

function filler(rand, count) {
  return Array.from({ length: count }, () => pick(rand, FILLERS)).join('');
}

/** 一段剧情（arc）4–6 轮、同一场景；段内依次放事实，承诺在后面某段兑现 */
export function buildStoryCorpus({ rounds = 120, seed = 7 } = {}) {
  const rand = mulberry32(seed);
  const facts = [];
  const openPromises = [];
  const metPeople = [];
  const heldItems = [];
  const out = [];
  let round = 0;
  while (round < rounds) {
    const scene = pick(rand, PLACES);
    const arcLength = 4 + Math.floor(rand() * 3);
    for (let i = 0; i < arcLength && round < rounds; i++) {
      round += 1;
      const roundFacts = [];
      const add = (kind, text, key, extra = {}) => {
        const fact = { id: `f${facts.length + 1}`, round, kind, text, key, ...extra };
        facts.push(fact);
        roundFacts.push(fact);
      };
      const person = PEOPLE[(round + i) % PEOPLE.length];
      if (i === 0 && !metPeople.includes(person[0])) {
        metPeople.push(person[0]);
        add('intro', `※${person[0]}是${person[1]}，${person[2]}。`, `${person[0]}是${person[1]}`);
      } else if (i === 1) {
        const task = pick(rand, TASKS);
        const deadline = pick(rand, DEADLINES);
        add('promise', `※林遥答应${person[0]}在${deadline}${task}。`, `${deadline}${task}`, { open: true, task, who: person[0] });
        openPromises.push(facts.at(-1));
      } else if (i === 2) {
        const item = pick(rand, ITEMS);
        add('item', `※${person[0]}把${item}交给了林遥。`, `${person[0]}把${item}交给了林遥`);
        heldItems.push(item);
      } else if (i === 3) {
        add('relation', `※林遥与${person[0]}${pick(rand, RELATIONS)}。`, `林遥与${person[0]}`);
      } else if (i === 4) {
        add('secret', `※${person[0]}透露：${pick(rand, SECRETS)}。`, pick(rand, SECRETS));
        facts.at(-1).key = facts.at(-1).text.split('：')[1].replace('。', '');
      }
      if (i === arcLength - 1 && openPromises.length > 2) {
        const done = openPromises.shift();
        done.open = false;
        add('fulfil', `※林遥已经${done.task}，兑现了对${done.who}的承诺。`, `兑现了对${done.who}的承诺`);
      }
      const callback = heldItems.length > 3 ? `林遥摸了摸怀里的${heldItems[Math.floor(rand() * heldItems.length)]}。` : '';
      out.push({
        round,
        scene,
        user: `（第${round}轮）林遥在${scene}${pick(rand, ['四下打量', '压低声音问话', '把手按在刀柄上', '慢慢坐下'])}。`,
        assistant: [filler(rand, 2), ...roundFacts.map((f) => f.text), callback, filler(rand, 3)].join(''),
        facts: roundFacts,
      });
    }
  }
  return { rounds: out, facts };
}

const FACT_SENTENCE = /※[^※。]*。/g;
const SCRIPTED_SOURCE_RATIO = 0.6;

export function scriptedLimit(texts, tier) {
  const sourceChars = texts.reduce((sum, text) => sum + [...String(text)].length, 0);
  return Math.max(40, Math.min(CONTEXT_SUMMARY_MAX_CHARS[tier], Math.floor(sourceChars * SCRIPTED_SOURCE_RATIO)));
}

/** 从原文或下级摘要里抽事实句：先放未了事项（承诺且没被兑现），再按出现顺序放其余，截到 maxChars */
const DEADLINE_PATTERN = DEADLINES.join('|');
/** 承诺与兑现按「对谁 + 什么事」配对：同一个人的另一件事兑现了，不算这件也兑现了 */
const promiseKey = (sentence) => {
  const match = sentence.match(new RegExp(`答应(.+?)在(?:${DEADLINE_PATTERN})(.+?)。?$`));
  return match ? `${match[1]}|${match[2]}` : null;
};
const fulfilKey = (sentence) => {
  const match = sentence.match(/已经(.+?)，兑现了对(.+?)的承诺/);
  return match ? `${match[2]}|${match[1]}` : null;
};

export function scriptedSummary(texts, maxChars) {
  const sentences = [];
  for (const text of texts) {
    for (const match of String(text).match(FACT_SENTENCE) ?? []) sentences.push(match);
    for (const line of String(text).split('\n')) {
      if (line.startsWith('事实：')) sentences.push(...line.slice(3).split('|').filter(Boolean));
    }
  }
  const unique = [...new Set(sentences.map((s) => s.replace(/^※/, '')))];
  const fulfilled = new Set(unique.map(fulfilKey).filter(Boolean));
  const open = unique.filter((s) => promiseKey(s) && !fulfilled.has(promiseKey(s)));
  const rest = unique.filter((s) => !open.includes(s));
  const picked = [];
  let length = 0;
  for (const sentence of [...open, ...rest]) {
    if (length + sentence.length + 1 > maxChars - 3) break;
    picked.push(sentence);
    length += sentence.length + 1;
  }
  return `事实：${picked.sort((a, b) => unique.indexOf(a) - unique.indexOf(b)).join('|')}`;
}
