import { useState, useRef } from 'react';
import { useAppModeStore } from '../../store/appMode';
import { downloadGlobalSettings, importGlobalSettings, readJsonFile } from '../../api/import-export';
import { refreshCustomCss } from '../../api/custom-css-snippets';
import { invalidateCache, loadRules } from '../../utils/regex-runner';
import ModeSwitch from './ModeSwitch';
import Button from '../ui/Button';
import { SETTINGS_MODE } from './SettingsConstants';

export default function ImportExportPanel({ onImportSuccess }) {
  const fileInputRef = useRef(null);
  const [mode, setMode] = useState(SETTINGS_MODE.CHAT);
  const [exporting, setExporting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [message, setMessage] = useState(null);
  const appMode = useAppModeStore((s) => s.appMode);

  async function handleExport() {
    setExporting(true);
    setMessage(null);
    try {
      await downloadGlobalSettings(mode);
      setMessage({ type: 'ok', text: '导出成功' });
    } catch (e) {
      setMessage({ type: 'err', text: `导出失败：${e.message}` });
    } finally {
      setExporting(false);
    }
  }

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!fileInputRef.current) return;
    fileInputRef.current.value = '';
    if (!file) return;
    setImporting(true);
    setMessage(null);
    try {
      const data = await readJsonFile(file);
      const result = await importGlobalSettings(data);
      await Promise.all([
        refreshCustomCss(appMode),
        loadRules(appMode).catch(() => {}),
      ]);
      invalidateCache();
      const label = result.mode === SETTINGS_MODE.WRITING ? '写作' : '对话';
      setMessage({ type: 'ok', text: `导入成功，已覆盖${label}全局设置` });
      onImportSuccess?.();
    } catch (e) {
      setMessage({ type: 'err', text: `导入失败：${e.message}` });
    } finally {
      setImporting(false);
    }
  }

  const modeLabel = mode === SETTINGS_MODE.WRITING ? '写作' : '对话';

  return (
    <div>
      <h2 className="we-settings-section-title">导入导出</h2>

      <div className="we-settings-field-group">
        <ModeSwitch mode={mode} onChange={(m) => { setMode(m); setMessage(null); }} />

        <p className="mb-4 mt-0 text-[13px] leading-[1.7] text-[var(--we-color-text-tertiary)] [font-family:var(--we-font-serif)]">
          当前操作范围：<strong>{modeLabel}</strong>。导出内容包括该模式的全局提示词（system/post prompt、prompt 条目）、自定义 CSS、全局正则规则。不含 LLM 配置与功能配置。
          <br />
          导入为<strong>覆盖</strong>模式，仅清空并写入<strong>{modeLabel}</strong>的数据，不影响另一空间。
        </p>

        <div className="flex flex-wrap gap-3">
          <Button onClick={handleExport} disabled={exporting}>
            {exporting ? '导出中…' : `导出${modeLabel}设置`}
          </Button>
          <Button variant="ghost" onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? '导入中…' : '导入设置文件'}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".json,.weglobal.json"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {message && (
          <p className={[
            'mt-3 text-[13px] [font-family:var(--we-font-serif)]',
            message.type === 'ok' ? 'text-[var(--we-color-gold)]' : 'text-[var(--we-color-accent)]',
          ].join(' ')}
          >
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
