import { useState, useEffect } from 'preact/hooks';
import type { Settings, ThemeMode, ProviderConfig } from '@/lib/storage/types';
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

interface SettingsViewProps {
  settings: Settings;
  onSave: (settings: Settings) => Promise<void>;
  onTestLLM: () => Promise<boolean>;
  onTestNotion: () => Promise<boolean>;
  onFetchNotionDatabases: () => Promise<Array<{ id: string; title: string }>>;
  onThemeChange: (mode: ThemeMode) => void;
  currentTheme: ThemeMode;
}

export function SettingsView({ settings, onSave, onTestLLM, onTestNotion, onFetchNotionDatabases, onThemeChange, currentTheme }: SettingsViewProps) {
  const [local, setLocal] = useState<Settings>(settings);
  const [testingLLM, setTestingLLM] = useState(false);
  const [testingNotion, setTestingNotion] = useState(false);
  const [llmStatus, setLlmStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [notionStatus, setNotionStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [notionDatabases, setNotionDatabases] = useState<Array<{ id: string; title: string }>>([]);
  const [loadingDbs, setLoadingDbs] = useState(false);

  useEffect(() => {
    setLocal(settings);
  }, [settings]);

  const currentProviderId = local.activeProviderId;
  const currentConfig = local.providerConfigs[currentProviderId] || {
    providerId: currentProviderId,
    apiKey: '',
    model: '',
    contextWindow: 100000,
  };
  const currentProviderDef = PROVIDER_DEFINITIONS.find((p) => p.id === currentProviderId);

  const updateProviderConfig = (patch: Partial<ProviderConfig>) => {
    setLocal({
      ...local,
      providerConfigs: {
        ...local.providerConfigs,
        [currentProviderId]: { ...currentConfig, ...patch },
      },
    });
  };

  const handleProviderChange = (newProviderId: string) => {
    // Save current config before switching
    const updatedConfigs = {
      ...local.providerConfigs,
      [currentProviderId]: currentConfig,
    };

    // Load or create config for new provider
    if (!updatedConfigs[newProviderId]) {
      const def = PROVIDER_DEFINITIONS.find((p) => p.id === newProviderId);
      const model = def?.defaultModels[0];
      updatedConfigs[newProviderId] = {
        providerId: newProviderId,
        apiKey: '',
        model: model?.id || '',
        endpoint: def?.defaultEndpoint || '',
        contextWindow: model?.contextWindow || 100000,
      };
    }

    setLocal({
      ...local,
      providerConfigs: updatedConfigs,
      activeProviderId: newProviderId,
    });
  };

  const handleSave = async () => {
    // Ensure current config is saved before persisting
    const finalSettings = {
      ...local,
      providerConfigs: {
        ...local.providerConfigs,
        [currentProviderId]: currentConfig,
      },
    };
    await onSave(finalSettings);
  };

  const handleTestLLM = async () => {
    setTestingLLM(true);
    setLlmStatus('idle');
    try {
      await handleSave();
      const success = await onTestLLM();
      setLlmStatus(success ? 'success' : 'error');
    } catch {
      setLlmStatus('error');
    } finally {
      setTestingLLM(false);
    }
  };

  const handleTestNotion = async () => {
    setTestingNotion(true);
    setNotionStatus('idle');
    try {
      await handleSave();
      const success = await onTestNotion();
      setNotionStatus(success ? 'success' : 'error');
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

  return (
    <div style={{ padding: '16px', font: 'var(--md-sys-typescale-body-medium)' }}>
      {/* LLM Configuration */}
      <SectionHeader>LLM Provider</SectionHeader>

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

      <Label>API Key</Label>
      <input
        type="password"
        value={currentConfig.apiKey}
        onInput={(e) => updateProviderConfig({ apiKey: (e.target as HTMLInputElement).value })}
        placeholder="Enter API key..."
        style={inputStyle}
      />

      <Label>Model</Label>
      <div style={{ display: 'flex', gap: '4px' }}>
        <select
          value={currentProviderDef?.defaultModels.some((m) => m.id === currentConfig.model) ? currentConfig.model : '__custom__'}
          onChange={(e) => {
            const val = (e.target as HTMLSelectElement).value;
            if (val !== '__custom__') {
              const model = currentProviderDef?.defaultModels.find((m) => m.id === val);
              updateProviderConfig({
                model: val,
                contextWindow: model?.contextWindow || currentConfig.contextWindow,
              });
            }
          }}
          style={{ ...selectStyle, flex: 1 }}
        >
          {currentProviderDef?.defaultModels.map((m) => (
            <option key={m.id} value={m.id}>{m.name}</option>
          ))}
          <option value="__custom__">Custom...</option>
        </select>
      </div>

      {!currentProviderDef?.defaultModels.some((m) => m.id === currentConfig.model) && (
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

      <div style={{ display: 'flex', gap: '8px', marginTop: '12px', alignItems: 'center' }}>
        <Button onClick={handleTestLLM} loading={testingLLM} size="sm" variant="secondary" title="Test LLM connection">
          Test Connection
        </Button>
        {llmStatus === 'success' && <StatusBadge type="success">Connected!</StatusBadge>}
        {llmStatus === 'error' && <StatusBadge type="error">Failed</StatusBadge>}
      </div>

      {/* Notion Configuration */}
      <SectionHeader>Notion Export</SectionHeader>

      <Label>Notion API Key (Integration Token)</Label>
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
        {notionStatus === 'error' && <StatusBadge type="error">Failed</StatusBadge>}
      </div>

      {/* General Settings */}
      <SectionHeader>General</SectionHeader>

      <Label>Theme</Label>
      <div style={{ display: 'flex', gap: '4px' }}>
        {(['light', 'dark', 'system'] as ThemeMode[]).map((m) => (
          <button
            key={m}
            onClick={() => {
              onThemeChange(m);
              setLocal({ ...local, theme: m });
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

      <Label>Summary Detail Level</Label>
      <select
        value={local.summaryDetailLevel}
        onChange={(e) => setLocal({ ...local, summaryDetailLevel: (e.target as HTMLSelectElement).value as Settings['summaryDetailLevel'] })}
        style={selectStyle}
      >
        <option value="brief">Brief</option>
        <option value="standard">Standard</option>
        <option value="detailed">Detailed</option>
      </select>

      <div style={{ marginTop: '20px', paddingTop: '16px', borderTop: '1px solid var(--md-sys-color-outline-variant)' }}>
        <Button onClick={handleSave} title="Save all settings">Save Settings</Button>
      </div>
    </div>
  );
}

function SectionHeader({ children }: { children: preact.ComponentChildren }) {
  return (
    <h3 style={{
      font: 'var(--md-sys-typescale-title-medium)',
      margin: '24px 0 8px',
      paddingBottom: '4px',
      borderBottom: '1px solid var(--md-sys-color-outline-variant)',
      color: 'var(--md-sys-color-on-surface)',
    }}>
      {children}
    </h3>
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

function StatusBadge({ type, children }: { type: 'success' | 'error'; children: preact.ComponentChildren }) {
  return (
    <span style={{
      font: 'var(--md-sys-typescale-label-small)',
      color: type === 'success' ? 'var(--md-sys-color-success)' : 'var(--md-sys-color-error)',
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

const selectStyle: Record<string, string> = {
  ...inputStyle,
};
