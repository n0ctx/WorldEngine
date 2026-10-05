import Button from '../ui/Button.jsx';
import { describeGenerationError } from '../../core/utils/generation-error.js';
import { useOpenSettings } from '../../core/hooks/useOpenSettings.js';

// 「生成失败：原因」：对话与写作共用。常见失败翻成用户能处理的说法（原文放悬停提示），改设置能解决的给「去设置」
export default function GenerationErrorText({ errorMsg, className }) {
  const openSettings = useOpenSettings();
  const error = describeGenerationError(errorMsg);
  return (
    <>
      <span className={className} title={error.detail ?? undefined}>
        生成失败：{error.text}
      </span>
      {error.fixInSettings && (
        <Button type="button" variant="text" size="sm" onClick={openSettings}>去设置</Button>
      )}
    </>
  );
}
