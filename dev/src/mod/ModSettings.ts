/**
 * Settings Manager
 * Handles loading, saving, and updating mod settings
 */

import { ModSettings, DEFAULT_SETTINGS, STORAGE_KEY } from './ModConfig';
import { storage } from '../utils/storage';

type SettingPath = string;
type SettingValue = string | number | boolean | object;
type Listener = (value: SettingValue) => void;

export class SettingsManager {
    private data: ModSettings;
    private listeners: Map<SettingPath, Listener[]>;

    constructor() {
        this.listeners = new Map();
        this.data = this.load();
    }

    private load(): ModSettings {
        const stored = storage.get<Partial<ModSettings>>(STORAGE_KEY);
        return this.deepMerge(DEFAULT_SETTINGS, stored || {});
    }

    private deepMerge<T extends object>(defaults: T, stored: Partial<T>): T {
        const result = { ...defaults } as T;

        for (const key in stored) {
            if (Object.prototype.hasOwnProperty.call(stored, key)) {
                const storedValue = stored[key];
                const defaultValue = defaults[key as keyof T];

                if (
                    typeof storedValue === 'object' &&
                    storedValue !== null &&
                    !Array.isArray(storedValue) &&
                    typeof defaultValue === 'object' &&
                    defaultValue !== null
                ) {
                    (result as any)[key] = this.deepMerge(
                        defaultValue as object,
                        storedValue as object
                    );
                } else if (storedValue !== undefined) {
                    (result as any)[key] = storedValue;
                }
            }
        }

        return result;
    }

    save(): void {
        storage.set(STORAGE_KEY, this.data);
    }

    get<T extends SettingValue>(path: SettingPath): T {
        const keys = path.split('.');
        let value: any = this.data;

        for (const key of keys) {
            if (value === null || value === undefined) return undefined as any;
            value = value[key];
        }

        return value as T;
    }

    set(path: SettingPath, value: SettingValue): void {
        const keys = path.split('.');
        const lastKey = keys.pop()!;
        let target: any = this.data;

        for (const key of keys) {
            if (!target[key] || typeof target[key] !== 'object') {
                target[key] = {};
            }
            target = target[key];
        }

        target[lastKey] = value;
        this.save();
        this.emit(path, value);
    }

    on(event: SettingPath, callback: Listener): void {
        const listeners = this.listeners.get(event) || [];
        listeners.push(callback);
        this.listeners.set(event, listeners);
    }

    off(event: SettingPath, callback: Listener): void {
        const listeners = this.listeners.get(event);
        if (listeners) {
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    private emit(event: SettingPath, value: SettingValue): void {
        const listeners = this.listeners.get(event) || [];
        listeners.forEach(cb => cb(value));
    }

    reset(): void {
        this.data = { ...DEFAULT_SETTINGS };
        this.save();
    }

    getAll(): ModSettings {
        return { ...this.data };
    }

    getKeys(): ModSettings['keys'] {
        return { ...this.data.keys };
    }
}

// Singleton instance
let settingsInstance: SettingsManager | null = null;

export function getSettings(): SettingsManager {
    if (!settingsInstance) {
        settingsInstance = new SettingsManager();
    }
    return settingsInstance;
}
