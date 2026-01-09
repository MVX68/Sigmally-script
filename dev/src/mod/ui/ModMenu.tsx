/**
 * Mod Menu Component
 * Preact-based settings menu with keybinding configuration
 */

import { h, Component, Fragment, render } from 'preact';
import { SettingsManager } from '../ModSettings';
import { MOD_VERSION } from '../ModConfig';
import { InputManager } from '../InputManager';

interface MenuProps {
    settings: SettingsManager;
    inputManager: InputManager;
}

interface MenuState {
    isOpen: boolean;
    activeTab: string;
    listeningForKey: string | null;
}

type TabName = 'general' | 'keybinds' | 'visual' | 'macros';

const TABS: { id: TabName; label: string }[] = [
    { id: 'general', label: 'General' },
    { id: 'keybinds', label: 'Touches' },
    { id: 'visual', label: 'Visuel' },
    { id: 'macros', label: 'Macros' }
];

const KEY_BINDINGS = [
    { key: 'feed', label: 'Feed (W)', path: 'keys.feed' },
    { key: 'rapidFeed', label: 'Feed Rapide', path: 'keys.rapidFeed' },
    { key: 'split', label: 'Split', path: 'keys.split' },
    { key: 'doubleSplit', label: 'Double Split', path: 'keys.doubleSplit' },
    { key: 'tripleSplit', label: 'Triple Split', path: 'keys.tripleSplit' },
    { key: 'quadSplit', label: 'Quad Split (16)', path: 'keys.quadSplit' },
    { key: 'freeze', label: 'Freeze Mouse', path: 'keys.freeze' },
    { key: 'toggleMass', label: 'Toggle Masse', path: 'keys.toggleMass' },
    { key: 'zoomIn', label: 'Zoom +', path: 'keys.zoomIn' },
    { key: 'zoomOut', label: 'Zoom -', path: 'keys.zoomOut' },
    { key: 'resetZoom', label: 'Reset Zoom', path: 'keys.resetZoom' }
];

export class ModMenu extends Component<MenuProps, MenuState> {
    private keydownHandler: ((e: KeyboardEvent) => void) | null = null;

    constructor(props: MenuProps) {
        super(props);
        this.state = {
            isOpen: false,
            activeTab: 'general',
            listeningForKey: null
        };

        // Register menu toggle callback
        props.inputManager.setMenuToggleCallback(() => this.toggle());
    }

    componentDidMount(): void {
        this.keydownHandler = (e: KeyboardEvent) => {
            if (this.state.listeningForKey) {
                e.preventDefault();
                e.stopPropagation();

                const keyValue = e.key === ' ' ? ' ' : e.key.toLowerCase();
                this.props.settings.set(this.state.listeningForKey, keyValue);
                this.props.inputManager.updateKeyBindings();
                this.setState({ listeningForKey: null });
            }
        };

        document.addEventListener('keydown', this.keydownHandler);
    }

    componentWillUnmount(): void {
        if (this.keydownHandler) {
            document.removeEventListener('keydown', this.keydownHandler);
        }
    }

    toggle = (): void => {
        const newIsOpen = !this.state.isOpen;
        this.setState({ isOpen: newIsOpen, listeningForKey: null });
        this.props.inputManager.setMenuOpen(newIsOpen);
    };

    open = (): void => {
        this.setState({ isOpen: true });
        this.props.inputManager.setMenuOpen(true);
    };

    close = (): void => {
        this.setState({ isOpen: false, listeningForKey: null });
        this.props.inputManager.setMenuOpen(false);
    };

    switchTab = (tab: string): void => {
        this.setState({ activeTab: tab, listeningForKey: null });
    };

    getKeyDisplay(value: string): string {
        const specialKeys: Record<string, string> = {
            ' ': 'SPACE',
            'escape': 'ESC',
            'arrowup': '↑',
            'arrowdown': '↓',
            'arrowleft': '←',
            'arrowright': '→',
            'control': 'CTRL',
            'shift': 'SHIFT',
            'alt': 'ALT'
        };
        return specialKeys[value.toLowerCase()] || value.toUpperCase();
    }

    handleCheckbox = (setting: string) => (e: Event): void => {
        const target = e.target as HTMLInputElement;
        this.props.settings.set(setting, target.checked);
        this.forceUpdate();
    };

    handleSelect = (setting: string) => (e: Event): void => {
        const target = e.target as HTMLSelectElement;
        this.props.settings.set(setting, target.value);
        this.forceUpdate();
    };

    handleRange = (setting: string) => (e: Event): void => {
        const target = e.target as HTMLInputElement;
        this.props.settings.set(setting, parseFloat(target.value));
        this.forceUpdate();
    };

    handleColor = (setting: string) => (e: Event): void => {
        const target = e.target as HTMLInputElement;
        this.props.settings.set(setting, target.value);
        this.forceUpdate();
    };

    startKeyListen = (path: string): void => {
        this.setState({ listeningForKey: path });
    };

    handleReset = (): void => {
        if (confirm('Réinitialiser tous les paramètres ?')) {
            this.props.settings.reset();
            this.props.inputManager.updateKeyBindings();
            this.forceUpdate();
        }
    };

    renderGeneralTab(): h.JSX.Element {
        const { settings } = this.props;

        return (
            <div class="sm-tab-content active">
                <div class="sm-setting">
                    <label>
                        <input
                            type="checkbox"
                            checked={settings.get<boolean>('showMass')}
                            onChange={this.handleCheckbox('showMass')}
                        />
                        Afficher la masse des joueurs
                    </label>
                </div>
                <div class="sm-setting">
                    <label>
                        <input
                            type="checkbox"
                            checked={settings.get<boolean>('showNames')}
                            onChange={this.handleCheckbox('showNames')}
                        />
                        Afficher les noms
                    </label>
                </div>
                <div class="sm-setting">
                    <label>
                        <input
                            type="checkbox"
                            checked={settings.get<boolean>('showSkins')}
                            onChange={this.handleCheckbox('showSkins')}
                        />
                        Afficher les skins
                    </label>
                </div>
                <div class="sm-setting">
                    <label>
                        <input
                            type="checkbox"
                            checked={settings.get<boolean>('showMinimap')}
                            onChange={this.handleCheckbox('showMinimap')}
                        />
                        Afficher la minimap
                    </label>
                </div>
                <div class="sm-setting">
                    <label>
                        <input
                            type="checkbox"
                            checked={settings.get<boolean>('fpsBoost')}
                            onChange={this.handleCheckbox('fpsBoost')}
                        />
                        Mode performance
                    </label>
                </div>
                <div class="sm-setting">
                    <label>Type d'affichage masse:</label>
                    <select
                        value={settings.get<string>('massType')}
                        onChange={this.handleSelect('massType')}
                    >
                        <option value="mass">Nombre complet</option>
                        <option value="short">Abrégé (K/M)</option>
                    </select>
                </div>
            </div>
        );
    }

    renderKeybindsTab(): h.JSX.Element {
        const { settings } = this.props;
        const { listeningForKey } = this.state;

        return (
            <div class="sm-tab-content">
                <div class="sm-keybinds-list">
                    {KEY_BINDINGS.map(binding => {
                        const value = settings.get<string>(binding.path);
                        const isListening = listeningForKey === binding.path;

                        return (
                            <div class="sm-keybind" key={binding.key}>
                                <span>{binding.label}</span>
                                <button
                                    class={`sm-key-btn ${isListening ? 'listening' : ''}`}
                                    onClick={() => this.startKeyListen(binding.path)}
                                >
                                    {isListening ? '...' : this.getKeyDisplay(value)}
                                </button>
                            </div>
                        );
                    })}
                </div>
                <p class="sm-hint">
                    Cliquez sur un bouton puis appuyez sur une touche pour la modifier
                </p>
            </div>
        );
    }

    renderVisualTab(): h.JSX.Element {
        const { settings } = this.props;

        return (
            <div class="sm-tab-content">
                <div class="sm-setting">
                    <label>Couleur de la masse:</label>
                    <input
                        type="color"
                        value={settings.get<string>('massColor')}
                        onChange={this.handleColor('massColor')}
                    />
                </div>
                <div class="sm-setting">
                    <label>
                        <input
                            type="checkbox"
                            checked={settings.get<boolean>('massOutline')}
                            onChange={this.handleCheckbox('massOutline')}
                        />
                        Contour du texte
                    </label>
                </div>
                <div class="sm-setting">
                    <label>Couleur du contour:</label>
                    <input
                        type="color"
                        value={settings.get<string>('massOutlineColor')}
                        onChange={this.handleColor('massOutlineColor')}
                    />
                </div>
                <div class="sm-setting">
                    <label>
                        Taille police masse: {settings.get<number>('massFontSize')}px
                    </label>
                    <input
                        type="range"
                        min="10"
                        max="30"
                        value={settings.get<number>('massFontSize')}
                        onInput={this.handleRange('massFontSize')}
                    />
                </div>
                <div class="sm-setting">
                    <label>
                        Taille minimap: {settings.get<number>('minimapSize')}px
                    </label>
                    <input
                        type="range"
                        min="100"
                        max="400"
                        value={settings.get<number>('minimapSize')}
                        onInput={this.handleRange('minimapSize')}
                    />
                </div>
                <div class="sm-setting">
                    <label>
                        Opacité minimap: {Math.round(settings.get<number>('minimapOpacity') * 100)}%
                    </label>
                    <input
                        type="range"
                        min="0.1"
                        max="1"
                        step="0.1"
                        value={settings.get<number>('minimapOpacity')}
                        onInput={this.handleRange('minimapOpacity')}
                    />
                </div>
            </div>
        );
    }

    renderMacrosTab(): h.JSX.Element {
        const { settings } = this.props;

        return (
            <div class="sm-tab-content">
                <div class="sm-setting">
                    <label>
                        <input
                            type="checkbox"
                            checked={settings.get<boolean>('rapidFeedEnabled')}
                            onChange={this.handleCheckbox('rapidFeedEnabled')}
                        />
                        Activer le Feed Rapide
                    </label>
                </div>
                <div class="sm-setting">
                    <label>
                        Vitesse Feed Rapide: {settings.get<number>('rapidFeedSpeed')}ms
                    </label>
                    <input
                        type="range"
                        min="10"
                        max="200"
                        value={settings.get<number>('rapidFeedSpeed')}
                        onInput={this.handleRange('rapidFeedSpeed')}
                    />
                </div>
                <div class="sm-macro-info">
                    <h4>Raccourcis Macros:</h4>
                    <ul>
                        <li><strong>Feed Rapide:</strong> Maintenir la touche</li>
                        <li><strong>Double Split:</strong> 2 splits rapides</li>
                        <li><strong>Triple Split:</strong> 3 splits rapides</li>
                        <li><strong>Quad Split:</strong> 4 splits (16 cells)</li>
                        <li><strong>Freeze:</strong> Gèle la position de la souris</li>
                    </ul>
                </div>
            </div>
        );
    }

    renderTabContent(): h.JSX.Element {
        const { activeTab } = this.state;

        switch (activeTab) {
            case 'general':
                return this.renderGeneralTab();
            case 'keybinds':
                return this.renderKeybindsTab();
            case 'visual':
                return this.renderVisualTab();
            case 'macros':
                return this.renderMacrosTab();
            default:
                return this.renderGeneralTab();
        }
    }

    render(): h.JSX.Element | null {
        if (!this.state.isOpen) {
            return null;
        }

        const { activeTab } = this.state;

        return (
            <div id="sigmally-mod-menu" class="open">
                <div class="sm-menu-backdrop" onClick={this.close} />
                <div class="sm-menu-container">
                    <div class="sm-menu-header">
                        <h2>Sigmally Mod v{MOD_VERSION}</h2>
                        <button class="sm-close-btn" onClick={this.close}>
                            &times;
                        </button>
                    </div>

                    <div class="sm-menu-tabs">
                        {TABS.map(tab => (
                            <button
                                key={tab.id}
                                class={`sm-tab ${activeTab === tab.id ? 'active' : ''}`}
                                onClick={() => this.switchTab(tab.id)}
                            >
                                {tab.label}
                            </button>
                        ))}
                    </div>

                    <div class="sm-menu-content">
                        {this.renderTabContent()}
                    </div>

                    <div class="sm-menu-footer">
                        <button class="sm-reset-btn" onClick={this.handleReset}>
                            Réinitialiser
                        </button>
                        <span class="sm-footer-text">
                            Appuyez sur ESC pour fermer
                        </span>
                    </div>
                </div>
            </div>
        );
    }
}

export function initMenu(
    settings: SettingsManager,
    inputManager: InputManager
): void {
    const container = document.createElement('div');
    container.id = 'sigmally-mod-menu-container';
    document.body.appendChild(container);

    render(
        <ModMenu settings={settings} inputManager={inputManager} />,
        container
    );
}
