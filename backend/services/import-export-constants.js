// 导入导出文件的 format 字段值（契约值，前后端约定）
// 单一来源；改值意味着导出格式版本号 bump，需同步更新 docs/references/backend/schema-and-storage.md 与测试断言。
export const EXPORT_FORMAT_CHARACTER = 'worldengine-character-v1';
export const EXPORT_FORMAT_PERSONA = 'worldengine-persona-v1';
export const EXPORT_FORMAT_WORLD = 'worldengine-world-v1';
export const EXPORT_FORMAT_GLOBAL_SETTINGS = 'worldengine-global-settings-v1';
