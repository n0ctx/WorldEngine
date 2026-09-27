import { useCallback, useRef, useState } from 'react';
import { updateWorld, uploadWorldCover } from '../../core/api/worlds';
import {
  extractAccentColorFromFile,
  extractAccentColorFromImageSrc,
  FALLBACK_ACCENT_HEX,
} from '../../core/utils/extractAccentColor.js';
import { getAvatarColor, getAvatarUrl } from '../../core/utils/avatar';
import { log } from '../../core/utils/logger.js';

export default function useWorldAppearance(worldId) {
  const [coverPath, setCoverPath] = useState(null);
  const [coverBustKey, setCoverBustKey] = useState(0);
  const [coverUploading, setCoverUploading] = useState(false);
  const coverFileInputRef = useRef(null);
  const [accentColor, setAccentColor] = useState(null);
  const [accentSource, setAccentSource] = useState('auto');
  const [accentSaving, setAccentSaving] = useState(false);

  const onWorldLoaded = useCallback((world) => {
    setCoverPath(world.cover_path ?? null);
    setAccentColor(world.accent_color ?? null);
    setAccentSource(world.accent_source === 'manual' ? 'manual' : 'auto');
  }, []);

  async function handleCoverFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setCoverUploading(true);
    try {
      // 手工指定的主色不随封面重算；自动模式才在上传时提取主色。
      const nextAccentColor = accentSource === 'manual' ? null : await extractAccentColorFromFile(file);
      const result = await uploadWorldCover(worldId, file, nextAccentColor);
      setCoverPath(result.cover_path);
      setCoverBustKey(Date.now());
      if (accentSource !== 'manual') {
        setAccentColor(result.accent_color ?? null);
        setAccentSource(result.accent_source === 'manual' ? 'manual' : 'auto');
      }
      window.dispatchEvent(new Event('we:world-updated'));
    } catch (error) {
      log.error('world.cover.upload_failed', error, { toast: `封面上传失败：${error.message}` });
    } finally {
      setCoverUploading(false);
      event.target.value = '';
    }
  }

  async function handleAccentSourceToggle(nextIsManual) {
    setAccentSaving(true);
    try {
      if (nextIsManual) {
        const manualColor = accentColor ?? FALLBACK_ACCENT_HEX;
        await updateWorld(worldId, { accent_color: manualColor, accent_source: 'manual' });
        setAccentColor(manualColor);
        setAccentSource('manual');
      } else {
        const recomputed = coverPath ? await extractAccentColorFromImageSrc(getAvatarUrl(coverPath)) : null;
        await updateWorld(worldId, { accent_color: recomputed, accent_source: 'auto' });
        setAccentColor(recomputed);
        setAccentSource('auto');
      }
      window.dispatchEvent(new Event('we:world-updated'));
    } catch (error) {
      log.error('world.accent.update_failed', error, { toast: `主色更新失败：${error.message}` });
    } finally {
      setAccentSaving(false);
    }
  }

  async function handleAccentColorPick(hex) {
    setAccentColor(hex);
    setAccentSaving(true);
    try {
      await updateWorld(worldId, { accent_color: hex, accent_source: 'manual' });
      window.dispatchEvent(new Event('we:world-updated'));
    } catch (error) {
      log.error('world.accent.update_failed', error, { toast: `主色更新失败：${error.message}` });
    } finally {
      setAccentSaving(false);
    }
  }

  return {
    coverPath,
    coverBustKey,
    coverAvatarUrl: coverBustKey ? `${getAvatarUrl(coverPath)}?t=${coverBustKey}` : getAvatarUrl(coverPath),
    worldAvatarColor: getAvatarColor(worldId),
    coverUploading,
    coverFileInputRef,
    accentColor,
    accentSource,
    accentSaving,
    accentColorInput: accentColor ?? FALLBACK_ACCENT_HEX,
    onWorldLoaded,
    handleCoverFileChange,
    handleAccentSourceToggle,
    handleAccentColorPick,
  };
}
