/**
 * Sigmally Mod - Main Entry Point
 * Ultra-fast feeding, mass display, and configurable macros for sigmally.com
 */

import { getSettings, SettingsManager } from './ModSettings';
import { getGame, GameInterface } from './GameInterface';
import { MacroManager } from './MacroManager';
import { Renderer } from './Renderer';
import { InputManager } from './InputManager';
import { initMenu } from './ui/ModMenu';
import { MOD_VERSION } from './ModConfig';
import './ui/styles.css';

class SigmallyMod {
    settings: SettingsManager;
    game: GameInterface;
    macros: MacroManager;
    renderer: Renderer;
    inputManager: InputManager;

    constructor() {
        console.log(`%c[Sigmally Mod] v${MOD_VERSION} initializing...`,
            'color: #667eea; font-weight: bold;');

        // Initialize core systems
        this.settings = getSettings();
        this.game = getGame();

        // Initialize macro system
        this.macros = new MacroManager(this.game, this.settings);

        // Initialize renderer (overlay, mass display, minimap)
        this.renderer = new Renderer(this.game, this.settings);

        // Initialize input handling
        this.inputManager = new InputManager(
            this.game,
            this.settings,
            this.macros,
            this.renderer
        );

        // Initialize UI after DOM is ready
        this.initUI();

        // Setup game event handlers
        this.setupGameEvents();

        console.log(`%c[Sigmally Mod] v${MOD_VERSION} loaded successfully!`,
            'color: #00ff00; font-weight: bold; font-size: 14px;');
    }

    private initUI(): void {
        const init = () => {
            if (document.body) {
                initMenu(this.settings, this.inputManager);
                this.injectStyles();
            } else {
                requestAnimationFrame(init);
            }
        };

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
        } else {
            init();
        }
    }

    private injectStyles(): void {
        // Inject additional global styles
        const style = document.createElement('style');
        style.textContent = `
            /* Sigmally Mod Global Styles */
            @import url('https://fonts.googleapis.com/css2?family=Ubuntu:wght@400;500;700&display=swap');
        `;
        document.head.appendChild(style);
    }

    private setupGameEvents(): void {
        // Handle player spawn
        this.game.onSpawn(() => {
            console.log('[Sigmally Mod] Player spawned');
        });

        // Handle player death
        this.game.onDeath(() => {
            console.log('[Sigmally Mod] Player died');
            this.macros.stopRapidFeed();
        });

        // Handle settings changes
        this.settings.on('rapidFeedSpeed', () => {
            this.macros.updateFeedSpeed();
        });
    }
}

// Initialize mod
function init(): void {
    try {
        (window as any).SigmallyMod = new SigmallyMod();
    } catch (e) {
        console.error('[Sigmally Mod] Initialization error:', e);
    }
}

// Wait for page to be ready
if (document.readyState === 'complete') {
    init();
} else {
    window.addEventListener('load', init);
}

export { SigmallyMod };
