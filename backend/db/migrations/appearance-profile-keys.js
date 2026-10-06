import { upgradeLegacyProfileDefaults } from '../../utils/legacy-profile-keys.js';

/**
 * 外貌档案字段改名：显著特征 → 外貌特征（原样），体型（一句话）→ 身材特征（列表第一条）。
 * 会话档案的历史版本行一起改，回滚到旧轮次时读到的也是新字段；角色卡、玩家卡的档案初始值同样转换。
 */
// guard-allow(perf-shape): 一次性数据迁移，由 user_version 保证只跑一次
export function migrateAppearanceProfileKeys(db) {
  db.transaction(() => {
    db.exec(`UPDATE state_profile_fields SET field_key = 'appearance_features' WHERE field_key = 'distinguishing_features'`);
    db.exec(`
      UPDATE state_profile_fields
      SET field_key = 'body_features',
          value_json = CASE WHEN json_valid(value_json) THEN
            CASE json_type(value_json) WHEN 'text' THEN json_array(json_extract(value_json, '$')) ELSE value_json END
          ELSE value_json END
      WHERE field_key = 'build'
    `);
    for (const table of ['characters', 'personas']) {
      const update = db.prepare(`UPDATE ${table} SET profile_defaults_json = ? WHERE id = ?`);
      const rows = db.prepare(`SELECT id, profile_defaults_json FROM ${table} WHERE profile_defaults_json LIKE '%"build"%' OR profile_defaults_json LIKE '%"distinguishing_features"%'`).all();
      for (const row of rows) {
        let defaults;
        try { defaults = JSON.parse(row.profile_defaults_json); } catch { continue; }
        if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) continue;
        update.run(JSON.stringify(upgradeLegacyProfileDefaults(defaults)), row.id);
      }
    }
  })();
}
