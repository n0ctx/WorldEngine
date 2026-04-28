import Select from '../ui/Select';
import FormGroup from '../ui/FormGroup';

/**
 * 写作助手模型选择区块
 * 单选项：主模型 / 副模型
 */
export default function AssistantModelBlock({ modelSource, onModelSourceChange }) {
  return (
    <div className="we-settings-field-group">
      <p className="we-settings-subsection-title">写作助手模型(LLM)</p>

      <FormGroup label="模型来源" hint="写作助手（创建/编辑卡片）使用的 LLM 模型来源。">
        <Select
          value={modelSource || 'main'}
          onChange={onModelSourceChange}
          options={[
            { value: 'main', label: '主模型' },
            { value: 'aux', label: '副模型' },
          ]}
        />
      </FormGroup>
    </div>
  );
}
