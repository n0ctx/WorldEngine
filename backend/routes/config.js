import { Router } from 'express';
import { getConfig, updateConfig, getAuxLlmConfig, getWritingLlmConfig, getWritingAuxLlmConfig, getProviderKey, updateProviderKey } from '../services/config.js';
import { validateModelFetchBaseUrl } from '../utils/network-safety.js';
import { applyProxy } from '../utils/proxy.js';
import { resolveModelPricing } from '../services/model-pricing.js';
import { fetchModels, getThinkingOptions, verifyLlmConnection, verifyModelConnection } from '../services/model-catalog.js';
import { createLogger, formatMeta, getLoggingConfig } from '../utils/logger.js';

const router = Router();
const log = createLogger('config', 'blue');

/** 通过顶层共享池获取指定 section 当前 provider 的 API Key */
function resolveApiKey(section, sharedKeys) {
  if (!section || !section.provider) return '';
  return sharedKeys?.[section.provider] || '';
}

/**
 * 从配置对象中脱敏 API Key：
 * - 顶层 provider_keys 替换为 { provider: bool } 映射
 * - 每个 section 暴露 has_key（按其 provider 在共享池中查找）
 */
function stripApiKeys(config) {
  const safe = structuredClone(config);
  const sharedKeys = safe.provider_keys || {};
  safe.provider_keys = Object.fromEntries(
    Object.entries(sharedKeys).map(([k, v]) => [k, !!v]),
  );
  if (safe.llm) safe.llm.has_key = !!resolveApiKey(safe.llm, sharedKeys);
  if (safe.aux_llm) safe.aux_llm.has_key = !!resolveApiKey(safe.aux_llm, sharedKeys);
  if (safe.writing?.llm) safe.writing.llm.has_key = !!resolveApiKey(safe.writing.llm, sharedKeys);
  if (safe.writing?.aux_llm) safe.writing.aux_llm.has_key = !!resolveApiKey(safe.writing.aux_llm, sharedKeys);
  return safe;
}

function sanitizeBaseUrlPatch(section) {
  if (!section || !('base_url' in section)) {
    return;
  }

  section.base_url = validateModelFetchBaseUrl(section.provider, section.base_url);
}

// GET /api/config — 返回当前配置（去掉 api_key）
router.get('/', async (_req, res) => {
  const config = getConfig();
  const logging = getLoggingConfig();
  const safe = stripApiKeys(config);

  const writingProvider = config.writing?.llm?.provider || config.llm?.provider;
  const writingModel = config.writing?.llm?.model || config.llm?.model;

  const [llmPricing, writingPricing] = await Promise.all([
    safe.llm ? resolveModelPricing(config.llm?.provider, config.llm?.model) : Promise.resolve(null),
    safe.writing?.llm ? resolveModelPricing(writingProvider, writingModel) : Promise.resolve(null),
  ]);

  if (safe.llm) safe.llm.model_pricing = llmPricing;
  if (safe.writing?.llm) safe.writing.llm.model_pricing = writingPricing;
  log.debug(`GET /api/config  ${formatMeta({ loggingMode: logging.mode, prompt: logging.prompt?.enabled, llmRaw: logging.llm_raw?.enabled })}`);
  res.json(safe);
});

function collectPatchPaths(value, prefix = '') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }
  const paths = [];
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (child && typeof child === 'object' && !Array.isArray(child)) {
      const nested = collectPatchPaths(child, path);
      paths.push(...(nested.length ? nested : [path]));
    } else {
      paths.push(path);
    }
  }
  return paths;
}

/**
 * 处理 provider 切换时的 provider_models 自动存取：
 * - 保存当前 model 到 provider_models[current_provider]
 * - 恢复 provider_models[new_provider] 作为切换后的 model
 * - 若 model 只是单独更新，同步写入 provider_models[current_provider]
 */
function applyProviderModelLogic(sectionPatch, currentSection) {
  if (!sectionPatch || !currentSection) return;

  const isProviderChange = 'provider' in sectionPatch && sectionPatch.provider !== currentSection.provider;
  const providerModels = { ...(currentSection.provider_models || {}) };

  if (isProviderChange) {
    // 保存当前 model
    if (currentSection.model) {
      providerModels[currentSection.provider] = currentSection.model;
    }
    // 恢复新 provider 上次的 model（覆盖 patch 里可能传来的空字符串）
    sectionPatch.model = providerModels[sectionPatch.provider] || '';
    sectionPatch.provider_models = providerModels;
  } else if ('model' in sectionPatch && sectionPatch.model) {
    // 单独改 model 时，顺手保存
    providerModels[currentSection.provider] = sectionPatch.model;
    sectionPatch.provider_models = providerModels;
  }
}

// PUT /api/config — 部分更新配置（禁止通过此接口更新 api_key / provider_keys）
router.put('/', (req, res) => {
  try {
    const current = getConfig();
    const patch = structuredClone(req.body);
    const patchPaths = collectPatchPaths(patch);
    // 顶层共享 provider_keys 必须通过专用端点写入，不允许从这里修改
    delete patch.provider_keys;
    const modelSections = [
      [patch.llm, current.llm],
      [patch.aux_llm, current.aux_llm],
      [patch.writing?.llm, current.writing?.llm],
      [patch.writing?.aux_llm, current.writing?.aux_llm],
    ];
    for (const [section, currentSection] of modelSections) {
      if (!section) continue;
      delete section.api_key;
      delete section.provider_keys;
      sanitizeBaseUrlPatch(section);
      applyProviderModelLogic(section, currentSection);
    }

    const updated = updateConfig(patch);
    const loggingChanged = patchPaths.some((path) => path === 'logging' || path.startsWith('logging.'));
    log.info(`PUT /api/config  ${formatMeta({
      fields: patchPaths,
      loggingChanged,
      loggingMode: updated.logging?.mode,
      prompt: updated.logging?.prompt?.enabled,
      llmRaw: updated.logging?.llm_raw?.enabled,
    })}`);
    if ('proxy_url' in patch) applyProxy(updated.proxy_url || '');
    res.json(stripApiKeys(updated));
  } catch (err) {
    log.warn(`PUT /api/config FAIL  ${formatMeta({ error: err.message })}`);
    res.status(400).json({ error: err.message });
  }
});

// PUT /api/config/provider-key — 写入指定 provider 的 API Key 到顶层共享池
// 所有对话/写作主副模型共用同一份 provider_keys
router.put('/provider-key', (req, res) => {
  const { provider, api_key } = req.body || {};
  if (typeof provider !== 'string' || !provider) {
    log.warn(`config.bad_request ${formatMeta({ method: req.method, path: req.path, reason: 'provider 必须为非空字符串' })}`);
    return res.status(400).json({ error: 'provider 必须为非空字符串' });
  }
  if (typeof api_key !== 'string') {
    log.warn(`config.bad_request ${formatMeta({ method: req.method, path: req.path, reason: 'api_key 必须为字符串' })}`);
    return res.status(400).json({ error: 'api_key 必须为字符串' });
  }
  try {
    updateProviderKey(provider, api_key);
    log.info(`PUT /api/config/provider-key  ${formatMeta({ provider, hasKey: !!api_key })}`);
    res.json({ success: true });
  } catch (err) {
    log.error(`PUT /api/config/provider-key FAIL  ${formatMeta({ error: err.message })}`);
    res.status(500).json({ error: `保存失败：${err.message}` });
  }
});

// GET /api/config/models — 拉取 LLM 模型列表
router.get('/models', async (_req, res) => {
  const config = getConfig();
  const { provider, base_url } = config.llm;
  const apiKey = getProviderKey(provider);
  try {
    const models = await fetchModels(provider, apiKey, base_url);
    const thinkingOptions = getThinkingOptions(provider);
    log.info(`GET /api/config/models  ${formatMeta({ provider, count: models.length, thinkingOptions: thinkingOptions.length })}`);
    res.json({ models, thinkingOptions });
  } catch (err) {
    log.warn(`GET /api/config/models FAIL  ${formatMeta({ provider, error: err.message })}`);
    res.status(502).json({ error: '无法获取模型列表，请检查 API Key 和网络连接' });
  }
});

// GET /api/config/writing/models — 拉取写作主模型列表
router.get('/writing/models', async (_req, res) => {
  const writingConfig = getWritingLlmConfig();
  const { provider, base_url } = writingConfig;
  const apiKey = writingConfig.api_key;
  try {
    const models = await fetchModels(provider, apiKey, base_url);
    const thinkingOptions = getThinkingOptions(provider);
    log.info(`GET /api/config/writing/models  ${formatMeta({ provider, count: models.length, thinkingOptions: thinkingOptions.length })}`);
    res.json({ models, thinkingOptions });
  } catch (err) {
    log.warn(`GET /api/config/writing/models FAIL  ${formatMeta({ provider, error: err.message })}`);
    res.status(502).json({ error: '无法获取模型列表，请检查 API Key 和网络连接' });
  }
});

// GET /api/config/writing-aux/models — 拉取写作副模型列表
router.get('/writing-aux/models', async (_req, res) => {
  const auxConfig = getWritingAuxLlmConfig();
  const { provider, base_url } = auxConfig;
  const apiKey = auxConfig.api_key;
  try {
    const models = await fetchModels(provider, apiKey, base_url);
    const thinkingOptions = getThinkingOptions(provider);
    log.info(`GET /api/config/writing-aux/models  ${formatMeta({ provider, count: models.length, thinkingOptions: thinkingOptions.length })}`);
    res.json({ models, thinkingOptions });
  } catch (err) {
    log.warn(`GET /api/config/writing-aux/models FAIL  ${formatMeta({ provider, error: err.message })}`);
    res.status(502).json({ error: '无法获取模型列表，请检查 API Key 和网络连接' });
  }
});

// GET /api/config/aux/models — 拉取副模型列表
router.get('/aux/models', async (_req, res) => {
  const auxConfig = getAuxLlmConfig();
  const { provider, base_url } = auxConfig;
  const apiKey = auxConfig.api_key;
  try {
    const models = await fetchModels(provider, apiKey, base_url);
    const thinkingOptions = getThinkingOptions(provider);
    log.info(`GET /api/config/aux/models  ${formatMeta({ provider, count: models.length, thinkingOptions: thinkingOptions.length })}`);
    res.json({ models, thinkingOptions });
  } catch (err) {
    log.warn(`GET /api/config/aux/models FAIL  ${formatMeta({ provider, error: err.message })}`);
    res.status(502).json({ error: '无法获取模型列表，请检查 API Key 和网络连接' });
  }
});

function connectionTestRoute(verify) {
  return async (_req, res) => {
    try {
      await verify();
      res.json({ success: true });
    } catch (err) {
      res.json({ success: false, error: err.message });
    }
  };
}

// GET /api/config/test-connection — 验证 LLM 连通性
router.get('/test-connection', connectionTestRoute(() => {
  const config = getConfig();
  return verifyLlmConnection({ ...config.llm, api_key: resolveApiKey(config.llm, config.provider_keys || {}) });
}));

// GET /api/config/writing/test-connection — 验证写作主模型 LLM 连通性
router.get('/writing/test-connection', connectionTestRoute(() => verifyModelConnection(getWritingLlmConfig())));

// GET /api/config/writing-aux/test-connection — 验证写作副模型 LLM 连通性
router.get('/writing-aux/test-connection', connectionTestRoute(() => verifyModelConnection(getWritingAuxLlmConfig())));

// GET /api/config/aux/test-connection — 验证副模型 LLM 连通性
router.get('/aux/test-connection', connectionTestRoute(() => verifyModelConnection(getAuxLlmConfig())));

export default router;
