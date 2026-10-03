import { useEffect, useState } from 'react';
import { Card, EmptyState, SectionTitle } from '../../../components/index.js';
import FormGroup from '../../../components/ui/FormGroup';
import StateValueField from '../../../components/state/StateValueField';
import { groupRowsByProfile } from '../../../components/state/profile-groups.js';
import { getCharacterProfileDefaults, updateCharacterProfileDefault } from '../../../core/api/character-state-values.js';
import { getPersonaProfileDefaults, updatePersonaProfileDefault } from '../../../core/api/persona-state-values.js';
import { getCharactersByWorld } from '../../../core/api/characters.js';
import { listPersonas } from '../../../core/api/personas.js';
import { log } from '../../../core/utils/logger.js';

const OWNERS = {
  character: {
    label: '角色',
    list: getCharactersByWorld,
    getRows: (_worldId, id) => getCharacterProfileDefaults(id),
    write: (_worldId, id, fieldKey, valueJson) => updateCharacterProfileDefault(id, fieldKey, valueJson),
  },
  persona: {
    label: '玩家',
    list: listPersonas,
    getRows: (_worldId, id) => getPersonaProfileDefaults(id),
    write: (_worldId, id, fieldKey, valueJson) => updatePersonaProfileDefault(id, fieldKey, valueJson),
  },
};

/** 规则页「角色状态 / 玩家状态」里的档案默认值：按每张卡填写身份、外貌、人格。 */
export default function CardProfileDefaultsDetail({ worldId, scopeKey }) {
  const owner = OWNERS[scopeKey];
  const [cards, setCards] = useState([]);
  const [rowsByCard, setRowsByCard] = useState({});

  useEffect(() => {
    let cancelled = false;
    owner.list(worldId)
      .then(async (list) => {
        const rows = await Promise.all(list.map((card) => owner.getRows(worldId, card.id)));
        if (cancelled) return;
        setCards(list);
        setRowsByCard(Object.fromEntries(list.map((card, index) => [card.id, rows[index]])));
      })
      .catch((err) => log.error('rules.profile_defaults.load_failed', err, { toast: err.message || '档案默认值加载失败' }));
    return () => { cancelled = true; };
  }, [worldId, scopeKey, owner]);

  async function save(cardId, fieldKey, valueJson) {
    try {
      await owner.write(worldId, cardId, fieldKey, valueJson);
    } catch (err) {
      log.error('rules.profile_defaults.save_failed', err, { toast: err.message || '档案默认值保存失败' });
    }
  }

  return (
    <Card variant="sunken" className="we-entry-editor-panel we-workshop-detail-inner">
      <div className="we-workshop-detail-head">
        <div>
          <SectionTitle level="group">档案默认值</SectionTitle>
          <p className="we-workshop-detail-desc">
            每张{owner.label}卡的身份、外貌{scopeKey === 'character' ? '、人格' : ''}。新故事线开始时带入，已有故事线不受影响。
          </p>
        </div>
      </div>
      {cards.length === 0 ? (
        <EmptyState size="sm" title={`暂无${owner.label}`} />
      ) : cards.map((card) => (
        <CardProfileGroups
          key={card.id}
          name={card.name || '未命名'}
          rows={rowsByCard[card.id] ?? []}
          onSave={(fieldKey, valueJson) => save(card.id, fieldKey, valueJson)}
        />
      ))}
    </Card>
  );
}

function CardProfileGroups({ name, rows, onSave }) {
  const groups = groupRowsByProfile(rows);
  return (
    <div className="we-workshop-section">
      <span className="we-entry-editor-label">{name}</span>
      {groups.map(({ group, fields }) => (
        <FormGroup key={group} label={group}>
          <div className="we-state-value-list">
            {fields.map((field) => (
              <div key={field.field_key} className="we-state-value-row">
                <p className="we-state-value-label">{field.label}</p>
                <StateValueField field={field} onSave={onSave} />
              </div>
            ))}
          </div>
        </FormGroup>
      ))}
    </div>
  );
}
