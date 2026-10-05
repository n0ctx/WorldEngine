import StateFieldList from '../../components/rules/StateFieldList';
import WorldProfileDefaultsFields from '../../components/rules/WorldProfileDefaultsFields.jsx';
import AvatarUpload from '../../components/ui/AvatarUpload';
import Divider from '../../components/ui/Divider.jsx';
import FormGroup from '../../components/ui/FormGroup';
import Input from '../../components/ui/Input';
import Textarea from '../../components/ui/Textarea';
import SectionTabs from '../../components/ui/SectionTabs.jsx';
import ToggleSwitch from '../../components/ui/ToggleSwitch';
import {
  listWorldStateFields, createWorldStateField,
  updateWorldStateField, deleteWorldStateField, reorderWorldStateFields,
} from '../../core/api/world-state-fields';
import {
  listCharacterStateFields, createCharacterStateField,
  updateCharacterStateField, deleteCharacterStateField, reorderCharacterStateFields,
} from '../../core/api/character-state-fields';
import {
  listPersonaStateFields, createPersonaStateField,
  updatePersonaStateField, deletePersonaStateField, reorderPersonaStateFields,
} from '../../core/api/persona-state-fields';

export default function WorldEditSections({ isCreate, worldId, navigate, diaryChatDateMode, appearance, page }) {
  const sections = [
    {
      key: 'basic',
      label: '基础设定',
      content: (
        <BasicSettingsSection
          isCreate={isCreate}
          appearance={appearance}
          name={page.name}
          setName={page.setName}
          description={page.description}
          setDescription={page.setDescription}
        />
      ),
    },
    {
      key: 'llm',
      label: '模型参数',
      content: (
        <LlmSettingsSection
          temperature={page.temperature}
          setTemperature={page.setTemperature}
          maxTokens={page.maxTokens}
          setMaxTokens={page.setMaxTokens}
        />
      ),
    },
  ];

  if (!isCreate) {
    sections.push({
      key: 'state_templates',
      label: '状态模板',
      content: <StateTemplatesSection worldId={worldId} navigate={navigate} diaryChatDateMode={diaryChatDateMode} />,
    });
  }

  return <SectionTabs sections={sections} defaultKey="basic" variant="gooey" />;
}

function BasicSettingsSection({ isCreate, name, setName, description, setDescription, appearance }) {
  const {
    coverAvatarUrl,
    worldAvatarColor,
    coverUploading,
    coverFileInputRef,
    accentColor,
    accentSource,
    accentSaving,
    accentColorInput,
    handleCoverFileChange,
    handleAccentSourceToggle,
    handleAccentColorPick,
  } = appearance;

  return (
    <div className="we-edit-form-stack">
      <FormGroup label="名称" required>
        <Input value={name} onChange={e => setName(e.target.value)} placeholder="世界的名称" autoFocus={isCreate} />
      </FormGroup>
      <FormGroup label="简介" hint="纯展示用途，不注入提示词">
        <Textarea
          rows={3}
          value={description}
          onChange={e => setDescription(e.target.value)}
          placeholder="一句话介绍这个世界…"
        />
      </FormGroup>
      {!isCreate && (
        <FormGroup label="封面图" hint="上传后立即生效。铺满世界卡片背景，建议比例 16:10 或横向图片">
          <AvatarUpload
            name={name}
            avatarUrl={coverAvatarUrl}
            avatarColor={worldAvatarColor}
            avatarUploading={coverUploading}
            fileInputRef={coverFileInputRef}
            onAvatarClick={() => coverFileInputRef.current?.click()}
            onFileChange={handleCoverFileChange}
            shape="rect"
            hint="点击上传封面图"
          />
        </FormGroup>
      )}
      {!isCreate && (
        <FormGroup
          label="主色"
          hint={`修改后立即生效。${accentSource === 'manual' ? '已手工指定，封面变化不再自动覆盖' : '自动跟随封面：从封面图取主导色，替代主题默认的界面主色'}`}
        >
          <div className="we-edit-accent-row">
            <ToggleSwitch
              checked={accentSource === 'manual'}
              onChange={handleAccentSourceToggle}
              label="手动指定主色"
              disabled={accentSaving}
            />
            <span className="we-edit-accent-label">{accentSource === 'manual' ? '手动指定' : '自动（跟随封面）'}</span>
            {accentSource === 'manual' && (
              <input
                type="color"
                className="we-edit-accent-swatch"
                value={accentColorInput}
                disabled={accentSaving}
                onChange={(e) => handleAccentColorPick(e.target.value)}
                aria-label="选择主色"
              />
            )}
            {accentSource !== 'manual' && (
              <span
                className="we-edit-accent-swatch we-edit-accent-swatch--readonly"
                style={{ '--we-edit-accent-preview': accentColor ?? 'var(--we-color-accent)' }}
                title={accentColor ?? '主题默认色'}
              />
            )}
          </div>
        </FormGroup>
      )}
    </div>
  );
}

function LlmSettingsSection({ temperature, setTemperature, maxTokens, setMaxTokens }) {
  return (
    <div className="we-edit-form-stack">
      <FormGroup label="随机度" hint="即 Temperature。只对这个世界生效，留空则用全局设置">
        <Input
          type="number"
          step="0.01"
          min="0"
          max="2"
          value={temperature}
          onChange={e => setTemperature(e.target.value)}
          placeholder="留空则使用全局配置"
        />
      </FormGroup>
      <FormGroup label="单次回复上限" hint="即 Max Tokens。只对这个世界生效，留空则用全局设置">
        <Input
          type="number"
          step="1"
          min="1"
          value={maxTokens}
          onChange={e => setMaxTokens(e.target.value)}
          placeholder="留空则使用全局配置"
        />
      </FormGroup>
    </div>
  );
}

function StateTemplatesSection({ worldId, navigate, diaryChatDateMode }) {
  return (
    <div>
      <p className="we-edit-hint">这一页的修改即时生效，不用点保存。</p>
      <p className="we-config-workshop-hint">
        想以字段为中心、一站式设置各角色/玩家默认值与设定条目？
        <button
          type="button"
          className="we-workshop-entry-link"
          onClick={() => navigate(`/worlds/${worldId}/rules?tab=state`)}
        >
          前往这个世界的规则 →
        </button>
      </p>
      <WorldProfileDefaultsFields worldId={worldId} />
      <StateFieldList
        scope="world"
        worldId={worldId}
        diaryDateMode={diaryChatDateMode}
        listFn={listWorldStateFields}
        createFn={createWorldStateField}
        updateFn={updateWorldStateField}
        deleteFn={deleteWorldStateField}
        reorderFn={reorderWorldStateFields}
      />
      <Divider size="lg" />
      <StateFieldList
        scope="character"
        worldId={worldId}
        listFn={listCharacterStateFields}
        createFn={createCharacterStateField}
        updateFn={updateCharacterStateField}
        deleteFn={deleteCharacterStateField}
        reorderFn={reorderCharacterStateFields}
      />
      <Divider size="lg" />
      <StateFieldList
        scope="persona"
        worldId={worldId}
        listFn={listPersonaStateFields}
        createFn={createPersonaStateField}
        updateFn={updatePersonaStateField}
        deleteFn={deletePersonaStateField}
        reorderFn={reorderPersonaStateFields}
      />
    </div>
  );
}
