import { useEffect, useRef, useState } from 'react';
import Button from '../../../components/ui/Button.jsx';
import EmptyState from '../../../components/ui/EmptyState.jsx';
import Skeleton from '../../../components/ui/Skeleton.jsx';
import StateValueField from '../../../components/state/StateValueField';
import { log } from '../../../core/utils/logger.js';

// ── 默认值矩阵：行=该作用域下各实例 ──
export default function DefaultValueMatrix({ worldId, scope, field }) {
  const [instances, setInstances] = useState([]);
  const [rowsByInstance, setRowsByInstance] = useState({}); // instId -> field row
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  const [bulkSaving, setBulkSaving] = useState(false);
  const bulkDraftRef = useRef(null); // 批量草稿值（JSON 串），点「应用」前不写库

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const insts = await scope.getInstances(worldId);
        const valuesList = await Promise.all(insts.map((inst) => scope.getValues(worldId, inst.id)));
        if (cancelled) return;
        const map = {};
        insts.forEach((inst, i) => {
          const rows = Array.isArray(valuesList[i]) ? valuesList[i] : [];
          map[inst.id] = rows.find((r) => r.field_key === field.field_key) ?? null;
        });
        setInstances(insts);
        setRowsByInstance(map);
      } catch (err) {
        log.error('workshop.matrix.load_failed', err, { toast: err.message || '加载默认值失败' });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [scope, worldId, field.field_key, reload]);

  async function handleCellSave(instId, fieldKey, valueJson) {
    try {
      await scope.updateValue(worldId, instId, fieldKey, valueJson);
    } catch (err) {
      log.error('workshop.matrix.save_failed', err, { toast: err.message || '保存失败' });
    }
  }

  // 批量控件只把值记进草稿，不写库——避免自动保存控件每敲一下就 fan-out + remount 矩阵导致闪烁
  function handleBulkDraft(_fieldKey, valueJson) {
    bulkDraftRef.current = valueJson;
  }

  // 点「应用到全部」才真正写入所有实例，并一次性重拉使各格 remount 显示新值
  async function handleBulkApply() {
    const valueJson = bulkDraftRef.current;
    if (valueJson == null) return;
    setBulkSaving(true);
    try {
      await Promise.all(instances.map((inst) => scope.updateValue(worldId, inst.id, field.field_key, valueJson)));
      setReload((k) => k + 1);
    } catch (err) {
      log.error('workshop.matrix.bulk_failed', err, { toast: err.message || '批量保存失败' });
    } finally {
      setBulkSaving(false);
    }
  }

  // 批量控件复用某实例的字段行，但清空值使其从空白开始
  const sampleRow = instances.map((i) => rowsByInstance[i.id]).find(Boolean);
  const bulkField = sampleRow
    ? { ...sampleRow, value_json: null, default_value_json: null, effective_value_json: null }
    : null;

  return (
    <div className="we-workshop-section">
      <span className="we-entry-editor-label">各{scope.label}默认值</span>

      {loading ? (
        <Skeleton />
      ) : instances.length === 0 ? (
        <EmptyState size="sm" title={`暂无${scope.label}`} />
      ) : (
        <div className="we-workshop-matrix">
          {bulkField && instances.length > 1 && (
            <div className="we-workshop-matrix-row">
              <span className="we-workshop-bulk-label">批量填同值</span>
              <div className="we-workshop-bulk">
                <StateValueField
                  size="sm"
                  key={`bulk:${field.field_key}`}
                  field={bulkField}
                  onSave={handleBulkDraft}
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={handleBulkApply}
                  disabled={bulkSaving}
                >
                  {bulkSaving ? '应用中…' : '应用到全部'}
                </Button>
              </div>
            </div>
          )}
          {instances.map((inst) => {
            const row = rowsByInstance[inst.id];
            return (
              <div key={inst.id} className="we-workshop-matrix-row">
                <span className="we-workshop-matrix-name">{inst.name || '未命名'}</span>
                <div className="we-workshop-matrix-value">
                  {row ? (
                    <StateValueField
                      size="sm"
                      field={row}
                      onSave={(fk, vj) => handleCellSave(inst.id, fk, vj)}
                    />
                  ) : (
                    <span className="we-workshop-empty">—</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
