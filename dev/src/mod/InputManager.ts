/**
 * Input Manager
 * Handles keyboard and mouse input with configurable keybindings
 */

import { GameInterface } from './GameInterface';
import { SettingsManager } from './ModSettings';
import { MacroManager } from './MacroManager';
import { Renderer } from './Renderer';
import { KeyBindings } from './ModConfig';

export type MenuToggleCallback = () => void;

export class InputManager {
    private game: GameInterface;
    private settings: SettingsManager;
    private macros: MacroManager;
    private renderer: Renderer;
    private keyBindings: KeyBindings;
    private keysPressed: Set<string> = new Set();
    private menuToggleCallback: MenuToggleCallback | null = null;
    private isMenuOpen: boolean = false;

    constructor(
        game: GameInterface,
        settings: SettingsManager,
        macros: MacroManager,
        renderer: Renderer
    ) {
        this.game = game;
        this.settings = settings;
        this.macros = macros;
        this.renderer = renderer;
        this.keyBindings = settings.getKeys();

        this.bindEvents();
    }

    setMenuToggleCallback(callback: MenuToggleCallback): void {
        this.menuToggleCallback = callback;
    }

    setMenuOpen(isOpen: boolean): void {
        this.isMenuOpen = isOpen;
    }

    updateKeyBindings(): void {
        this.keyBindings = this.settings.getKeys();
    }

    private bindEvents(): void {
        document.addEventListener('keydown', (e) => this.handleKeyDown(e));
        document.addEventListener('keyup', (e) => this.handleKeyUp(e));
        document.addEventListener('mousemove', (e) => this.handleMouseMove(e));
    }

    private handleKeyDown(e: KeyboardEvent): void {
        // Skip if in input field
        const target = e.target as HTMLElement;
        if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
            return;
        }

        const key = e.key.toLowerCase();

        // Toggle menu with Escape
        if (e.key === 'Escape') {
            e.preventDefault();
            if (this.menuToggleCallback) {
                this.menuToggleCallback();
            }
            return;
        }

        // Skip other actions if menu is open
        if (this.isMenuOpen) return;

        // Prevent duplicate key events
        if (this.keysPressed.has(key)) return;
        this.keysPressed.add(key);

        // Handle key actions
        this.handleAction(e, key);
    }

    private handleKeyUp(e: KeyboardEvent): void {
        const key = e.key.toLowerCase();
        this.keysPressed.delete(key);

        // Stop rapid feed when key released
        if (this.matchesKey(key, e.key, this.keyBindings.rapidFeed)) {
            this.macros.stopRapidFeed();
        }
    }

    private handleMouseMove(e: MouseEvent): void {
        if (!this.game.frozen) {
            this.game.mouseX = e.clientX;
            this.game.mouseY = e.clientY;
        }
    }

    private matchesKey(lowerKey: string, originalKey: string, binding: string): boolean {
        return lowerKey === binding.toLowerCase() || originalKey === binding;
    }

    private handleAction(e: KeyboardEvent, key: string): void {
        const keys = this.keyBindings;

        // Feed
        if (this.matchesKey(key, e.key, keys.feed)) {
            this.game.feed();
        }

        // Rapid Feed
        if (
            this.matchesKey(key, e.key, keys.rapidFeed) &&
            this.settings.get<boolean>('rapidFeedEnabled')
        ) {
            this.macros.startRapidFeed();
        }

        // Split
        if (this.matchesKey(key, e.key, keys.split)) {
            this.game.split();
        }

        // Double Split
        if (this.matchesKey(key, e.key, keys.doubleSplit)) {
            this.macros.doubleSplit();
        }

        // Triple Split
        if (this.matchesKey(key, e.key, keys.tripleSplit)) {
            this.macros.tripleSplit();
        }

        // Quad Split
        if (this.matchesKey(key, e.key, keys.quadSplit)) {
            this.macros.quadSplit();
        }

        // Freeze mouse
        if (this.matchesKey(key, e.key, keys.freeze)) {
            this.toggleFreeze();
        }

        // Toggle mass display
        if (this.matchesKey(key, e.key, keys.toggleMass)) {
            const current = this.settings.get<boolean>('showMass');
            this.settings.set('showMass', !current);
        }

        // Toggle names
        if (this.matchesKey(key, e.key, keys.toggleNames)) {
            const current = this.settings.get<boolean>('showNames');
            this.settings.set('showNames', !current);
        }

        // Toggle skins
        if (this.matchesKey(key, e.key, keys.toggleSkins)) {
            const current = this.settings.get<boolean>('showSkins');
            this.settings.set('showSkins', !current);
        }

        // Zoom controls
        if (this.matchesKey(key, e.key, keys.zoomIn)) {
            this.renderer.zoomIn();
        }

        if (this.matchesKey(key, e.key, keys.zoomOut)) {
            this.renderer.zoomOut();
        }

        if (this.matchesKey(key, e.key, keys.resetZoom)) {
            this.renderer.resetZoom();
        }
    }

    private toggleFreeze(): void {
        this.game.frozen = !this.game.frozen;

        if (this.game.frozen) {
            this.game.frozenPos = {
                x: this.game.mouseX,
                y: this.game.mouseY
            };
        }
    }

    isKeyPressed(key: string): boolean {
        return this.keysPressed.has(key.toLowerCase());
    }

    destroy(): void {
        document.removeEventListener('keydown', (e) => this.handleKeyDown(e));
        document.removeEventListener('keyup', (e) => this.handleKeyUp(e));
        document.removeEventListener('mousemove', (e) => this.handleMouseMove(e));
    }
}
