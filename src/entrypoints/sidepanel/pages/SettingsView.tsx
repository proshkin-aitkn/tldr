import { useState, useEffect, useCallback, useRef, useMemo } from 'preact/hooks';
import type { Settings, ThemeMode, ProviderConfig } from '@/lib/storage/types';
import type { ModelInfo, VisionSupport } from '@/lib/llm/types';
import { PROVIDER_DEFINITIONS } from '@/lib/llm/registry';
import { Button } from '@/components/Button';

const LANGUAGES = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
];

type OnboardingStep = 'provider' | 'apiKey' | 'model' | 'test' | 'notion' | 'theme' | 'language' | 'detail' | null;

const ONBOARDING_STEPS: Exclude<OnboardingStep, null>[] = ['provider', 'apiKey', 'model', 'test', 'notion', 'theme', 'language', 'detail'];

const STEP_HELPERS: Record<Exclude<OnboardingStep, null>, { title: string; subtitle: string }> = {
  provider: {
    title: 'Step 1: Choose your LLM provider',
    subtitle: 'TL;DR uses an AI model to summarize pages for you. Pick a provider below — they differ in price, speed, and output quality. You can always change this later.',
  },
  apiKey: {
    title: 'Step 2: Connect with your API key',
    subtitle: "Paste your API key below so TL;DR can talk to the provider. Don't have one yet? Click \"Get key\" to create an account and generate a key — it only takes a minute.",
  },
  model: {
    title: 'Step 3: Pick a model',
    subtitle: 'Different models vary in cost and quality. Models near the top of the list are usually newer and perform better for the same price. Some models support vision (image analysis) — look for the vision badge after selecting.',
  },
  test: {
    title: 'Step 4: Image analysis & connection test',
    subtitle: 'Image analysis lets TL;DR read images on the page and include them in summaries. Uncheck it to save tokens. Press "Test Connection" to verify everything works before continuing.',
  },
  notion: {
    title: 'Step 5: Save summaries to Notion (optional)',
    subtitle: "Connect a Notion integration to automatically save every summary as a Notion page. Great for building a personal knowledge base. You can skip this and set it up anytime later.",
  },
  theme: {
    title: 'Step 6: Pick your look',
    subtitle: 'Choose light, dark, or let TL;DR follow your system setting. Click one to continue.',
  },
  language: {
    title: 'Step 7: Translation preferences',
    subtitle: 'Want summaries in a specific language? Pick one below. You can also mark exception languages — pages already in those languages won\'t be translated, keeping the original voice.',
  },
  detail: {
    title: 'Step 8: How detailed should summaries be?',
    subtitle: 'Brief gives you a quick overview in a few sentences. Standard balances detail and length. Detailed captures more nuance. You can tweak this per-summary later too.',
  },
};

interface SettingsViewProps {
  settings: Settings;
  onSave: (settings: Settings) => Promise<void>;
  onTestLLM: () => Promise<{ success: boolean; error?: string; visionSupport?: VisionSupport }>;
  onTestNotion: () => Promise<{ success: boolean; warning?: string; databaseId?: string; databaseName?: string }>;
  onFetchNotionDatabases: () => Promise<Array<{ id: string; title: string }>>;
  onFetchModels: (providerId: string, apiKey: string, endpoint?: string) => Promise<ModelInfo[]>;
  onProbeVision: (providerId?: string, apiKey?: string, model?: string, endpoint?: string) => Promise<VisionSupport | undefined>;
  onThemeChange: (mode: ThemeMode) => void;
  currentTheme: ThemeMode;
}

export function SettingsView({ settings, onSave, onTestLLM, onTestNotion, onFetchNotionDatabases, onFetchModels, onProbeVision, onThemeChange, currentTheme }: SettingsViewProps) {
  const [local, setLocal] = useState<Settings>(settings);
  const [testingLLM, setTestingLLM] = useState(false);
  const [testingNotion, setTestingNotion] = useState(false);
  const [llmStatus, setLlmStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [llmError, setLlmError] = useState<string | null>(null);
  const [notionStatus, setNotionStatus] = useState<'idle' | 'success' | 'warning' | 'error'>('idle');
  const [notionWarning, setNotionWarning] = useState<string | null>(null);
  const [notionDatabases, setNotionDatabases] = useState<Array<{ id: string; title: string }>>([]);
  const [loadingDbs, setLoadingDbs] = useState(false);

  // Dynamic model state
  const [fetchedModels, setFetchedModels] = useState<Record<string, ModelInfo[]>>({});
  const [loadingModels, setLoadingModels] = useState(false);
  const [modelsError, setModelsError] = useState<string | null>(null);
  const [probingVision, setProbingVision] = useState(false);

  // Onboarding state
  const [onboardingStep, setOnboardingStep] = useState<OnboardingStep>(() => {
    if (settings.onboardingCompleted) return null;
    // Existing user: has an API key → skip onboarding
    const activeConfig = settings.providerConfigs[settings.activeProviderId];
    if (activeConfig?.apiKey) return null;
    return 'provider';
  });
  const [providerPicked, setProviderPicked] = useState(false);

  const lastSavedJson = useRef(JSON.stringify(settings));
  const saveTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const initialSyncDone = useRef(false);

  useEffect(() => {
    setLocal(settings);
    if (settings.cachedModels) {
      setFetchedModels(settings.cachedModels);
    }
    lastSavedJson.current = JSON.stringify(settings);

    // Always respect persisted onboardingCompleted flag
    if (settings.onboardingCompleted) {
      setOnboardingStep(null);
    } else if (!initialSyncDone.current) {
      initialSyncDone.current = true;
      // Existing user: has an API key → skip onboarding
      if (settings.providerConfigs[settings.activeProviderId]?.apiKey) {
        setOnboardingStep(null);
      }
    }
  }, [settings]);

  // Auto-save on changes (debounced)
  useEffect(() => {
    const finalSettings = {
      ...local,
      cachedModels: { ...local.cachedModels, ...fetchedModels },
    };
    const json = JSON.stringify(finalSettings);
    if (json === lastSavedJson.current) return;

    clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      lastSavedJson.current = json;
      onSave(finalSettings);
    }, 500);
    return () => clearTimeout(saveTimerRef.current);
  }, [local, fetchedModels, onSave]);

  const currentProviderId = local.activeProviderId;
  const currentConfig = local.providerConfigs[currentProviderId] || {
    providerId: currentProviderId,
    apiKey: '',
    model: '',
    contextWindow: 100000,
  };
  const currentProviderDef = PROVIDER_DEFINITIONS.find((p) => p.id === currentProviderId);
  const currentModels = fetchedModels[currentProviderId] || [];
  const visionKey = `${currentProviderId}:${currentConfig.model}`;
  const visionCapability: VisionSupport = local.modelCapabilities?.[visionKey]?.vision || 'unknown';

  const isOnboarding = onboardingStep !== null;
  const currentStepIndex = isOnboarding ? ONBOARDING_STEPS.indexOf(onboardingStep) : -1;

  // Determine which sections are visible during onboarding
  const sectionVisible = useMemo(() => {
    if (!isOnboarding) return { provider: true, apiKey: true, model: true, test: true, notion: true, theme: true, language: true, detail: true };
    const idx = currentStepIndex;
    return {
      provider: idx >= 0,
      apiKey: idx >= 1,
      model: idx >= 2,
      test: idx >= 3,
      notion: idx >= 4,
      theme: idx >= 5,
      language: idx >= 6,
      detail: idx >= 7,
    };
  }, [isOnboarding, currentStepIndex]);

  const completeOnboarding = useCallback(() => {
    setOnboardingStep(null);
    setLocal((prev) => {
      const updated = { ...prev, onboardingCompleted: true };
      // Flush save immediately — don't rely on the debounce
      clearTimeout(saveTimerRef.current);
      const finalSettings = { ...updated, cachedModels: { ...updated.cachedModels, ...fetchedModels } };
      lastSavedJson.current = JSON.stringify(finalSettings);
      onSave(finalSettings);
      return updated;
    });
  }, [fetchedModels, onSave]);

  const advanceStep = useCallback((from: Exclude<OnboardingStep, null>) => {
    const idx = ONBOARDING_STEPS.indexOf(from);
    if (idx < 0) return;
    const next = idx + 1 < ONBOARDING_STEPS.length ? ONBOARDING_STEPS[idx + 1] : null;
    if (next === null) {
      completeOnboarding();
    } else {
      setOnboardingStep(next);
    }
  }, [completeOnboarding]);

  // Auto-probe vision when model changes and capability is unknown
  useEffect(() => {
    if (!currentConfig.model || !currentConfig.apiKey && currentProviderId !== 'self-hosted') return;
    if (visionCapability !== 'unknown') return;
    let cancelled = false;
    setProbingVision(true);
    onProbeVision(currentProviderId, currentConfig.apiKey, currentConfig.model, currentConfig.endpoint).then((vision) => {
      if (cancelled || !vision) return;
      setLocal((prev) => ({
        ...prev,
        modelCapabilities: {
          ...prev.modelCapabilities,
          [visionKey]: { vision, probedAt: Date.now() },
        },
      }));
    }).finally(() => {
      if (!cancelled) setProbingVision(false);
    });
    return () => { cancelled = true; };
  }, [visionKey]);

  const updateProviderConfig = (patch: Partial<ProviderConfig>) => {
    setLocal({
      ...local,
      providerConfigs: {
        ...local.providerConfigs,
        [currentProviderId]: { ...currentConfig, ...patch },
      },
    });
  };

  const doFetchModels = useCallback(async (providerId?: string) => {
    const pid = providerId || currentProviderId;
    const config = local.providerConfigs[pid] || currentConfig;
    if (!config.apiKey && pid !== 'self-hosted') return;

    setLoadingModels(true);
    setModelsError(null);
    try {
      const models = await onFetchModels(pid, config.apiKey, config.endpoint);
      setFetchedModels((prev) => ({ ...prev, [pid]: models }));
    } catch (err) {
      setModelsError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoadingModels(false);
    }
  }, [currentProviderId, local.providerConfigs, currentConfig, onFetchModels]);

  const handleProviderChange = (newProviderId: string) => {
    // Save current config before switching
    const updatedConfigs = {
      ...local.providerConfigs,
      [currentProviderId]: currentConfig,
    };

    // Load or create config for new provider
    if (!updatedConfigs[newProviderId]) {
      const def = PROVIDER_DEFINITIONS.find((p) => p.id === newProviderId);
      updatedConfigs[newProviderId] = {
        providerId: newProviderId,
        apiKey: '',
        model: '',
        endpoint: def?.defaultEndpoint || '',
        contextWindow: def?.defaultContextWindow || 100000,
      };
    }

    setLocal({
      ...local,
      providerConfigs: updatedConfigs,
      activeProviderId: newProviderId,
    });

    // Advance onboarding
    setProviderPicked(true);
    if (onboardingStep === 'provider') {
      if (newProviderId === 'self-hosted') {
        // Skip apiKey for self-hosted
        setOnboardingStep('model');
      } else {
        advanceStep('provider');
      }
    }
  };

  const handleSave = async () => {
    clearTimeout(saveTimerRef.current);
    const finalSettings = {
      ...local,
      cachedModels: { ...local.cachedModels, ...fetchedModels },
    };
    lastSavedJson.current = JSON.stringify(finalSettings);
    await onSave(finalSettings);
  };

  const handleTestLLM = async () => {
    setTestingLLM(true);
    setLlmStatus('idle');
    setLlmError(null);
    try {
      await handleSave();
      const result = await onTestLLM();
      setLlmStatus(result.success ? 'success' : 'error');
      if (!result.success && result.error) setLlmError(result.error);
      // Update vision badge immediately from test result
      if (result.visionSupport) {
        setLocal((prev) => ({
          ...prev,
          modelCapabilities: {
            ...prev.modelCapabilities,
            [visionKey]: { vision: result.visionSupport!, probedAt: Date.now() },
          },
        }));
      }
      // Advance onboarding only on successful test
      if (onboardingStep === 'test' && result.success) {
        advanceStep('test');
      }
    } catch (err) {
      setLlmStatus('error');
      setLlmError(err instanceof Error ? err.message : String(err));
    } finally {
      setTestingLLM(false);
    }
  };

  const handleTestNotion = async () => {
    setTestingNotion(true);
    setNotionStatus('idle');
    setNotionWarning(null);
    try {
      await handleSave();
      const result = await onTestNotion();
      if (result.databaseId) {
        setLocal((prev) => ({
          ...prev,
          notion: { ...prev.notion, databaseId: result.databaseId!, databaseName: result.databaseName },
        }));
      }
      if (result.warning) {
        setNotionStatus('warning');
        setNotionWarning(result.warning);
      } else {
        setNotionStatus(result.success ? 'success' : 'error');
      }
      // Advance onboarding on Notion test
      if (onboardingStep === 'notion') {
        advanceStep('notion');
      }
    } catch {
      setNotionStatus('error');
    } finally {
      setTestingNotion(false);
    }
  };

  const handleFetchDatabases = async () => {
    setLoadingDbs(true);
    try {
      await handleSave();
      const dbs = await onFetchNotionDatabases();
      setNotionDatabases(dbs);
    } catch {
      // ignore
    } finally {
      setLoadingDbs(false);
    }
  };

  // Card-level visibility: show when any step inside it has been reached
  const getCardStyle = (firstStep: Exclude<OnboardingStep, null>): Record<string, string | number> => {
    if (!isOnboarding) return {};
    const firstIdx = ONBOARDING_STEPS.indexOf(firstStep);
    if (currentStepIndex >= firstIdx) return { transition: 'opacity 0.4s ease, max-height 0.5s ease' };
    // Next card gets a peek
    const prevStep = firstIdx > 0 ? ONBOARDING_STEPS[firstIdx - 1] : null;
    if (prevStep && currentStepIndex === ONBOARDING_STEPS.indexOf(prevStep)) {
      return {
        maxHeight: '60px',
        opacity: '0.3',
        overflow: 'hidden',
        filter: 'blur(2px)',
        pointerEvents: 'none',
        transition: 'max-height 0.5s ease, opacity 0.4s ease, filter 0.4s ease',
      };
    }
    return {
      maxHeight: '0',
      opacity: '0',
      overflow: 'hidden',
      margin: '0',
      padding: '0',
      border: 'none',
      pointerEvents: 'none',
      transition: 'max-height 0.5s ease, opacity 0.4s ease',
    };
  };

  // Section reveal wrapper style
  const getSectionStyle = (step: Exclude<OnboardingStep, null>): Record<string, string | number> => {
    const visible = sectionVisible[step];
    const isNext = isOnboarding && !visible && ONBOARDING_STEPS.indexOf(step) === currentStepIndex + 1;

    if (!isOnboarding || visible) {
      return {
        maxHeight: '2000px',
        opacity: '1',
        overflow: 'visible',
        transition: 'max-height 0.5s ease, opacity 0.4s ease',
      };
    }

    if (isNext) {
      // Dimmed peek of next section
      return {
        maxHeight: '80px',
        opacity: '0.3',
        overflow: 'hidden',
        filter: 'blur(2px)',
        pointerEvents: 'none',
        transition: 'max-height 0.5s ease, opacity 0.4s ease, filter 0.4s ease',
      };
    }

    return {
      maxHeight: '0',
      opacity: '0',
      overflow: 'hidden',
      pointerEvents: 'none',
      transition: 'max-height 0.5s ease, opacity 0.4s ease',
    };
  };

  return (
    <div style={{ padding: '16px', font: 'var(--md-sys-typescale-body-medium)' }}>
      {/* Onboarding header — dots + skip only, no helper here */}
      {isOnboarding && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <StepDots current={currentStepIndex} total={ONBOARDING_STEPS.length} />
          <button
            onClick={completeOnboarding}
            style={{
              background: 'none',
              border: 'none',
              font: 'var(--md-sys-typescale-label-small)',
              color: 'var(--md-sys-color-on-surface-variant)',
              textDecoration: 'underline',
              cursor: 'pointer',
              padding: '4px',
            }}
          >
            Skip setup
          </button>
        </div>
      )}

      {/* === LLM Provider Card === */}
      <SectionCard title="LLM Provider" style={getCardStyle('provider')}>

      {/* === Provider Section === */}
      <div style={getSectionStyle('provider')}>
        {/* Provider cards (onboarding) or dropdown (normal) */}
        {isOnboarding && onboardingStep === 'provider' ? (
          <>
            <Label>Provider</Label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginTop: '4px' }}>
              {PROVIDER_DEFINITIONS.map((p) => {
                const selected = providerPicked && currentProviderId === p.id;
                return (
                <button
                  key={p.id}
                  onClick={() => handleProviderChange(p.id)}
                  style={{
                    padding: '12px',
                    borderRadius: 'var(--md-sys-shape-corner-medium)',
                    border: '2px solid',
                    borderColor: selected ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline-variant)',
                    backgroundColor: selected ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-surface-container)',
                    cursor: 'pointer',
                    textAlign: 'left',
                    transition: 'border-color 0.2s, background-color 0.2s',
                  }}
                >
                  <div style={{
                    font: 'var(--md-sys-typescale-label-large)',
                    color: selected ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-on-surface)',
                  }}>
                    {p.name}
                  </div>
                  {p.description && (
                    <div style={{
                      font: 'var(--md-sys-typescale-body-small)',
                      color: selected ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-on-surface-variant)',
                      marginTop: '2px',
                    }}>
                      {p.description}
                    </div>
                  )}
                </button>
                );
              })}
            </div>
            <StepHint step="provider" currentStep={onboardingStep} />
          </>
        ) : (
          <>
            <Label>Provider</Label>
            <select
              value={currentProviderId}
              onChange={(e) => handleProviderChange((e.target as HTMLSelectElement).value)}
              style={selectStyle}
            >
              {PROVIDER_DEFINITIONS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </>
        )}
      </div>

      {/* === API Key Section === */}
      <div style={getSectionStyle('apiKey')}>
        <Label>
          API Key
          {currentProviderDef?.apiKeyUrl && (
            <a
              href={currentProviderDef.apiKeyUrl}
              target="_blank"
              rel="noopener noreferrer"
              style={{
                marginLeft: '6px',
                font: 'var(--md-sys-typescale-label-small)',
                color: 'var(--md-sys-color-primary)',
                textDecoration: 'none',
                ...(isOnboarding && onboardingStep === 'apiKey' ? { animation: 'bounceRight 1.5s ease-in-out infinite' as string, display: 'inline-block' } : {}),
              }}
              title={`Get ${currentProviderDef.name} API key`}
            >
              Get key &rarr;
            </a>
          )}
        </Label>
        <input
          type="password"
          value={currentConfig.apiKey}
          onInput={(e) => updateProviderConfig({ apiKey: (e.target as HTMLInputElement).value })}
          onBlur={() => {
            doFetchModels();
            // Advance onboarding when user enters a key
            if (onboardingStep === 'apiKey' && currentConfig.apiKey) {
              advanceStep('apiKey');
            }
          }}
          placeholder="Enter API key..."
          style={inputStyle}
        />
        <StepHint step="apiKey" currentStep={onboardingStep} />

        {/* Continue button during onboarding */}
        {isOnboarding && onboardingStep === 'apiKey' && currentConfig.apiKey && (
          <Button
            onClick={() => { doFetchModels(); advanceStep('apiKey'); }}
            size="sm"
            variant="secondary"
            style={{ marginTop: '8px' }}
          >
            Continue
          </Button>
        )}
      </div>

      {/* === Model Section === */}
      <div style={getSectionStyle('model')}>
        <Label>Model</Label>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <select
            value={currentModels.some((m) => m.id === currentConfig.model) ? currentConfig.model : '__custom__'}
            onChange={(e) => {
              const val = (e.target as HTMLSelectElement).value;
              if (val !== '__custom__') {
                const model = currentModels.find((m) => m.id === val);
                updateProviderConfig({
                  model: val,
                  contextWindow: model?.contextWindow || currentConfig.contextWindow,
                });
                // Advance onboarding on model select
                if (onboardingStep === 'model') {
                  advanceStep('model');
                }
              }
            }}
            style={{ ...selectStyle, flex: 1 }}
          >
            {currentModels.length === 0 && !currentConfig.model && (
              <option value="__custom__">Enter API key to load models...</option>
            )}
            {currentModels.map((m) => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
            <option value="__custom__">Custom...</option>
          </select>
          <Button onClick={() => doFetchModels()} loading={loadingModels} size="sm" variant="ghost" title="Refresh model list">
            Refresh
          </Button>
        </div>
        {modelsError && (
          <div style={{ font: 'var(--md-sys-typescale-body-small)', color: 'var(--md-sys-color-error)', marginTop: '4px' }}>
            {modelsError}
          </div>
        )}

        {/* Vision capability badge */}
        {currentConfig.model && (
          <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <VisionBadge vision={visionCapability} probing={probingVision} />
          </div>
        )}

        {(!currentModels.some((m) => m.id === currentConfig.model) && currentConfig.model) && (
          <>
            <Label>Custom Model ID</Label>
            <input
              type="text"
              value={currentConfig.model}
              onInput={(e) => updateProviderConfig({ model: (e.target as HTMLInputElement).value })}
              placeholder="e.g. my-model-name"
              style={inputStyle}
            />
          </>
        )}

        <Label>Endpoint URL</Label>
        <input
          type="text"
          value={currentConfig.endpoint || ''}
          onInput={(e) => updateProviderConfig({ endpoint: (e.target as HTMLInputElement).value })}
          placeholder={currentProviderDef?.defaultEndpoint || 'http://localhost:11434'}
          style={inputStyle}
        />

        <Label>Context Window (tokens)</Label>
        <input
          type="number"
          value={currentConfig.contextWindow}
          onInput={(e) => updateProviderConfig({ contextWindow: parseInt((e.target as HTMLInputElement).value) || 100000 })}
          style={inputStyle}
        />
        <StepHint step="model" currentStep={onboardingStep} />

        {/* Continue button during onboarding */}
        {isOnboarding && onboardingStep === 'model' && currentConfig.model && (
          <Button
            onClick={() => advanceStep('model')}
            size="sm"
            variant="secondary"
            style={{ marginTop: '8px' }}
          >
            Continue
          </Button>
        )}
      </div>

      {/* === Image Analysis + Test Connection Section === */}
      <div style={getSectionStyle('test')}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '12px' }}>
          <input
            type="checkbox"
            id="enableImageAnalysis"
            checked={local.enableImageAnalysis ?? true}
            onChange={(e) => setLocal({ ...local, enableImageAnalysis: (e.target as HTMLInputElement).checked })}
            style={{ margin: 0 }}
          />
          <label
            htmlFor="enableImageAnalysis"
            style={{ font: 'var(--md-sys-typescale-label-medium)', color: 'var(--md-sys-color-on-surface)', cursor: 'pointer' }}
          >
            Analyze page images
          </label>
        </div>
        <div style={{ font: 'var(--md-sys-typescale-body-small)', color: 'var(--md-sys-color-on-surface-variant)', marginTop: '2px', marginLeft: '26px' }}>
          {visionCapability === 'none'
            ? 'This model does not support image analysis'
            : (visionCapability === 'base64' || visionCapability === 'url')
            ? 'Sends images to the LLM for analysis (increases token usage)'
            : 'Run Test Connection to check if this model supports images'}
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center' }}>
          <Button onClick={handleTestLLM} loading={testingLLM} size="sm" variant="secondary" title="Test LLM connection">
            Test Connection
          </Button>
          {llmStatus === 'success' && <StatusBadge type="success">Connected!</StatusBadge>}
          {llmStatus === 'error' && <StatusBadge type="error">Failed</StatusBadge>}
        </div>
        {llmError && (
          <div style={{ font: 'var(--md-sys-typescale-body-small)', color: 'var(--md-sys-color-error)', marginTop: '4px' }}>
            {llmError}
          </div>
        )}
        <StepHint step="test" currentStep={onboardingStep} />
      </div>

      </SectionCard>

      {/* === Notion Card === */}
      <SectionCard title="Notion Integration" style={getCardStyle('notion')}>

      {/* === Notion Section === */}
      <div style={getSectionStyle('notion')}>

        <Label>
          Notion API Key
          <a
            href="https://www.notion.so/my-integrations"
            target="_blank"
            rel="noopener noreferrer"
            style={{
              marginLeft: '6px',
              font: 'var(--md-sys-typescale-label-small)',
              color: 'var(--md-sys-color-primary)',
              textDecoration: 'none',
            }}
            title="Create a Notion integration and copy the Internal Integration Secret"
          >
            Create integration &rarr;
          </a>
        </Label>
        <input
          type="password"
          value={local.notion.apiKey}
          onInput={(e) => setLocal({ ...local, notion: { ...local.notion, apiKey: (e.target as HTMLInputElement).value } })}
          placeholder="ntn_..."
          style={inputStyle}
        />

        <Label>Database</Label>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          <select
            value={local.notion.databaseId || ''}
            onChange={(e) => {
              const val = (e.target as HTMLSelectElement).value;
              const db = notionDatabases.find((d) => d.id === val);
              setLocal({ ...local, notion: { ...local.notion, databaseId: val, databaseName: db?.title } });
            }}
            style={{ ...selectStyle, flex: 1 }}
          >
            <option value="">Auto-create new database</option>
            {local.notion.databaseId && !notionDatabases.some((d) => d.id === local.notion.databaseId) && (
              <option value={local.notion.databaseId}>{local.notion.databaseName || local.notion.databaseId}</option>
            )}
            {notionDatabases.map((db) => (
              <option key={db.id} value={db.id}>{db.title}</option>
            ))}
          </select>
          <Button onClick={handleFetchDatabases} loading={loadingDbs} size="sm" variant="ghost" title="Fetch Notion databases">
            Fetch
          </Button>
        </div>

        <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center' }}>
          <Button onClick={handleTestNotion} loading={testingNotion} size="sm" variant="secondary" title="Test Notion connection">
            Test Connection
          </Button>
          {notionStatus === 'success' && <StatusBadge type="success">Connected!</StatusBadge>}
          {notionStatus === 'warning' && <StatusBadge type="warning">Connected</StatusBadge>}
          {notionStatus === 'error' && <StatusBadge type="error">Failed</StatusBadge>}
        </div>
        {notionWarning && (
          <div style={{ font: 'var(--md-sys-typescale-body-small)', color: 'var(--md-sys-color-warning)', marginTop: '4px' }}>
            {notionWarning}
          </div>
        )}

        <StepHint step="notion" currentStep={onboardingStep} />

        {/* Continue button during onboarding */}
        {isOnboarding && onboardingStep === 'notion' && (
          <Button
            onClick={() => advanceStep('notion')}
            size="sm"
            variant="secondary"
            style={{ marginTop: '8px' }}
          >
            Continue
          </Button>
        )}
      </div>

      </SectionCard>

      {/* === General Card === */}
      <SectionCard title="General" style={getCardStyle('theme')}>

      {/* === Theme Section === */}
      <div style={getSectionStyle('theme')}>
        <Label>Theme</Label>
        <div style={{ display: 'flex', gap: '4px' }}>
          {(['light', 'dark', 'system'] as ThemeMode[]).map((m) => (
            <button
              key={m}
              onClick={() => {
                onThemeChange(m);
                setLocal({ ...local, theme: m });
                // Advance onboarding on theme click
                if (onboardingStep === 'theme') {
                  advanceStep('theme');
                }
              }}
              title={`Switch to ${m} theme`}
              style={{
                flex: 1,
                padding: '8px 12px',
                borderRadius: 'var(--md-sys-shape-corner-small)',
                border: '1px solid',
                borderColor: currentTheme === m ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline-variant)',
                backgroundColor: currentTheme === m ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-surface-container)',
                color: currentTheme === m ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-on-surface-variant)',
                font: 'var(--md-sys-typescale-label-medium)',
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {m}
            </button>
          ))}
        </div>
        <StepHint step="theme" currentStep={onboardingStep} />
      </div>

      {/* === Language Section === */}
      <div style={getSectionStyle('language')}>
        <Label>Translate into</Label>
        <select
          value={local.summaryLanguage}
          onChange={(e) => setLocal({ ...local, summaryLanguage: (e.target as HTMLSelectElement).value })}
          style={selectStyle}
        >
          <option value="auto">Don't translate</option>
          {LANGUAGES.map((l) => (
            <option key={l.code} value={l.code}>{l.name}</option>
          ))}
        </select>

        {local.summaryLanguage !== 'auto' && <>
        <Label>Except</Label>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
          {LANGUAGES.map((l) => {
            const active = (local.summaryLanguageExcept || []).includes(l.code);
            return (
              <button
                key={l.code}
                onClick={() => {
                  const current = local.summaryLanguageExcept || [];
                  const next = active
                    ? current.filter((c) => c !== l.code)
                    : [...current, l.code];
                  setLocal({ ...local, summaryLanguageExcept: next });
                }}
                title={active ? `Remove ${l.name} from exceptions` : `Don't translate ${l.name} content`}
                style={{
                  padding: '4px 10px',
                  borderRadius: '16px',
                  border: '1px solid',
                  borderColor: active ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline-variant)',
                  backgroundColor: active ? 'var(--md-sys-color-primary-container)' : 'var(--md-sys-color-surface-container)',
                  color: active ? 'var(--md-sys-color-on-primary-container)' : 'var(--md-sys-color-on-surface-variant)',
                  font: 'var(--md-sys-typescale-label-small)',
                  cursor: 'pointer',
                }}
              >
                {l.name}
              </button>
            );
          })}
        </div>
        <div style={{ font: 'var(--md-sys-typescale-body-small)', color: 'var(--md-sys-color-on-surface-variant)', marginTop: '4px' }}>
          Content in these languages won't be translated
        </div>
        </>}

        <StepHint step="language" currentStep={onboardingStep} />

        {/* Continue button during onboarding */}
        {isOnboarding && onboardingStep === 'language' && (
          <Button
            onClick={() => advanceStep('language')}
            size="sm"
            variant="secondary"
            style={{ marginTop: '8px' }}
          >
            Continue
          </Button>
        )}
      </div>

      {/* === Detail Level Section === */}
      <div style={getSectionStyle('detail')}>
        <Label>Summary Detail Level</Label>
        <select
          value={local.summaryDetailLevel}
          onChange={(e) => {
            setLocal({ ...local, summaryDetailLevel: (e.target as HTMLSelectElement).value as Settings['summaryDetailLevel'] });
            // Advance onboarding on detail level change
            if (onboardingStep === 'detail') {
              advanceStep('detail');
            }
          }}
          style={selectStyle}
        >
          <option value="brief">Brief</option>
          <option value="standard">Standard</option>
          <option value="detailed">Detailed</option>
        </select>

        <StepHint step="detail" currentStep={onboardingStep} />

        {/* Finish setup button during onboarding */}
        {isOnboarding && onboardingStep === 'detail' && (
          <Button
            onClick={() => advanceStep('detail')}
            size="sm"
            variant="primary"
            style={{ marginTop: '8px' }}
          >
            Finish setup
          </Button>
        )}

      </div>

      </SectionCard>

      {/* Footer — always visible */}
      <div style={{
        marginTop: '24px',
        paddingTop: '16px',
        borderTop: '1px solid var(--md-sys-color-outline-variant)',
        font: 'var(--md-sys-typescale-body-small)',
        color: 'var(--md-sys-color-on-surface-variant)',
        textAlign: 'center',
        lineHeight: 1.6,
      }}>
        <div>TL;DR v1.0.0</div>
        <div>&copy; 2026 AI Tech Knowledge LLC</div>
        {!isOnboarding && (
          <button
            onClick={() => {
              setOnboardingStep('provider');
              setProviderPicked(false);
              setLocal((prev) => ({ ...prev, onboardingCompleted: false }));
            }}
            style={{
              marginTop: '8px',
              background: 'none',
              border: 'none',
              font: 'var(--md-sys-typescale-label-small)',
              color: 'var(--md-sys-color-on-surface-variant)',
              textDecoration: 'underline',
              cursor: 'pointer',
              padding: '4px',
              opacity: 0.7,
            }}
          >
            Restart setup wizard
          </button>
        )}
      </div>
    </div>
  );
}

function StepDots({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
      {Array.from({ length: total }, (_, i) => (
        <div
          key={i}
          style={{
            width: i === current ? '20px' : '6px',
            height: '6px',
            borderRadius: '3px',
            backgroundColor: i <= current ? 'var(--md-sys-color-primary)' : 'var(--md-sys-color-outline-variant)',
            transition: 'width 0.3s ease, background-color 0.3s ease',
          }}
        />
      ))}
    </div>
  );
}

function StepHint({ step, currentStep }: { step: Exclude<OnboardingStep, null>; currentStep: OnboardingStep }) {
  if (currentStep !== step) return null;
  const helper = STEP_HELPERS[step];
  return (
    <div style={{
      animation: 'fadeIn 0.4s ease',
      marginTop: '10px',
      padding: '10px 12px',
      borderRadius: 'var(--md-sys-shape-corner-medium)',
      backgroundColor: 'var(--md-sys-color-primary-container)',
      borderLeft: '3px solid var(--md-sys-color-primary)',
    }}>
      <div style={{
        font: 'var(--md-sys-typescale-label-medium)',
        color: 'var(--md-sys-color-on-primary-container)',
        marginBottom: '3px',
      }}>
        {helper.title}
      </div>
      <div style={{
        font: 'var(--md-sys-typescale-body-small)',
        color: 'var(--md-sys-color-on-primary-container)',
        lineHeight: '1.5',
        opacity: 0.85,
      }}>
        {helper.subtitle}
      </div>
    </div>
  );
}

function SectionCard({ title, style, children }: { title: string; style?: Record<string, string | number>; children: preact.ComponentChildren }) {
  return (
    <div style={{
      marginTop: '16px',
      padding: '16px',
      borderRadius: 'var(--md-sys-shape-corner-medium)',
      border: '1px solid var(--md-sys-color-outline-variant)',
      backgroundColor: 'var(--md-sys-color-surface-container-low)',
      ...style,
    }}>
      <div style={{
        font: 'var(--md-sys-typescale-title-small)',
        color: 'var(--md-sys-color-primary)',
        marginBottom: '4px',
      }}>
        {title}
      </div>
      {children}
    </div>
  );
}

function Label({ children }: { children: preact.ComponentChildren }) {
  return (
    <label style={{
      display: 'block',
      font: 'var(--md-sys-typescale-label-medium)',
      color: 'var(--md-sys-color-on-surface-variant)',
      marginTop: '12px',
      marginBottom: '4px',
    }}>
      {children}
    </label>
  );
}

function StatusBadge({ type, children }: { type: 'success' | 'warning' | 'error'; children: preact.ComponentChildren }) {
  const color = type === 'success'
    ? 'var(--md-sys-color-success)'
    : type === 'warning'
      ? 'var(--md-sys-color-warning)'
      : 'var(--md-sys-color-error)';
  return (
    <span style={{
      font: 'var(--md-sys-typescale-label-small)',
      color,
    }}>
      {children}
    </span>
  );
}

const inputStyle: Record<string, string> = {
  width: '100%',
  padding: '8px 12px',
  border: '1px solid var(--md-sys-color-outline)',
  borderRadius: 'var(--md-sys-shape-corner-small)',
  fontSize: '13px',
  fontFamily: 'Inter, sans-serif',
  outline: 'none',
  boxSizing: 'border-box',
  backgroundColor: 'var(--md-sys-color-surface-container-highest)',
  color: 'var(--md-sys-color-on-surface)',
};

function VisionBadge({ vision, probing }: { vision: VisionSupport; probing: boolean }) {
  if (probing) {
    return (
      <span style={{
        font: 'var(--md-sys-typescale-label-small)',
        color: 'var(--md-sys-color-on-surface-variant)',
        padding: '2px 8px',
        borderRadius: '10px',
        backgroundColor: 'var(--md-sys-color-surface-container-high)',
      }}>
        Checking vision...
      </span>
    );
  }

  const config: Record<VisionSupport, { label: string; color: string; bg: string }> = {
    unknown: { label: '? vision', color: 'var(--md-sys-color-on-surface-variant)', bg: 'var(--md-sys-color-surface-container-high)' },
    none: { label: '\u2717 no vision', color: 'var(--md-sys-color-on-warning-container)', bg: 'var(--md-sys-color-warning-container)' },
    base64: { label: '\u2713 vision', color: 'var(--md-sys-color-on-success-container)', bg: 'var(--md-sys-color-success-container)' },
    url: { label: '\u2713 vision', color: 'var(--md-sys-color-on-success-container)', bg: 'var(--md-sys-color-success-container)' },
  };

  const c = config[vision];
  return (
    <span style={{
      font: 'var(--md-sys-typescale-label-small)',
      color: c.color,
      padding: '2px 8px',
      borderRadius: '10px',
      backgroundColor: c.bg,
    }}>
      {c.label}
    </span>
  );
}

const selectStyle: Record<string, string> = {
  ...inputStyle,
};
