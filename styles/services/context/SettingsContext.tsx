// context/SettingsContext.tsx
import React, { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';

interface AppSettings {
    backgroundColor: string;
    miaFontColor: string;
    backgroundImage: string;
    animationsEnabled: boolean;
    audioFeedbackEnabled: boolean;
    // Security Settings
    inputSanitizationEnabled: boolean;
    promptInjectionGuardEnabled: boolean;
    clientSideRateLimitingEnabled: boolean;
    // AI provider settings (OpenAI-compatible HTTP endpoint)
    aiBaseUrl: string;
    aiModel: string;
    aiApiKey: string;
    // Pattern Z (multi-LLM bus dispatch). Default OFF — when ON, action
    // buttons that map to a non-'single' strategy in patternZStrategies
    // route through the aggregator (:7780/dispatch) instead of calling LM
    // Studio directly. The fields persist via the existing
    // ai-shunt-settings localStorage key; aiService reads localStorage on
    // every call so toggling these takes effect immediately.
    patternZEnabled: boolean;
    patternZStrategy: 'vote' | 'pick-best' | 'synthesize';
    patternZTimeoutMs: number;
}

const defaultSettings: AppSettings = {
    backgroundColor: '#111827', // dark gray
    miaFontColor: '#22d3ee', // cyan
    backgroundImage: '',
    animationsEnabled: true,
    audioFeedbackEnabled: true,
    // Default security to on
    inputSanitizationEnabled: true,
    promptInjectionGuardEnabled: true,
    clientSideRateLimitingEnabled: true,
    // Default AI endpoint targets LM Studio; user can override in Settings.
    aiBaseUrl: 'http://localhost:1234/v1/chat/completions',
    aiModel: 'local-model',
    aiApiKey: '',
    // Pattern Z defaults — OFF, synthesize-when-enabled, 30s timeout.
    patternZEnabled: false,
    patternZStrategy: 'synthesize',
    patternZTimeoutMs: 30000,
};

const SETTINGS_STORAGE_KEY = 'ai-shunt-settings';

const loadSettings = (): AppSettings => {
    try {
        const storedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
        if (storedSettings) {
            return { ...defaultSettings, ...JSON.parse(storedSettings) };
        }
    } catch (error) {
        console.warn("Failed to load settings from localStorage:", error);
    }
    return defaultSettings;
};

interface SettingsContextType {
    settings: AppSettings;
    updateSetting: <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => void;
    resetSettings: () => void;
}

const SettingsContext = createContext<SettingsContextType | undefined>(undefined);

export const SettingsProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState<AppSettings>(loadSettings);

    useEffect(() => {
        try {
            localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
        } catch (error) {
            console.error("Failed to save settings to localStorage:", error);
        }
    }, [settings]);

    const updateSetting = useCallback(<K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
        setSettings(prevSettings => ({
            ...prevSettings,
            [key]: value,
        }));
    }, []);
    
    const resetSettings = useCallback(() => {
        setSettings(defaultSettings);
    }, []);

    return (
        <SettingsContext.Provider value={{ settings, updateSetting, resetSettings }}>
            {children}
        </SettingsContext.Provider>
    );
};

export const useSettings = (): SettingsContextType => {
    const context = useContext(SettingsContext);
    if (context === undefined) {
        throw new Error('useSettings must be used within a SettingsProvider');
    }
    return context;
};