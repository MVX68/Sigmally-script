// ==UserScript==
// @name         Sigmally Mod - Ultra Feed & Mass Display
// @namespace    https://github.com/sigmally-mod
// @version      2.0.0
// @description  Script avancé pour one.sigmally.com - Feed rapide, affichage masse, macros configurables
// @author       SigmallyMod
// @match        *://one.sigmally.com/*
// @match        *://sigmally.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // =====================================================
    // CONFIGURATION & STORAGE
    // =====================================================

    const CONFIG = {
        version: '2.0.0',
        storageKey: 'sigmally_mod_settings',
        defaultSettings: {
            // Keybindings
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
            // Features
            rapidFeedSpeed: 50,
            rapidFeedEnabled: true,
            showMass: true,
            showNames: true,
            showSkins: true,
            massType: 'mass', // 'mass' or 'short'
            customSkin: '',
            customName: '',
            zoomLevel: 1,
            minZoom: 0.1,
            maxZoom: 5,
            zoomStep: 0.1,
            // Visual
            massColor: '#FFFFFF',
            massOutline: true,
            massOutlineColor: '#000000',
            massFontSize: 16,
            // Minimap
            showMinimap: true,
            minimapSize: 200,
            minimapOpacity: 0.8,
            // Performance
            fpsBoost: true,
            // Menu
            menuOpacity: 0.95
        }
    };

    // =====================================================
    // STORAGE MANAGER
    // =====================================================

    class Storage {
        static get(key, defaultValue = null) {
            try {
                if (typeof GM_getValue !== 'undefined') {
                    const val = GM_getValue(key, null);
                    return val !== null ? val : defaultValue;
                }
                const stored = localStorage.getItem(key);
                return stored ? JSON.parse(stored) : defaultValue;
            } catch {
                return defaultValue;
            }
        }

        static set(key, value) {
            try {
                if (typeof GM_setValue !== 'undefined') {
                    GM_setValue(key, value);
                } else {
                    localStorage.setItem(key, JSON.stringify(value));
                }
            } catch (e) {
                console.error('Storage error:', e);
            }
        }
    }

    // =====================================================
    // SETTINGS MANAGER
    // =====================================================

    class Settings {
        constructor() {
            this.data = this.load();
            this.listeners = new Map();
        }

        load() {
            const stored = Storage.get(CONFIG.storageKey);
            return this.merge(CONFIG.defaultSettings, stored || {});
        }

        merge(defaults, stored) {
            const result = { ...defaults };
            for (const key in stored) {
                if (typeof stored[key] === 'object' && !Array.isArray(stored[key]) && stored[key] !== null) {
                    result[key] = this.merge(defaults[key] || {}, stored[key]);
                } else {
                    result[key] = stored[key];
                }
            }
            return result;
        }

        save() {
            Storage.set(CONFIG.storageKey, this.data);
        }

        get(path) {
            return path.split('.').reduce((obj, key) => obj?.[key], this.data);
        }

        set(path, value) {
            const keys = path.split('.');
            const lastKey = keys.pop();
            const target = keys.reduce((obj, key) => {
                if (!obj[key]) obj[key] = {};
                return obj[key];
            }, this.data);
            target[lastKey] = value;
            this.save();
            this.emit(path, value);
        }

        on(event, callback) {
            if (!this.listeners.has(event)) {
                this.listeners.set(event, []);
            }
            this.listeners.get(event).push(callback);
        }

        emit(event, value) {
            const callbacks = this.listeners.get(event) || [];
            callbacks.forEach(cb => cb(value));
        }

        reset() {
            this.data = { ...CONFIG.defaultSettings };
            this.save();
        }
    }

    // =====================================================
    // GAME INTERFACE
    // =====================================================

    class GameInterface {
        constructor() {
            this.ws = null;
            this.canvas = null;
            this.ctx = null;
            this.camera = { x: 0, y: 0, scale: 1 };
            this.cells = new Map();
            this.myCells = new Set();
            this.myMass = 0;
            this.mouseX = 0;
            this.mouseY = 0;
            this.frozen = false;
            this.frozenPos = { x: 0, y: 0 };
            this.mapBounds = { minX: -7071, minY: -7071, maxX: 7071, maxY: 7071 };

            this.hookWebSocket();
            this.hookCanvas();
        }

        hookWebSocket() {
            const self = this;
            const OriginalWebSocket = window.WebSocket;

            window.WebSocket = function(url, protocols) {
                const ws = protocols ? new OriginalWebSocket(url, protocols) : new OriginalWebSocket(url);

                if (url.includes('sigmally') || url.includes('agar')) {
                    self.ws = ws;

                    ws.addEventListener('message', (event) => {
                        self.parseMessage(event.data);
                    });

                    ws.addEventListener('close', () => {
                        self.myCells.clear();
                        self.cells.clear();
                        self.myMass = 0;
                    });
                }

                return ws;
            };

            window.WebSocket.prototype = OriginalWebSocket.prototype;
            window.WebSocket.CONNECTING = OriginalWebSocket.CONNECTING;
            window.WebSocket.OPEN = OriginalWebSocket.OPEN;
            window.WebSocket.CLOSING = OriginalWebSocket.CLOSING;
            window.WebSocket.CLOSED = OriginalWebSocket.CLOSED;
        }

        hookCanvas() {
            const self = this;

            const setupCanvas = () => {
                self.canvas = document.querySelector('canvas');
                if (self.canvas) {
                    self.ctx = self.canvas.getContext('2d');
                    self.hookCanvasContext();
                    return true;
                }
                return false;
            };

            if (!setupCanvas()) {
                const observer = new MutationObserver(() => {
                    if (setupCanvas()) {
                        observer.disconnect();
                    }
                });
                observer.observe(document.body || document.documentElement, {
                    childList: true,
                    subtree: true
                });
            }
        }

        hookCanvasContext() {
            const self = this;
            const originalTranslate = this.ctx.translate.bind(this.ctx);
            const originalScale = this.ctx.scale.bind(this.ctx);

            this.ctx.translate = function(x, y) {
                self.camera.x = -x;
                self.camera.y = -y;
                return originalTranslate(x, y);
            };

            this.ctx.scale = function(x, y) {
                self.camera.scale = x;
                return originalScale(x, y);
            };
        }

        parseMessage(data) {
            if (!(data instanceof ArrayBuffer)) return;

            const view = new DataView(data);
            if (view.byteLength < 1) return;

            const opcode = view.getUint8(0);

            try {
                switch (opcode) {
                    case 16: // Cell update
                        this.parseCellUpdate(view);
                        break;
                    case 17: // Position update
                        this.parsePosition(view);
                        break;
                    case 32: // Own cell
                        if (view.byteLength >= 5) {
                            const cellId = view.getUint32(1, true);
                            this.myCells.add(cellId);
                        }
                        break;
                    case 64: // Map bounds
                        this.parseMapBounds(view);
                        break;
                }
            } catch (e) {
                // Silently handle parse errors
            }
        }

        parseCellUpdate(view) {
            let offset = 1;

            // Skip eat records
            const eatCount = view.getUint16(offset, true);
            offset += 2;
            offset += eatCount * 8;

            // Parse cells
            while (offset < view.byteLength) {
                const cellId = view.getUint32(offset, true);
                offset += 4;

                if (cellId === 0) break;

                const x = view.getInt32(offset, true);
                offset += 4;
                const y = view.getInt32(offset, true);
                offset += 4;
                const size = view.getUint16(offset, true);
                offset += 2;

                // Skip flags and extra data
                const flags = view.getUint8(offset);
                offset += 1;

                if (flags & 2) offset += 3; // RGB
                if (flags & 4) { // Skin
                    while (view.getUint8(offset) !== 0) offset++;
                    offset++;
                }
                if (flags & 8) { // Name
                    while (view.getUint8(offset) !== 0) offset++;
                    offset++;
                }

                this.cells.set(cellId, {
                    id: cellId,
                    x, y,
                    size,
                    mass: Math.floor(size * size / 100),
                    isMe: this.myCells.has(cellId)
                });
            }

            // Parse destroyed cells
            const destroyCount = view.getUint16(offset, true);
            offset += 2;

            for (let i = 0; i < destroyCount; i++) {
                const cellId = view.getUint32(offset, true);
                offset += 4;
                this.cells.delete(cellId);
                this.myCells.delete(cellId);
            }

            // Update my total mass
            this.updateMyMass();
        }

        parsePosition(view) {
            if (view.byteLength >= 9) {
                this.camera.x = view.getFloat32(1, true);
                this.camera.y = view.getFloat32(5, true);
            }
        }

        parseMapBounds(view) {
            if (view.byteLength >= 33) {
                this.mapBounds = {
                    minX: view.getFloat64(1, true),
                    minY: view.getFloat64(9, true),
                    maxX: view.getFloat64(17, true),
                    maxY: view.getFloat64(25, true)
                };
            }
        }

        updateMyMass() {
            this.myMass = 0;
            for (const cellId of this.myCells) {
                const cell = this.cells.get(cellId);
                if (cell) {
                    this.myMass += cell.mass;
                }
            }
        }

        send(buffer) {
            if (this.ws && this.ws.readyState === WebSocket.OPEN) {
                this.ws.send(buffer);
            }
        }

        feed() {
            const buffer = new ArrayBuffer(1);
            new DataView(buffer).setUint8(0, 21);
            this.send(buffer);
        }

        split() {
            const buffer = new ArrayBuffer(1);
            new DataView(buffer).setUint8(0, 17);
            this.send(buffer);
        }

        setTarget(x, y) {
            const buffer = new ArrayBuffer(13);
            const view = new DataView(buffer);
            view.setUint8(0, 16);
            view.setInt32(1, x, true);
            view.setInt32(5, y, true);
            view.setUint32(9, 0, true);
            this.send(buffer);
        }
    }

    // =====================================================
    // MACRO MANAGER
    // =====================================================

    class MacroManager {
        constructor(game, settings) {
            this.game = game;
            this.settings = settings;
            this.rapidFeedInterval = null;
            this.isRapidFeeding = false;
        }

        startRapidFeed() {
            if (this.isRapidFeeding) return;

            this.isRapidFeeding = true;
            const speed = this.settings.get('rapidFeedSpeed');

            this.rapidFeedInterval = setInterval(() => {
                this.game.feed();
            }, speed);
        }

        stopRapidFeed() {
            this.isRapidFeeding = false;
            if (this.rapidFeedInterval) {
                clearInterval(this.rapidFeedInterval);
                this.rapidFeedInterval = null;
            }
        }

        doubleSplit() {
            this.game.split();
            setTimeout(() => this.game.split(), 50);
        }

        tripleSplit() {
            this.game.split();
            setTimeout(() => this.game.split(), 50);
            setTimeout(() => this.game.split(), 100);
        }

        quadSplit() {
            this.game.split();
            setTimeout(() => this.game.split(), 50);
            setTimeout(() => this.game.split(), 100);
            setTimeout(() => this.game.split(), 150);
        }
    }

    // =====================================================
    // RENDERER
    // =====================================================

    class Renderer {
        constructor(game, settings) {
            this.game = game;
            this.settings = settings;
            this.zoomLevel = settings.get('zoomLevel');

            this.setupOverlay();
            this.startRenderLoop();
        }

        setupOverlay() {
            this.overlay = document.createElement('canvas');
            this.overlay.id = 'sigmally-mod-overlay';
            this.overlay.style.cssText = `
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                pointer-events: none;
                z-index: 999;
            `;
            document.body.appendChild(this.overlay);
            this.overlayCtx = this.overlay.getContext('2d');

            this.resizeOverlay();
            window.addEventListener('resize', () => this.resizeOverlay());
        }

        resizeOverlay() {
            this.overlay.width = window.innerWidth;
            this.overlay.height = window.innerHeight;
        }

        startRenderLoop() {
            const render = () => {
                this.render();
                requestAnimationFrame(render);
            };
            render();
        }

        render() {
            this.overlayCtx.clearRect(0, 0, this.overlay.width, this.overlay.height);

            if (this.settings.get('showMass')) {
                this.renderMass();
            }

            if (this.settings.get('showMinimap')) {
                this.renderMinimap();
            }

            this.renderStats();
        }

        renderMass() {
            const ctx = this.overlayCtx;
            const fontSize = this.settings.get('massFontSize');
            const massType = this.settings.get('massType');
            const showOutline = this.settings.get('massOutline');

            ctx.font = `bold ${fontSize}px Ubuntu`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            for (const [id, cell] of this.game.cells) {
                if (cell.isMe) continue;

                // Convert world to screen coordinates
                const screenX = (cell.x - this.game.camera.x) * this.game.camera.scale + this.overlay.width / 2;
                const screenY = (cell.y - this.game.camera.y) * this.game.camera.scale + this.overlay.height / 2;

                // Skip if off screen
                if (screenX < -50 || screenX > this.overlay.width + 50 ||
                    screenY < -50 || screenY > this.overlay.height + 50) {
                    continue;
                }

                const massText = massType === 'short' ?
                    this.formatMass(cell.mass) : cell.mass.toString();

                if (showOutline) {
                    ctx.strokeStyle = this.settings.get('massOutlineColor');
                    ctx.lineWidth = 3;
                    ctx.strokeText(massText, screenX, screenY);
                }

                ctx.fillStyle = this.settings.get('massColor');
                ctx.fillText(massText, screenX, screenY);
            }
        }

        formatMass(mass) {
            if (mass >= 1000000) return (mass / 1000000).toFixed(1) + 'M';
            if (mass >= 1000) return (mass / 1000).toFixed(1) + 'K';
            return mass.toString();
        }

        renderMinimap() {
            const ctx = this.overlayCtx;
            const size = this.settings.get('minimapSize');
            const opacity = this.settings.get('minimapOpacity');
            const padding = 10;
            const x = this.overlay.width - size - padding;
            const y = this.overlay.height - size - padding;

            // Background
            ctx.globalAlpha = opacity;
            ctx.fillStyle = '#111';
            ctx.fillRect(x, y, size, size);

            // Border
            ctx.strokeStyle = '#333';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, size, size);

            const mapWidth = this.game.mapBounds.maxX - this.game.mapBounds.minX;
            const mapHeight = this.game.mapBounds.maxY - this.game.mapBounds.minY;

            // Draw cells
            for (const [id, cell] of this.game.cells) {
                const cellX = x + ((cell.x - this.game.mapBounds.minX) / mapWidth) * size;
                const cellY = y + ((cell.y - this.game.mapBounds.minY) / mapHeight) * size;
                const cellSize = Math.max(2, cell.size / 50);

                ctx.beginPath();
                ctx.arc(cellX, cellY, cellSize, 0, Math.PI * 2);
                ctx.fillStyle = cell.isMe ? '#00FF00' : '#FF0000';
                ctx.fill();
            }

            ctx.globalAlpha = 1;
        }

        renderStats() {
            const ctx = this.overlayCtx;
            const padding = 10;

            ctx.font = 'bold 14px Ubuntu';
            ctx.fillStyle = '#FFF';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';

            const stats = [
                `Mass: ${this.game.myMass}`,
                `Cells: ${this.game.myCells.size}`,
                `Zoom: ${(this.game.camera.scale * 100).toFixed(0)}%`
            ];

            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(padding, padding, 120, stats.length * 20 + 10);

            ctx.fillStyle = '#FFF';
            stats.forEach((stat, i) => {
                ctx.fillText(stat, padding + 5, padding + 5 + i * 20);
            });
        }

        setZoom(level) {
            this.zoomLevel = Math.max(
                this.settings.get('minZoom'),
                Math.min(this.settings.get('maxZoom'), level)
            );
            this.settings.set('zoomLevel', this.zoomLevel);

            // Apply zoom to game canvas
            if (this.game.canvas) {
                this.game.canvas.style.transform = `scale(${this.zoomLevel})`;
                this.game.canvas.style.transformOrigin = 'center center';
            }
        }

        zoomIn() {
            this.setZoom(this.zoomLevel + this.settings.get('zoomStep'));
        }

        zoomOut() {
            this.setZoom(this.zoomLevel - this.settings.get('zoomStep'));
        }

        resetZoom() {
            this.setZoom(1);
        }
    }

    // =====================================================
    // MENU SYSTEM
    // =====================================================

    class Menu {
        constructor(settings, macros, renderer, inputManager) {
            this.settings = settings;
            this.macros = macros;
            this.renderer = renderer;
            this.inputManager = inputManager;
            this.isOpen = false;
            this.activeTab = 'general';
            this.listeningForKey = null;

            this.createMenu();
            this.bindEvents();
        }

        createMenu() {
            this.container = document.createElement('div');
            this.container.id = 'sigmally-mod-menu';
            this.container.innerHTML = this.getMenuHTML();
            document.body.appendChild(this.container);

            this.addStyles();
            this.updateUI();
        }

        getMenuHTML() {
            return `
                <div class="sm-menu-backdrop"></div>
                <div class="sm-menu-container">
                    <div class="sm-menu-header">
                        <h2>Sigmally Mod v${CONFIG.version}</h2>
                        <button class="sm-close-btn">&times;</button>
                    </div>

                    <div class="sm-menu-tabs">
                        <button class="sm-tab active" data-tab="general">General</button>
                        <button class="sm-tab" data-tab="keybinds">Touches</button>
                        <button class="sm-tab" data-tab="visual">Visuel</button>
                        <button class="sm-tab" data-tab="macros">Macros</button>
                    </div>

                    <div class="sm-menu-content">
                        <!-- General Tab -->
                        <div class="sm-tab-content active" data-tab="general">
                            <div class="sm-setting">
                                <label>
                                    <input type="checkbox" data-setting="showMass">
                                    Afficher la masse des joueurs
                                </label>
                            </div>
                            <div class="sm-setting">
                                <label>
                                    <input type="checkbox" data-setting="showNames">
                                    Afficher les noms
                                </label>
                            </div>
                            <div class="sm-setting">
                                <label>
                                    <input type="checkbox" data-setting="showSkins">
                                    Afficher les skins
                                </label>
                            </div>
                            <div class="sm-setting">
                                <label>
                                    <input type="checkbox" data-setting="showMinimap">
                                    Afficher la minimap
                                </label>
                            </div>
                            <div class="sm-setting">
                                <label>
                                    <input type="checkbox" data-setting="fpsBoost">
                                    Mode performance
                                </label>
                            </div>
                            <div class="sm-setting">
                                <label>Type d'affichage masse:</label>
                                <select data-setting="massType">
                                    <option value="mass">Nombre complet</option>
                                    <option value="short">Abrégé (K/M)</option>
                                </select>
                            </div>
                        </div>

                        <!-- Keybinds Tab -->
                        <div class="sm-tab-content" data-tab="keybinds">
                            <div class="sm-keybinds-list">
                                <div class="sm-keybind" data-key="feed">
                                    <span>Feed (W)</span>
                                    <button class="sm-key-btn" data-keypath="keys.feed">W</button>
                                </div>
                                <div class="sm-keybind" data-key="rapidFeed">
                                    <span>Feed Rapide</span>
                                    <button class="sm-key-btn" data-keypath="keys.rapidFeed">E</button>
                                </div>
                                <div class="sm-keybind" data-key="split">
                                    <span>Split</span>
                                    <button class="sm-key-btn" data-keypath="keys.split">SPACE</button>
                                </div>
                                <div class="sm-keybind" data-key="doubleSplit">
                                    <span>Double Split</span>
                                    <button class="sm-key-btn" data-keypath="keys.doubleSplit">Q</button>
                                </div>
                                <div class="sm-keybind" data-key="tripleSplit">
                                    <span>Triple Split</span>
                                    <button class="sm-key-btn" data-keypath="keys.tripleSplit">T</button>
                                </div>
                                <div class="sm-keybind" data-key="quadSplit">
                                    <span>Quad Split (16)</span>
                                    <button class="sm-key-btn" data-keypath="keys.quadSplit">R</button>
                                </div>
                                <div class="sm-keybind" data-key="freeze">
                                    <span>Freeze Mouse</span>
                                    <button class="sm-key-btn" data-keypath="keys.freeze">S</button>
                                </div>
                                <div class="sm-keybind" data-key="toggleMass">
                                    <span>Toggle Masse</span>
                                    <button class="sm-key-btn" data-keypath="keys.toggleMass">M</button>
                                </div>
                                <div class="sm-keybind" data-key="zoomIn">
                                    <span>Zoom +</span>
                                    <button class="sm-key-btn" data-keypath="keys.zoomIn">+</button>
                                </div>
                                <div class="sm-keybind" data-key="zoomOut">
                                    <span>Zoom -</span>
                                    <button class="sm-key-btn" data-keypath="keys.zoomOut">-</button>
                                </div>
                                <div class="sm-keybind" data-key="resetZoom">
                                    <span>Reset Zoom</span>
                                    <button class="sm-key-btn" data-keypath="keys.resetZoom">0</button>
                                </div>
                            </div>
                            <p class="sm-hint">Cliquez sur un bouton puis appuyez sur une touche pour la modifier</p>
                        </div>

                        <!-- Visual Tab -->
                        <div class="sm-tab-content" data-tab="visual">
                            <div class="sm-setting">
                                <label>Couleur de la masse:</label>
                                <input type="color" data-setting="massColor" value="#FFFFFF">
                            </div>
                            <div class="sm-setting">
                                <label>
                                    <input type="checkbox" data-setting="massOutline">
                                    Contour du texte
                                </label>
                            </div>
                            <div class="sm-setting">
                                <label>Couleur du contour:</label>
                                <input type="color" data-setting="massOutlineColor" value="#000000">
                            </div>
                            <div class="sm-setting">
                                <label>Taille police masse: <span id="fontSizeValue">16</span>px</label>
                                <input type="range" data-setting="massFontSize" min="10" max="30" value="16">
                            </div>
                            <div class="sm-setting">
                                <label>Taille minimap: <span id="minimapSizeValue">200</span>px</label>
                                <input type="range" data-setting="minimapSize" min="100" max="400" value="200">
                            </div>
                            <div class="sm-setting">
                                <label>Opacité minimap: <span id="minimapOpacityValue">80</span>%</label>
                                <input type="range" data-setting="minimapOpacity" min="0.1" max="1" step="0.1" value="0.8">
                            </div>
                        </div>

                        <!-- Macros Tab -->
                        <div class="sm-tab-content" data-tab="macros">
                            <div class="sm-setting">
                                <label>
                                    <input type="checkbox" data-setting="rapidFeedEnabled">
                                    Activer le Feed Rapide
                                </label>
                            </div>
                            <div class="sm-setting">
                                <label>Vitesse Feed Rapide: <span id="feedSpeedValue">50</span>ms</label>
                                <input type="range" data-setting="rapidFeedSpeed" min="10" max="200" value="50">
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
                    </div>

                    <div class="sm-menu-footer">
                        <button class="sm-reset-btn">Réinitialiser</button>
                        <span class="sm-footer-text">Appuyez sur ESC pour fermer</span>
                    </div>
                </div>
            `;
        }

        addStyles() {
            const opacity = this.settings.get('menuOpacity');

            if (typeof GM_addStyle !== 'undefined') {
                GM_addStyle(this.getCSS(opacity));
            } else {
                const style = document.createElement('style');
                style.textContent = this.getCSS(opacity);
                document.head.appendChild(style);
            }
        }

        getCSS(opacity) {
            return `
                #sigmally-mod-menu {
                    display: none;
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    z-index: 10000;
                    font-family: 'Ubuntu', 'Segoe UI', sans-serif;
                }

                #sigmally-mod-menu.open {
                    display: block;
                }

                .sm-menu-backdrop {
                    position: absolute;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.7);
                }

                .sm-menu-container {
                    position: absolute;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 500px;
                    max-width: 90%;
                    max-height: 80vh;
                    background: rgba(30, 30, 40, ${opacity});
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.5);
                    overflow: hidden;
                    display: flex;
                    flex-direction: column;
                }

                .sm-menu-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 15px 20px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    color: white;
                }

                .sm-menu-header h2 {
                    margin: 0;
                    font-size: 18px;
                    font-weight: 600;
                }

                .sm-close-btn {
                    background: none;
                    border: none;
                    color: white;
                    font-size: 28px;
                    cursor: pointer;
                    padding: 0 5px;
                    line-height: 1;
                    opacity: 0.8;
                    transition: opacity 0.2s;
                }

                .sm-close-btn:hover {
                    opacity: 1;
                }

                .sm-menu-tabs {
                    display: flex;
                    background: rgba(0, 0, 0, 0.2);
                    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
                }

                .sm-tab {
                    flex: 1;
                    padding: 12px;
                    background: none;
                    border: none;
                    color: rgba(255, 255, 255, 0.6);
                    font-size: 14px;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .sm-tab:hover {
                    background: rgba(255, 255, 255, 0.05);
                    color: rgba(255, 255, 255, 0.8);
                }

                .sm-tab.active {
                    color: white;
                    background: rgba(255, 255, 255, 0.1);
                    border-bottom: 2px solid #667eea;
                }

                .sm-menu-content {
                    flex: 1;
                    overflow-y: auto;
                    padding: 20px;
                }

                .sm-tab-content {
                    display: none;
                }

                .sm-tab-content.active {
                    display: block;
                }

                .sm-setting {
                    margin-bottom: 15px;
                }

                .sm-setting label {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                    color: rgba(255, 255, 255, 0.9);
                    font-size: 14px;
                    cursor: pointer;
                }

                .sm-setting input[type="checkbox"] {
                    width: 18px;
                    height: 18px;
                    cursor: pointer;
                    accent-color: #667eea;
                }

                .sm-setting input[type="range"] {
                    width: 100%;
                    margin-top: 8px;
                    accent-color: #667eea;
                }

                .sm-setting input[type="color"] {
                    width: 50px;
                    height: 30px;
                    border: none;
                    border-radius: 4px;
                    cursor: pointer;
                }

                .sm-setting select {
                    width: 100%;
                    padding: 8px;
                    margin-top: 8px;
                    background: rgba(255, 255, 255, 0.1);
                    border: 1px solid rgba(255, 255, 255, 0.2);
                    border-radius: 4px;
                    color: white;
                    font-size: 14px;
                }

                .sm-setting select option {
                    background: #2a2a3a;
                }

                .sm-keybinds-list {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                }

                .sm-keybind {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 10px 15px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 6px;
                }

                .sm-keybind span {
                    color: rgba(255, 255, 255, 0.9);
                    font-size: 14px;
                }

                .sm-key-btn {
                    min-width: 80px;
                    padding: 8px 15px;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                    border: none;
                    border-radius: 4px;
                    color: white;
                    font-size: 12px;
                    font-weight: 600;
                    text-transform: uppercase;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .sm-key-btn:hover {
                    transform: scale(1.05);
                }

                .sm-key-btn.listening {
                    background: #e74c3c;
                    animation: pulse 1s infinite;
                }

                @keyframes pulse {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.7; }
                }

                .sm-hint {
                    margin-top: 15px;
                    color: rgba(255, 255, 255, 0.5);
                    font-size: 12px;
                    font-style: italic;
                    text-align: center;
                }

                .sm-macro-info {
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 8px;
                    padding: 15px;
                    margin-top: 20px;
                }

                .sm-macro-info h4 {
                    margin: 0 0 10px 0;
                    color: #667eea;
                    font-size: 14px;
                }

                .sm-macro-info ul {
                    margin: 0;
                    padding-left: 20px;
                }

                .sm-macro-info li {
                    color: rgba(255, 255, 255, 0.8);
                    font-size: 13px;
                    margin-bottom: 5px;
                }

                .sm-menu-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 15px 20px;
                    background: rgba(0, 0, 0, 0.2);
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                }

                .sm-reset-btn {
                    padding: 8px 20px;
                    background: #e74c3c;
                    border: none;
                    border-radius: 4px;
                    color: white;
                    font-size: 13px;
                    cursor: pointer;
                    transition: background 0.2s;
                }

                .sm-reset-btn:hover {
                    background: #c0392b;
                }

                .sm-footer-text {
                    color: rgba(255, 255, 255, 0.5);
                    font-size: 12px;
                }

                /* Scrollbar */
                .sm-menu-content::-webkit-scrollbar {
                    width: 8px;
                }

                .sm-menu-content::-webkit-scrollbar-track {
                    background: rgba(0, 0, 0, 0.2);
                }

                .sm-menu-content::-webkit-scrollbar-thumb {
                    background: rgba(255, 255, 255, 0.2);
                    border-radius: 4px;
                }

                .sm-menu-content::-webkit-scrollbar-thumb:hover {
                    background: rgba(255, 255, 255, 0.3);
                }
            `;
        }

        bindEvents() {
            // Tab switching
            this.container.querySelectorAll('.sm-tab').forEach(tab => {
                tab.addEventListener('click', () => this.switchTab(tab.dataset.tab));
            });

            // Close button
            this.container.querySelector('.sm-close-btn').addEventListener('click', () => this.close());

            // Backdrop click
            this.container.querySelector('.sm-menu-backdrop').addEventListener('click', () => this.close());

            // Reset button
            this.container.querySelector('.sm-reset-btn').addEventListener('click', () => {
                if (confirm('Réinitialiser tous les paramètres ?')) {
                    this.settings.reset();
                    this.updateUI();
                }
            });

            // Settings bindings
            this.bindSettings();

            // Keybind buttons
            this.bindKeybindButtons();
        }

        bindSettings() {
            // Checkboxes
            this.container.querySelectorAll('input[type="checkbox"][data-setting]').forEach(input => {
                input.addEventListener('change', () => {
                    this.settings.set(input.dataset.setting, input.checked);
                });
            });

            // Selects
            this.container.querySelectorAll('select[data-setting]').forEach(select => {
                select.addEventListener('change', () => {
                    this.settings.set(select.dataset.setting, select.value);
                });
            });

            // Colors
            this.container.querySelectorAll('input[type="color"][data-setting]').forEach(input => {
                input.addEventListener('change', () => {
                    this.settings.set(input.dataset.setting, input.value);
                });
            });

            // Ranges
            this.container.querySelectorAll('input[type="range"][data-setting]').forEach(input => {
                input.addEventListener('input', () => {
                    const value = parseFloat(input.value);
                    this.settings.set(input.dataset.setting, value);
                    this.updateRangeDisplay(input);
                });
            });
        }

        bindKeybindButtons() {
            this.container.querySelectorAll('.sm-key-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    if (this.listeningForKey) {
                        this.listeningForKey.classList.remove('listening');
                    }

                    this.listeningForKey = btn;
                    btn.classList.add('listening');
                    btn.textContent = '...';
                });
            });

            document.addEventListener('keydown', (e) => {
                if (this.listeningForKey) {
                    e.preventDefault();
                    e.stopPropagation();

                    const keyPath = this.listeningForKey.dataset.keypath;
                    const keyDisplay = this.getKeyDisplay(e);
                    const keyValue = e.key === ' ' ? ' ' : e.key.toLowerCase();

                    this.settings.set(keyPath, keyValue);
                    this.listeningForKey.textContent = keyDisplay;
                    this.listeningForKey.classList.remove('listening');
                    this.listeningForKey = null;

                    // Update input manager
                    if (this.inputManager) {
                        this.inputManager.updateKeyBindings();
                    }
                }
            });
        }

        getKeyDisplay(e) {
            const specialKeys = {
                ' ': 'SPACE',
                'Escape': 'ESC',
                'ArrowUp': '↑',
                'ArrowDown': '↓',
                'ArrowLeft': '←',
                'ArrowRight': '→',
                'Control': 'CTRL',
                'Shift': 'SHIFT',
                'Alt': 'ALT'
            };
            return specialKeys[e.key] || e.key.toUpperCase();
        }

        updateUI() {
            // Update checkboxes
            this.container.querySelectorAll('input[type="checkbox"][data-setting]').forEach(input => {
                input.checked = this.settings.get(input.dataset.setting);
            });

            // Update selects
            this.container.querySelectorAll('select[data-setting]').forEach(select => {
                select.value = this.settings.get(select.dataset.setting);
            });

            // Update colors
            this.container.querySelectorAll('input[type="color"][data-setting]').forEach(input => {
                input.value = this.settings.get(input.dataset.setting);
            });

            // Update ranges
            this.container.querySelectorAll('input[type="range"][data-setting]').forEach(input => {
                input.value = this.settings.get(input.dataset.setting);
                this.updateRangeDisplay(input);
            });

            // Update keybind buttons
            this.container.querySelectorAll('.sm-key-btn').forEach(btn => {
                const keyPath = btn.dataset.keypath;
                const value = this.settings.get(keyPath);
                btn.textContent = this.getKeyDisplayFromValue(value);
            });
        }

        getKeyDisplayFromValue(value) {
            const specialKeys = {
                ' ': 'SPACE',
                'escape': 'ESC'
            };
            return specialKeys[value] || value.toUpperCase();
        }

        updateRangeDisplay(input) {
            const setting = input.dataset.setting;
            const value = input.value;

            const displayMap = {
                'massFontSize': 'fontSizeValue',
                'minimapSize': 'minimapSizeValue',
                'minimapOpacity': 'minimapOpacityValue',
                'rapidFeedSpeed': 'feedSpeedValue'
            };

            const displayId = displayMap[setting];
            if (displayId) {
                const display = this.container.querySelector(`#${displayId}`);
                if (display) {
                    if (setting === 'minimapOpacity') {
                        display.textContent = Math.round(value * 100);
                    } else {
                        display.textContent = value;
                    }
                }
            }
        }

        switchTab(tabName) {
            this.activeTab = tabName;

            this.container.querySelectorAll('.sm-tab').forEach(tab => {
                tab.classList.toggle('active', tab.dataset.tab === tabName);
            });

            this.container.querySelectorAll('.sm-tab-content').forEach(content => {
                content.classList.toggle('active', content.dataset.tab === tabName);
            });
        }

        toggle() {
            this.isOpen ? this.close() : this.open();
        }

        open() {
            this.isOpen = true;
            this.container.classList.add('open');
            this.updateUI();
        }

        close() {
            this.isOpen = false;
            this.container.classList.remove('open');

            if (this.listeningForKey) {
                this.listeningForKey.classList.remove('listening');
                this.updateUI();
                this.listeningForKey = null;
            }
        }
    }

    // =====================================================
    // INPUT MANAGER
    // =====================================================

    class InputManager {
        constructor(game, settings, macros, renderer) {
            this.game = game;
            this.settings = settings;
            this.macros = macros;
            this.renderer = renderer;
            this.menu = null;
            this.keysPressed = new Set();

            this.updateKeyBindings();
            this.bindEvents();
        }

        setMenu(menu) {
            this.menu = menu;
        }

        updateKeyBindings() {
            this.keyBindings = this.settings.get('keys');
        }

        bindEvents() {
            document.addEventListener('keydown', (e) => this.handleKeyDown(e));
            document.addEventListener('keyup', (e) => this.handleKeyUp(e));

            // Mouse tracking
            document.addEventListener('mousemove', (e) => {
                this.game.mouseX = e.clientX;
                this.game.mouseY = e.clientY;
            });
        }

        handleKeyDown(e) {
            // Skip if in input field
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

            // Skip if listening for keybind
            if (this.menu && this.menu.listeningForKey) return;

            const key = e.key.toLowerCase();

            // Toggle menu with Escape
            if (e.key === 'Escape') {
                e.preventDefault();
                if (this.menu) {
                    this.menu.toggle();
                }
                return;
            }

            // Skip other actions if menu is open
            if (this.menu && this.menu.isOpen) return;

            // Prevent duplicate key events
            if (this.keysPressed.has(key)) return;
            this.keysPressed.add(key);

            // Handle key actions
            if (key === this.keyBindings.feed || e.key === this.keyBindings.feed) {
                this.game.feed();
            }

            if ((key === this.keyBindings.rapidFeed || e.key === this.keyBindings.rapidFeed) &&
                this.settings.get('rapidFeedEnabled')) {
                this.macros.startRapidFeed();
            }

            if (e.key === this.keyBindings.split || key === this.keyBindings.split) {
                this.game.split();
            }

            if (key === this.keyBindings.doubleSplit) {
                this.macros.doubleSplit();
            }

            if (key === this.keyBindings.tripleSplit) {
                this.macros.tripleSplit();
            }

            if (key === this.keyBindings.quadSplit) {
                this.macros.quadSplit();
            }

            if (key === this.keyBindings.freeze) {
                this.toggleFreeze();
            }

            if (key === this.keyBindings.toggleMass) {
                const current = this.settings.get('showMass');
                this.settings.set('showMass', !current);
            }

            if (key === this.keyBindings.zoomIn || e.key === this.keyBindings.zoomIn) {
                this.renderer.zoomIn();
            }

            if (key === this.keyBindings.zoomOut || e.key === this.keyBindings.zoomOut) {
                this.renderer.zoomOut();
            }

            if (key === this.keyBindings.resetZoom) {
                this.renderer.resetZoom();
            }
        }

        handleKeyUp(e) {
            const key = e.key.toLowerCase();
            this.keysPressed.delete(key);

            // Stop rapid feed when key released
            if (key === this.keyBindings.rapidFeed || e.key === this.keyBindings.rapidFeed) {
                this.macros.stopRapidFeed();
            }
        }

        toggleFreeze() {
            this.game.frozen = !this.game.frozen;

            if (this.game.frozen) {
                this.game.frozenPos = {
                    x: this.game.mouseX,
                    y: this.game.mouseY
                };
            }
        }
    }

    // =====================================================
    // MAIN APPLICATION
    // =====================================================

    class SigmallyMod {
        constructor() {
            this.settings = new Settings();
            this.game = new GameInterface();
            this.macros = new MacroManager(this.game, this.settings);
            this.renderer = new Renderer(this.game, this.settings);
            this.inputManager = new InputManager(
                this.game,
                this.settings,
                this.macros,
                this.renderer
            );

            // Wait for DOM to initialize menu
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.initMenu());
            } else {
                this.initMenu();
            }

            console.log(`%c[Sigmally Mod] v${CONFIG.version} loaded!`,
                'color: #667eea; font-weight: bold; font-size: 14px;');
        }

        initMenu() {
            this.menu = new Menu(
                this.settings,
                this.macros,
                this.renderer,
                this.inputManager
            );
            this.inputManager.setMenu(this.menu);
        }
    }

    // =====================================================
    // INITIALIZATION
    // =====================================================

    // Wait for page to be ready
    const init = () => {
        try {
            window.SigmallyMod = new SigmallyMod();
        } catch (e) {
            console.error('[Sigmally Mod] Initialization error:', e);
        }
    };

    if (document.readyState === 'complete') {
        init();
    } else {
        window.addEventListener('load', init);
    }

})();
