import Select from '../ui/Select';
import FormGroup from '../ui/FormGroup';
import SectionTitle from '../ui/SectionTitle';

/**
 * 写作助手模型选择区块
 * 单选项：主模型 / 副模型
 */
export default function AssistantModelBlock({ modelSource, onModelSourceChange }) {
  return (
    <div className="we-settings-field-group">
      <SectionTitle level="group" as="p">写卡助手模型</SectionTitle>

      <FormGroup label="模型来源" hint="写卡助手（创建/编辑卡片）使用哪个模型。" variant="settings">
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
