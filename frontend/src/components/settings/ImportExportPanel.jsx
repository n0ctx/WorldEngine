import { useState, useRef } from 'react';
import { useAppModeStore } from '../../store/appMode';
import { downloadGlobalSettings, importGlobalSettings, readJsonFile } from '../../api/importExport';
import { refreshCustomCss } from '../../api/customCssSnippets';
import { invalidateCache, loadRules } from '../../utils/regex-runner';
import ModeSwitch from './ModeSwitch';
import Button from '../ui/Button';

export default function ImportExportPanel({ onImportSuccess }) {
  const fileInputRef = useRef(null);
  const [mode, setMode] = useState('chat');
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
        loadRules().catch(() => {}),
      ]);
      invalidateCache();
      const label = result.mode === 'writing' ? '写作空间' : '对话空间';
      setMessage({ type: 'ok', text: `导入成功，已覆盖${label}全局设置` });
      onImportSuccess?.();
    } catch (e) {
      setMessage({ type: 'err', text: `导入失败：${e.message}` });
    } finally {
      setImporting(false);
    }
  }

  const modeLabel = mode === 'writing' ? '写作空间' : '对话空间';

  return (
    <div>
      <h2 className="we-settings-section-title">导入导出</h2>

      <div className="we-settings-field-group">
        <ModeSwitch mode={mode} onChange={(m) => { setMode(m); setMessage(null); }} />

        <p style={{ fontFamily: 'var(--we-font-serif)', fontSize: '13px', color: 'var(--we-ink-faded)', lineHeight: '1.7', margin: '0 0 16px' }}>
          当前操作范围：<strong>{modeLabel}</strong>。导出内容包括该模式的全局 Prompt（system/post prompt、prompt 条目）、自定义 CSS、全局正则规则。不含 LLM 配置与 API 密钥。
          <br />
          导入为<strong>覆盖</strong>模式，仅清空并写入<strong>{modeLabel}</strong>的数据，不影响另一空间。
        </p>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
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
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
        </div>

        {message && (
          <p style={{
            marginTop: '12px',
            fontFamily: 'var(--we-font-serif)',
            fontSize: '13px',
            color: message.type === 'ok' ? 'var(--we-gold-leaf)' : 'var(--we-vermilion)',
          }}>
            {message.text}
          </p>
        )}
      </div>
    </div>
  );
}
