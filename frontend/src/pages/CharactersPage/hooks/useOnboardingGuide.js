import { useMemo } from 'react';
import { updateWorld } from '../../../core/api/worlds';
import { log } from '../../../core/utils/logger.js';

// ── 新世界搭建引导：完成度判断 + 引导内的跳转 / 关闭 ──────────────────────────
//
// 「新世界」判断标准：世界观描述 / 角色 / 规则三项是否都已存在内容，纯客观完成度，
// 不看创建时间——时间阈值会过期（老账号里几分钟前建的世界和半年前建的世界该一视同
// 仁），完成度不会。三项全部完成后引导自动消失，不再占位；未完成时即使用户来回
// 切换页面也会稳定复现，不会像"已读标记"那样过几天自己消失。
//
// 「关闭」与「完成」是两件独立的事：完成是可计算的客观状态，关闭是用户的主观选择
// （persisted 到 worlds.onboarding_dismissed）。关闭后即便三步仍未做完也不再弹出，
// 尊重用户"我知道，不用管我"的意愿；但反过来，只要三步真的做完了，引导必然消失，
// 不依赖是否点过关闭——不会出现「已经把三件事都做完了，却因为没点过关闭一直被打扰」
// 的情况。

export function useOnboardingGuide({ worldId, world, setWorld, characters, entries, navigate, location }) {
  const guideCompleted = useMemo(() => ({
    world: !!(world?.description && world.description.trim()),
    character: characters.length > 0,
    rule: entries.length > 0,
  }), [world, characters, entries]);

  const guideAllDone = guideCompleted.world && guideCompleted.character && guideCompleted.rule;
  // 不看 loading：保存后重新拉取期间引导保持挂载，刚完成的一步才能在原地划掉、沉底
  const showGuide = !!world && !guideAllDone && !world.onboarding_dismissed;

  function handleGuideStepClick(stepKey) {
    if (stepKey === 'world') {
      navigate(`/worlds/${worldId}/edit`, { state: { backgroundLocation: location } });
    } else if (stepKey === 'character') {
      navigate(`/worlds/${worldId}/characters/new`, { state: { backgroundLocation: location } });
    } else if (stepKey === 'rule') {
      navigate(`/worlds/${worldId}/rules`);
    }
  }

  async function handleDismissGuide() {
    // 乐观更新：不等接口返回就先隐藏，避免用户点了「跳过」还要再等一次网络往返。
    setWorld((w) => (w ? { ...w, onboarding_dismissed: 1 } : w));
    try {
      await updateWorld(worldId, { onboarding_dismissed: 1 });
    } catch (err) {
      log.error('world.onboarding_dismiss_failed', err, { toast: `关闭引导失败：${err.message}` });
      setWorld((w) => (w ? { ...w, onboarding_dismissed: 0 } : w));
    }
  }

  return { guideCompleted, showGuide, handleGuideStepClick, handleDismissGuide };
}
