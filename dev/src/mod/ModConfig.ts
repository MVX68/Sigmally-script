/**
 * Sigmally Mod Configuration
 * Central configuration for all mod features
 */

export interface KeyBindings {
    feed: string;
    rapidFeed: string;
    split: string;
    doubleSplit: string;
    tripleSplit: string;
    quadSplit: string;
    freeze: string;
    toggleMenu: string;
    toggleMass: string;
    toggleNames: string;
    toggleSkins: string;
    zoomIn: string;
    zoomOut: string;
    resetZoom: string;
}

export interface ModSettings {
    // Keybindings
    keys: KeyBindings;

    // Features
    rapidFeedSpeed: number;
    rapidFeedEnabled: boolean;
    showMass: boolean;
    showNames: boolean;
    showSkins: boolean;
    massType: 'mass' | 'short';
    customSkin: string;
    customName: string;

    // Zoom
    zoomLevel: number;
    minZoom: number;
    maxZoom: number;
    zoomStep: number;

    // Visual
    massColor: string;
    massOutline: boolean;
    massOutlineColor: string;
    massFontSize: number;

    // Minimap
    showMinimap: boolean;
    minimapSize: number;
    minimapOpacity: number;

    // Performance
    fpsBoost: boolean;

    // Menu
    menuOpacity: number;
}

export const DEFAULT_SETTINGS: ModSettings = {
    keys: {
        feed: 'w',
        rapidFeed: 'e',
        split: ' ',
        doubleSplit: 'q',
        tripleSplit: 't',
        quadSplit: 'r',
        freeze: 's',
        toggleMenu: 'Escape',
        toggleMass: 'm',
        toggleNames: 'n',
        toggleSkins: 'k',
        zoomIn: '+',
        zoomOut: '-',
        resetZoom: '0'
    },
    rapidFeedSpeed: 50,
    rapidFeedEnabled: true,
    showMass: true,
    showNames: true,
    showSkins: true,
    massType: 'mass',
    customSkin: '',
    customName: '',
    zoomLevel: 1,
    minZoom: 0.1,
    maxZoom: 5,
    zoomStep: 0.1,
    massColor: '#FFFFFF',
    massOutline: true,
    massOutlineColor: '#000000',
    massFontSize: 16,
    showMinimap: true,
    minimapSize: 200,
    minimapOpacity: 0.8,
    fpsBoost: true,
    menuOpacity: 0.95
};

export const MOD_VERSION = '2.0.0';
export const STORAGE_KEY = 'sigmally_mod_settings';
