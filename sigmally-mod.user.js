// ==UserScript==
// @name         Sigmally Mod - Ultra Feed & Mass Display
// @namespace    https://github.com/sigmally-mod
// @version      2.1.0
// @description  Script avancé pour one.sigmally.com - Feed ultra-rapide (0.5ms), affichage masse, macros souris
// @author       SigmallyMod
// @match        https://one.sigmally.com/*
// @match        https://sigmally.com/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-start
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    const CONFIG = {
        version: '2.1.0',
        storageKey: 'sigmally_mod_v2',
        defaultSettings: {
            keys: {
                feed: 'w',
                rapidFeed: 'e',
                split: ' ',
                doubleSplit: 'q',
                tripleSplit: 't',
                quadSplit: 'r',
                freeze: 's',
                toggleMass: 'm',
                zoomIn: '=',
                zoomOut: '-',
                resetZoom: '0'
            },
            mouse: {
                rapidFeed: null,
                split: null,
                doubleSplit: 1,
                tripleSplit: null,
                quadSplit: 2,
                feed: null
            },
            rapidFeedSpeed: 25,
            rapidFeedEnabled: true,
            showMass: true,
            massType: 'mass',
            massColor: '#FFFFFF',
            massOutline: true,
            massOutlineColor: '#000000',
            massFontSize: 16,
            showMinimap: true,
            minimapSize: 200,
            minimapOpacity: 0.8,
            zoomLevel: 1,
            useKeySimulation: true
        }
    };

    // Storage
    const Storage = {
        get(key, def = null) {
            try {
                if (typeof GM_getValue !== 'undefined') {
                    const v = GM_getValue(key, null);
                    return v !== null ? v : def;
                }
                const s = localStorage.getItem(key);
                return s ? JSON.parse(s) : def;
            } catch { return def; }
        },
        set(key, val) {
            try {
                if (typeof GM_setValue !== 'undefined') GM_setValue(key, val);
                else localStorage.setItem(key, JSON.stringify(val));
            } catch {}
        }
    };

    // Settings
    class Settings {
        constructor() {
            this.data = this.load();
        }
        load() {
            const stored = Storage.get(CONFIG.storageKey);
            return this.merge(CONFIG.defaultSettings, stored || {});
        }
        merge(def, stored) {
            const r = { ...def };
            for (const k in stored) {
                if (typeof stored[k] === 'object' && stored[k] && !Array.isArray(stored[k])) {
                    r[k] = this.merge(def[k] || {}, stored[k]);
                } else r[k] = stored[k];
            }
            return r;
        }
        save() { Storage.set(CONFIG.storageKey, this.data); }
        get(p) { return p.split('.').reduce((o, k) => o?.[k], this.data); }
        set(p, v) {
            const keys = p.split('.'), last = keys.pop();
            const t = keys.reduce((o, k) => (o[k] = o[k] || {}, o[k]), this.data);
            t[last] = v;
            this.save();
        }
        reset() { this.data = JSON.parse(JSON.stringify(CONFIG.defaultSettings)); this.save(); }
    }

    // Game Interface
    class GameInterface {
        constructor() {
            this.ws = null;
            this.canvas = null;
            this.camera = { x: 0, y: 0, scale: 1 };
            this.cells = new Map();
            this.myCells = new Set();
            this.myMass = 0;
            this.mouseX = 0;
            this.mouseY = 0;
            this.frozen = false;
            this.mapBounds = { minX: -7071, minY: -7071, maxX: 7071, maxY: 7071 };
            this.encryptionKey = null;
            this.decryptionKey = null;

            this.hookWebSocket();
            this.waitForCanvas();
        }

        hookWebSocket() {
            const self = this;
            const OrigWS = window.WebSocket;

            window.WebSocket = function(url, proto) {
                const ws = proto ? new OrigWS(url, proto) : new OrigWS(url);
                if (url.includes('sigmally')) {
                    self.ws = ws;
                    self.setupWS(ws);
                    console.log('[Mod] WebSocket connecté');
                }
                return ws;
            };
            window.WebSocket.prototype = OrigWS.prototype;
            Object.assign(window.WebSocket, OrigWS);
        }

        setupWS(ws) {
            const origSend = ws.send.bind(ws);

            // Intercept outgoing messages to learn the protocol
            ws.send = (data) => {
                origSend(data);
            };

            ws.addEventListener('message', (e) => this.parseMessage(e.data));
            ws.addEventListener('close', () => {
                this.myCells.clear();
                this.cells.clear();
                this.myMass = 0;
                console.log('[Mod] WebSocket fermé');
            });
        }

        waitForCanvas() {
            const check = () => {
                this.canvas = document.querySelector('canvas');
                if (this.canvas) {
                    this.hookCanvas();
                } else {
                    requestAnimationFrame(check);
                }
            };
            check();
        }

        hookCanvas() {
            const ctx = this.canvas.getContext('2d');
            if (!ctx) return;

            const self = this;
            const origTranslate = ctx.translate.bind(ctx);
            const origScale = ctx.scale.bind(ctx);

            ctx.translate = function(x, y) {
                self.camera.x = -x;
                self.camera.y = -y;
                return origTranslate(x, y);
            };
            ctx.scale = function(x, y) {
                self.camera.scale = x;
                return origScale(x, y);
            };
        }

        parseMessage(data) {
            if (!(data instanceof ArrayBuffer)) return;
            const view = new DataView(data);
            if (view.byteLength < 1) return;

            const op = view.getUint8(0);
            try {
                if (op === 16) this.parseCellUpdate(view);
                else if (op === 32 && view.byteLength >= 5) {
                    this.myCells.add(view.getUint32(1, true));
                }
                else if (op === 64) this.parseMapBounds(view);
            } catch {}
        }

        parseCellUpdate(view) {
            let off = 1;
            if (off + 2 > view.byteLength) return;

            const eatCount = view.getUint16(off, true);
            off += 2 + eatCount * 8;

            while (off + 4 <= view.byteLength) {
                const id = view.getUint32(off, true);
                off += 4;
                if (id === 0) break;
                if (off + 10 > view.byteLength) break;

                const x = view.getInt32(off, true); off += 4;
                const y = view.getInt32(off, true); off += 4;
                const size = view.getUint16(off, true); off += 2;
                const flags = view.getUint8(off); off += 1;

                if (flags & 2) off += 3;
                if (flags & 4) { while (off < view.byteLength && view.getUint8(off)) off++; off++; }
                if (flags & 8) { while (off < view.byteLength && view.getUint8(off)) off++; off++; }

                this.cells.set(id, {
                    id, x, y, size,
                    mass: Math.floor(size * size / 100),
                    isMe: this.myCells.has(id)
                });
            }

            if (off + 2 <= view.byteLength) {
                const dc = view.getUint16(off, true); off += 2;
                for (let i = 0; i < dc && off + 4 <= view.byteLength; i++) {
                    const id = view.getUint32(off, true); off += 4;
                    this.cells.delete(id);
                    this.myCells.delete(id);
                }
            }

            this.myMass = 0;
            for (const id of this.myCells) {
                const c = this.cells.get(id);
                if (c) this.myMass += c.mass;
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

        // Actions via key simulation
        simulateKey(key, type = 'keydown') {
            const target = this.canvas || document.body;
            const code = key === ' ' ? 32 : key.toUpperCase().charCodeAt(0);
            const event = new KeyboardEvent(type, {
                key, code: key === ' ' ? 'Space' : 'Key' + key.toUpperCase(),
                keyCode: code, which: code, charCode: code,
                bubbles: true, cancelable: true, view: window
            });
            target.dispatchEvent(event);
            document.dispatchEvent(event);
            window.dispatchEvent(event);
        }

        keyPress(key) {
            this.simulateKey(key, 'keydown');
            setTimeout(() => this.simulateKey(key, 'keyup'), 5);
        }

        // Actions via WebSocket
        sendWS(buf) {
            if (this.ws?.readyState === 1) this.ws.send(buf);
        }

        feedWS() {
            const buf = new ArrayBuffer(1);
            new DataView(buf).setUint8(0, 21);
            this.sendWS(buf);
        }

        splitWS() {
            const buf = new ArrayBuffer(1);
            new DataView(buf).setUint8(0, 17);
            this.sendWS(buf);
        }

        // High-level actions
        feed(useKeys = true) {
            if (useKeys) this.keyPress('w');
            else this.feedWS();
        }

        split(useKeys = true) {
            if (useKeys) this.keyPress(' ');
            else this.splitWS();
        }
    }

    // Macro Manager
    class MacroManager {
        constructor(game, settings) {
            this.game = game;
            this.settings = settings;
            this.feedInterval = null;
            this.feedLoop = null;
            this.isFeeding = false;
        }

        get useKeys() { return this.settings.get('useKeySimulation'); }

        feed() { this.game.feed(this.useKeys); }
        split() { this.game.split(this.useKeys); }

        startRapidFeed() {
            if (this.isFeeding) return;
            this.isFeeding = true;

            const speed = Math.max(0.5, this.settings.get('rapidFeedSpeed'));
            this.feed();

            if (speed < 4) {
                // Ultra-fast mode using tight loop
                let last = performance.now();
                const loop = () => {
                    if (!this.isFeeding) return;
                    const now = performance.now();
                    if (now - last >= speed) {
                        this.feed();
                        last = now;
                    }
                    // Use microtask for maximum speed
                    if (speed < 1) Promise.resolve().then(loop);
                    else this.feedLoop = setTimeout(loop, 0);
                };
                loop();
            } else {
                this.feedInterval = setInterval(() => this.feed(), speed);
            }
        }

        stopRapidFeed() {
            this.isFeeding = false;
            if (this.feedInterval) { clearInterval(this.feedInterval); this.feedInterval = null; }
            if (this.feedLoop) { clearTimeout(this.feedLoop); this.feedLoop = null; }
        }

        doubleSplit() {
            this.split();
            setTimeout(() => this.split(), 40);
        }

        tripleSplit() {
            this.split();
            setTimeout(() => this.split(), 40);
            setTimeout(() => this.split(), 80);
        }

        quadSplit() {
            this.split();
            setTimeout(() => this.split(), 40);
            setTimeout(() => this.split(), 80);
            setTimeout(() => this.split(), 120);
        }
    }

    // Renderer
    class Renderer {
        constructor(game, settings) {
            this.game = game;
            this.settings = settings;
            this.overlay = null;
            this.ctx = null;
            this.fps = 0;
            this.frames = 0;
            this.lastFps = performance.now();

            this.init();
        }

        init() {
            const setup = () => {
                if (document.body) {
                    this.createOverlay();
                    this.loop();
                } else requestAnimationFrame(setup);
            };
            setup();
        }

        createOverlay() {
            this.overlay = document.createElement('canvas');
            this.overlay.id = 'mod-overlay';
            this.overlay.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:9999';
            document.body.appendChild(this.overlay);
            this.ctx = this.overlay.getContext('2d');
            this.resize();
            window.addEventListener('resize', () => this.resize());
        }

        resize() {
            if (this.overlay) {
                this.overlay.width = window.innerWidth;
                this.overlay.height = window.innerHeight;
            }
        }

        loop() {
            this.render();
            requestAnimationFrame(() => this.loop());
        }

        render() {
            if (!this.ctx) return;
            this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);

            // FPS
            this.frames++;
            const now = performance.now();
            if (now - this.lastFps >= 1000) {
                this.fps = this.frames;
                this.frames = 0;
                this.lastFps = now;
            }

            if (this.settings.get('showMass')) this.renderMass();
            if (this.settings.get('showMinimap')) this.renderMinimap();
            this.renderStats();
        }

        renderMass() {
            const ctx = this.ctx;
            const fontSize = this.settings.get('massFontSize');
            const type = this.settings.get('massType');
            const outline = this.settings.get('massOutline');

            ctx.font = `bold ${fontSize}px Ubuntu,sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            for (const [, cell] of this.game.cells) {
                if (cell.isMe || cell.mass < 10) continue;

                const sx = (cell.x - this.game.camera.x) * this.game.camera.scale + this.overlay.width / 2;
                const sy = (cell.y - this.game.camera.y) * this.game.camera.scale + this.overlay.height / 2;

                if (sx < -100 || sx > this.overlay.width + 100 || sy < -100 || sy > this.overlay.height + 100) continue;

                const text = type === 'short' ? this.fmtMass(cell.mass) : cell.mass.toString();

                if (outline) {
                    ctx.strokeStyle = this.settings.get('massOutlineColor');
                    ctx.lineWidth = 3;
                    ctx.strokeText(text, sx, sy);
                }
                ctx.fillStyle = this.settings.get('massColor');
                ctx.fillText(text, sx, sy);
            }
        }

        fmtMass(m) {
            if (m >= 1e6) return (m / 1e6).toFixed(1) + 'M';
            if (m >= 1e3) return (m / 1e3).toFixed(1) + 'K';
            return m.toString();
        }

        renderMinimap() {
            const ctx = this.ctx;
            const size = this.settings.get('minimapSize');
            const opacity = this.settings.get('minimapOpacity');
            const pad = 10;
            const x = this.overlay.width - size - pad;
            const y = this.overlay.height - size - pad;

            ctx.globalAlpha = opacity;
            ctx.fillStyle = '#111';
            ctx.fillRect(x, y, size, size);
            ctx.strokeStyle = '#444';
            ctx.lineWidth = 2;
            ctx.strokeRect(x, y, size, size);

            // Grid
            ctx.strokeStyle = '#222';
            ctx.lineWidth = 1;
            for (let i = 1; i < 5; i++) {
                const p = i * size / 5;
                ctx.beginPath();
                ctx.moveTo(x + p, y);
                ctx.lineTo(x + p, y + size);
                ctx.moveTo(x, y + p);
                ctx.lineTo(x + size, y + p);
                ctx.stroke();
            }

            const mw = this.game.mapBounds.maxX - this.game.mapBounds.minX;
            const mh = this.game.mapBounds.maxY - this.game.mapBounds.minY;

            for (const [, cell] of this.game.cells) {
                const cx = x + ((cell.x - this.game.mapBounds.minX) / mw) * size;
                const cy = y + ((cell.y - this.game.mapBounds.minY) / mh) * size;
                const cs = Math.max(2, Math.min(8, cell.size / 100));

                ctx.beginPath();
                ctx.arc(cx, cy, cs, 0, Math.PI * 2);
                ctx.fillStyle = cell.isMe ? '#0f0' : '#f44';
                ctx.fill();
            }

            ctx.globalAlpha = 1;
        }

        renderStats() {
            const ctx = this.ctx;
            ctx.font = 'bold 14px Ubuntu,sans-serif';
            ctx.textAlign = 'left';
            ctx.textBaseline = 'top';

            const stats = [
                `Mass: ${this.fmtMass(this.game.myMass)}`,
                `Cells: ${this.game.myCells.size}/16`,
                `FPS: ${this.fps}`
            ];

            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(10, 10, 120, stats.length * 20 + 10);
            ctx.fillStyle = '#fff';
            stats.forEach((s, i) => ctx.fillText(s, 15, 15 + i * 20));

            if (this.game.frozen) {
                ctx.fillStyle = '#f66';
                ctx.font = 'bold 16px Ubuntu';
                ctx.textAlign = 'center';
                ctx.fillText('FROZEN', this.overlay.width / 2, 30);
            }
        }
    }

    // Input Manager
    class InputManager {
        constructor(game, settings, macros) {
            this.game = game;
            this.settings = settings;
            this.macros = macros;
            this.menu = null;
            this.keysDown = new Set();
            this.mouseDown = new Set();

            this.bind();
        }

        setMenu(m) { this.menu = m; }

        bind() {
            document.addEventListener('keydown', (e) => this.onKeyDown(e), true);
            document.addEventListener('keyup', (e) => this.onKeyUp(e), true);
            document.addEventListener('mousedown', (e) => this.onMouseDown(e), true);
            document.addEventListener('mouseup', (e) => this.onMouseUp(e), true);
            document.addEventListener('contextmenu', (e) => this.onContext(e));
            document.addEventListener('mousemove', (e) => {
                if (!this.game.frozen) {
                    this.game.mouseX = e.clientX;
                    this.game.mouseY = e.clientY;
                }
            });
        }

        onKeyDown(e) {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
            if (this.menu?.listening) return;

            const key = e.key.toLowerCase();

            if (e.key === 'Escape') {
                e.preventDefault();
                this.menu?.toggle();
                return;
            }

            if (this.menu?.isOpen) return;
            if (this.keysDown.has(key)) return;
            this.keysDown.add(key);

            const keys = this.settings.get('keys');

            if (this.match(key, e.key, keys.feed)) this.macros.feed();
            if (this.match(key, e.key, keys.rapidFeed) && this.settings.get('rapidFeedEnabled')) this.macros.startRapidFeed();
            if (this.match(key, e.key, keys.split)) this.macros.split();
            if (this.match(key, e.key, keys.doubleSplit)) this.macros.doubleSplit();
            if (this.match(key, e.key, keys.tripleSplit)) this.macros.tripleSplit();
            if (this.match(key, e.key, keys.quadSplit)) this.macros.quadSplit();
            if (this.match(key, e.key, keys.freeze)) {
                this.game.frozen = !this.game.frozen;
            }
            if (this.match(key, e.key, keys.toggleMass)) {
                this.settings.set('showMass', !this.settings.get('showMass'));
            }
        }

        onKeyUp(e) {
            const key = e.key.toLowerCase();
            this.keysDown.delete(key);

            const keys = this.settings.get('keys');
            if (this.match(key, e.key, keys.rapidFeed)) this.macros.stopRapidFeed();
        }

        onMouseDown(e) {
            if (this.menu?.isOpen) return;
            const btn = e.button;
            if (this.mouseDown.has(btn)) return;
            this.mouseDown.add(btn);

            const mouse = this.settings.get('mouse');

            if (mouse.rapidFeed === btn && this.settings.get('rapidFeedEnabled')) {
                e.preventDefault();
                this.macros.startRapidFeed();
            }
            if (mouse.feed === btn) { e.preventDefault(); this.macros.feed(); }
            if (mouse.split === btn) { e.preventDefault(); this.macros.split(); }
            if (mouse.doubleSplit === btn) { e.preventDefault(); this.macros.doubleSplit(); }
            if (mouse.tripleSplit === btn) { e.preventDefault(); this.macros.tripleSplit(); }
            if (mouse.quadSplit === btn) { e.preventDefault(); this.macros.quadSplit(); }
        }

        onMouseUp(e) {
            const btn = e.button;
            this.mouseDown.delete(btn);

            const mouse = this.settings.get('mouse');
            if (mouse.rapidFeed === btn) this.macros.stopRapidFeed();
        }

        onContext(e) {
            const mouse = this.settings.get('mouse');
            if ([mouse.rapidFeed, mouse.feed, mouse.split, mouse.doubleSplit, mouse.tripleSplit, mouse.quadSplit].includes(2)) {
                e.preventDefault();
            }
        }

        match(lower, orig, bind) {
            return lower === bind?.toLowerCase() || orig === bind;
        }
    }

    // Menu
    class Menu {
        constructor(settings, macros, input) {
            this.settings = settings;
            this.macros = macros;
            this.input = input;
            this.isOpen = false;
            this.listening = null;
            this.listenType = null;

            this.init();
        }

        init() {
            const setup = () => {
                if (document.body) this.create();
                else requestAnimationFrame(setup);
            };
            setup();
        }

        create() {
            this.el = document.createElement('div');
            this.el.id = 'mod-menu';
            this.el.innerHTML = this.html();
            document.body.appendChild(this.el);
            this.style();
            this.bind();
            this.update();
        }

        html() {
            return `
            <div class="mm-bg"></div>
            <div class="mm-box">
                <div class="mm-head">
                    <h2>Sigmally Mod v${CONFIG.version}</h2>
                    <button class="mm-close">&times;</button>
                </div>
                <div class="mm-tabs">
                    <button class="mm-tab active" data-t="general">General</button>
                    <button class="mm-tab" data-t="keys">Touches</button>
                    <button class="mm-tab" data-t="mouse">Souris</button>
                    <button class="mm-tab" data-t="macros">Macros</button>
                </div>
                <div class="mm-content">
                    <div class="mm-pane active" data-t="general">
                        <label><input type="checkbox" data-s="showMass"> Afficher masse</label>
                        <label><input type="checkbox" data-s="showMinimap"> Minimap</label>
                        <label>Type masse: <select data-s="massType">
                            <option value="mass">Complet</option>
                            <option value="short">Abrégé</option>
                        </select></label>
                        <label><input type="checkbox" data-s="useKeySimulation"> Simulation touches (désactiver si ça ne marche pas)</label>
                        <label>Couleur masse: <input type="color" data-s="massColor"></label>
                        <label><input type="checkbox" data-s="massOutline"> Contour texte</label>
                        <label>Taille police: <span id="fs">${this.settings.get('massFontSize')}</span>px
                            <input type="range" data-s="massFontSize" min="10" max="30">
                        </label>
                    </div>
                    <div class="mm-pane" data-t="keys">
                        ${this.keyBinds().map(k => `<div class="mm-bind"><span>${k.label}</span><button class="mm-key" data-k="${k.path}">${this.keyDisp(this.settings.get(k.path))}</button></div>`).join('')}
                        <p class="mm-hint">Cliquez puis appuyez sur une touche</p>
                    </div>
                    <div class="mm-pane" data-t="mouse">
                        ${this.mouseBinds().map(m => `<div class="mm-bind"><span>${m.label}</span><button class="mm-mouse" data-m="${m.path}">${this.mouseDisp(this.settings.get(m.path))}</button></div>`).join('')}
                        <p class="mm-hint">Cliquez puis utilisez un bouton souris. Clic droit pour désactiver.</p>
                        <p class="mm-legend">0=Gauche | 1=Molette | 2=Droit | 3=Retour | 4=Avancer</p>
                    </div>
                    <div class="mm-pane" data-t="macros">
                        <label><input type="checkbox" data-s="rapidFeedEnabled"> Feed rapide activé</label>
                        <label>Vitesse: <span id="speed">${this.settings.get('rapidFeedSpeed')}</span>ms
                            <input type="range" data-s="rapidFeedSpeed" min="0.5" max="100" step="0.5">
                        </label>
                        <p class="mm-hint">Min: 0.5ms - Plus bas = plus rapide</p>
                        <div class="mm-info">
                            <h4>Macros:</h4>
                            <ul>
                                <li><b>Feed Rapide:</b> Maintenir (jusqu'à 0.5ms!)</li>
                                <li><b>Double Split:</b> 2 splits → 4 cells</li>
                                <li><b>Triple Split:</b> 3 splits → 8 cells</li>
                                <li><b>Quad Split:</b> 4 splits → 16 cells</li>
                            </ul>
                        </div>
                    </div>
                </div>
                <div class="mm-foot">
                    <button class="mm-reset">Réinitialiser</button>
                    <span>ESC pour fermer</span>
                </div>
            </div>`;
        }

        keyBinds() {
            return [
                { label: 'Feed', path: 'keys.feed' },
                { label: 'Feed Rapide (maintenir)', path: 'keys.rapidFeed' },
                { label: 'Split', path: 'keys.split' },
                { label: 'Double Split', path: 'keys.doubleSplit' },
                { label: 'Triple Split', path: 'keys.tripleSplit' },
                { label: 'Quad Split', path: 'keys.quadSplit' },
                { label: 'Freeze', path: 'keys.freeze' },
                { label: 'Toggle Masse', path: 'keys.toggleMass' }
            ];
        }

        mouseBinds() {
            return [
                { label: 'Feed', path: 'mouse.feed' },
                { label: 'Feed Rapide', path: 'mouse.rapidFeed' },
                { label: 'Split', path: 'mouse.split' },
                { label: 'Double Split', path: 'mouse.doubleSplit' },
                { label: 'Triple Split', path: 'mouse.tripleSplit' },
                { label: 'Quad Split', path: 'mouse.quadSplit' }
            ];
        }

        keyDisp(v) {
            if (!v) return 'Aucune';
            const m = { ' ': 'SPACE', 'escape': 'ESC' };
            return m[v.toLowerCase()] || v.toUpperCase();
        }

        mouseDisp(v) {
            if (v === null || v === undefined) return 'Désactivé';
            return ['Gauche', 'Molette', 'Droit', 'Retour', 'Avancer'][v] || `Btn ${v}`;
        }

        style() {
            const css = `
            #mod-menu{display:none;position:fixed;top:0;left:0;width:100%;height:100%;z-index:100000;font-family:Ubuntu,sans-serif}
            #mod-menu.open{display:block}
            .mm-bg{position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,.7)}
            .mm-box{position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:480px;max-width:95%;max-height:85vh;background:rgba(25,25,35,.98);border-radius:12px;overflow:hidden;display:flex;flex-direction:column;box-shadow:0 10px 40px rgba(0,0,0,.5)}
            .mm-head{display:flex;justify-content:space-between;align-items:center;padding:15px 20px;background:linear-gradient(135deg,#667eea,#764ba2);color:#fff}
            .mm-head h2{margin:0;font-size:18px}
            .mm-close{background:none;border:none;color:#fff;font-size:28px;cursor:pointer;opacity:.8}
            .mm-close:hover{opacity:1}
            .mm-tabs{display:flex;background:rgba(0,0,0,.3)}
            .mm-tab{flex:1;padding:10px;background:none;border:none;border-bottom:2px solid transparent;color:rgba(255,255,255,.6);font-size:13px;cursor:pointer}
            .mm-tab:hover{color:rgba(255,255,255,.8);background:rgba(255,255,255,.05)}
            .mm-tab.active{color:#fff;border-bottom-color:#667eea;background:rgba(255,255,255,.1)}
            .mm-content{flex:1;overflow-y:auto;padding:20px}
            .mm-pane{display:none}
            .mm-pane.active{display:block}
            .mm-pane label{display:flex;align-items:center;gap:10px;color:rgba(255,255,255,.9);font-size:14px;margin-bottom:12px;cursor:pointer}
            .mm-pane input[type=checkbox]{width:18px;height:18px;accent-color:#667eea}
            .mm-pane input[type=range]{width:100%;margin-top:5px;accent-color:#667eea}
            .mm-pane input[type=color]{width:40px;height:25px;border:none;border-radius:4px;cursor:pointer}
            .mm-pane select{padding:6px;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:4px;color:#fff}
            .mm-pane select option{background:#2a2a3a}
            .mm-bind{display:flex;justify-content:space-between;align-items:center;padding:8px 12px;background:rgba(255,255,255,.05);border-radius:6px;margin-bottom:8px}
            .mm-bind span{color:rgba(255,255,255,.9);font-size:14px}
            .mm-key,.mm-mouse{min-width:90px;padding:8px 12px;background:linear-gradient(135deg,#667eea,#764ba2);border:none;border-radius:4px;color:#fff;font-size:12px;font-weight:600;cursor:pointer}
            .mm-key:hover,.mm-mouse:hover{transform:scale(1.05)}
            .mm-key.listening,.mm-mouse.listening{background:#e74c3c;animation:pulse 1s infinite}
            @keyframes pulse{0%,100%{opacity:1}50%{opacity:.6}}
            .mm-hint{color:rgba(255,255,255,.5);font-size:12px;font-style:italic;margin-top:10px}
            .mm-legend{color:rgba(255,255,255,.6);font-size:11px;margin-top:8px;padding:8px;background:rgba(255,255,255,.05);border-radius:4px}
            .mm-info{background:rgba(255,255,255,.05);border-radius:8px;padding:12px;margin-top:15px}
            .mm-info h4{margin:0 0 8px;color:#667eea;font-size:14px}
            .mm-info ul{margin:0;padding-left:20px}
            .mm-info li{color:rgba(255,255,255,.8);font-size:13px;margin-bottom:4px}
            .mm-foot{display:flex;justify-content:space-between;align-items:center;padding:12px 20px;background:rgba(0,0,0,.2)}
            .mm-reset{padding:8px 16px;background:#e74c3c;border:none;border-radius:4px;color:#fff;cursor:pointer}
            .mm-foot span{color:rgba(255,255,255,.5);font-size:12px}
            .mm-content::-webkit-scrollbar{width:8px}
            .mm-content::-webkit-scrollbar-thumb{background:rgba(255,255,255,.2);border-radius:4px}
            `;
            const s = document.createElement('style');
            s.textContent = css;
            document.head.appendChild(s);
        }

        bind() {
            // Tabs
            this.el.querySelectorAll('.mm-tab').forEach(t => {
                t.addEventListener('click', () => {
                    this.el.querySelectorAll('.mm-tab').forEach(x => x.classList.toggle('active', x === t));
                    this.el.querySelectorAll('.mm-pane').forEach(p => p.classList.toggle('active', p.dataset.t === t.dataset.t));
                });
            });

            // Close
            this.el.querySelector('.mm-close').addEventListener('click', () => this.close());
            this.el.querySelector('.mm-bg').addEventListener('click', () => this.close());

            // Reset
            this.el.querySelector('.mm-reset').addEventListener('click', () => {
                if (confirm('Réinitialiser?')) {
                    this.settings.reset();
                    this.update();
                }
            });

            // Settings
            this.el.querySelectorAll('[data-s]').forEach(el => {
                const s = el.dataset.s;
                if (el.type === 'checkbox') {
                    el.addEventListener('change', () => this.settings.set(s, el.checked));
                } else if (el.type === 'range') {
                    el.addEventListener('input', () => {
                        this.settings.set(s, parseFloat(el.value));
                        if (s === 'massFontSize') this.el.querySelector('#fs').textContent = el.value;
                        if (s === 'rapidFeedSpeed') this.el.querySelector('#speed').textContent = el.value;
                    });
                } else if (el.tagName === 'SELECT') {
                    el.addEventListener('change', () => this.settings.set(s, el.value));
                } else if (el.type === 'color') {
                    el.addEventListener('change', () => this.settings.set(s, el.value));
                }
            });

            // Key binds
            this.el.querySelectorAll('.mm-key').forEach(btn => {
                btn.addEventListener('click', () => this.startListen(btn, 'key'));
            });

            // Mouse binds
            this.el.querySelectorAll('.mm-mouse').forEach(btn => {
                btn.addEventListener('click', (e) => {
                    e.preventDefault();
                    this.startListen(btn, 'mouse');
                });
                btn.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    // Right-click to disable
                    this.settings.set(btn.dataset.m, null);
                    btn.textContent = this.mouseDisp(null);
                });
            });

            // Global listeners
            document.addEventListener('keydown', (e) => {
                if (this.listening && this.listenType === 'key') {
                    e.preventDefault();
                    e.stopPropagation();
                    const v = e.key === ' ' ? ' ' : e.key.toLowerCase();
                    this.settings.set(this.listening.dataset.k, v);
                    this.listening.textContent = this.keyDisp(v);
                    this.listening.classList.remove('listening');
                    this.listening = null;
                }
            }, true);

            document.addEventListener('mousedown', (e) => {
                if (this.listening && this.listenType === 'mouse') {
                    e.preventDefault();
                    e.stopPropagation();
                    this.settings.set(this.listening.dataset.m, e.button);
                    this.listening.textContent = this.mouseDisp(e.button);
                    this.listening.classList.remove('listening');
                    this.listening = null;
                }
            }, true);
        }

        startListen(btn, type) {
            if (this.listening) this.listening.classList.remove('listening');
            this.listening = btn;
            this.listenType = type;
            btn.classList.add('listening');
            btn.textContent = '...';
        }

        update() {
            this.el.querySelectorAll('[data-s]').forEach(el => {
                const v = this.settings.get(el.dataset.s);
                if (el.type === 'checkbox') el.checked = v;
                else if (el.type === 'range') {
                    el.value = v;
                    if (el.dataset.s === 'massFontSize') this.el.querySelector('#fs').textContent = v;
                    if (el.dataset.s === 'rapidFeedSpeed') this.el.querySelector('#speed').textContent = v;
                }
                else if (el.tagName === 'SELECT') el.value = v;
                else if (el.type === 'color') el.value = v;
            });
            this.el.querySelectorAll('.mm-key').forEach(btn => {
                btn.textContent = this.keyDisp(this.settings.get(btn.dataset.k));
            });
            this.el.querySelectorAll('.mm-mouse').forEach(btn => {
                btn.textContent = this.mouseDisp(this.settings.get(btn.dataset.m));
            });
        }

        toggle() { this.isOpen ? this.close() : this.open(); }
        open() {
            this.isOpen = true;
            this.el.classList.add('open');
            this.update();
        }
        close() {
            this.isOpen = false;
            this.el.classList.remove('open');
            if (this.listening) {
                this.listening.classList.remove('listening');
                this.listening = null;
            }
            this.update();
        }
    }

    // Main
    class SigmallyMod {
        constructor() {
            this.settings = new Settings();
            this.game = new GameInterface();
            this.macros = new MacroManager(this.game, this.settings);
            this.renderer = new Renderer(this.game, this.settings);
            this.input = new InputManager(this.game, this.settings, this.macros);

            const initMenu = () => {
                if (document.body) {
                    this.menu = new Menu(this.settings, this.macros, this.input);
                    this.input.setMenu(this.menu);
                } else requestAnimationFrame(initMenu);
            };
            initMenu();

            console.log(`%c[Sigmally Mod] v${CONFIG.version} chargé!`, 'color:#667eea;font-weight:bold;font-size:14px');
            console.log('%c[Mod] ESC pour ouvrir le menu', 'color:#888');
        }
    }

    // Init
    const start = () => {
        try { window.SigmallyMod = new SigmallyMod(); }
        catch (e) { console.error('[Mod] Erreur:', e); }
    };

    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start);

})();

