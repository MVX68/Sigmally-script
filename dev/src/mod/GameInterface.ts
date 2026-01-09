/**
 * Game Interface
 * Handles WebSocket interception and game state management
 */

export interface CellData {
    id: number;
    x: number;
    y: number;
    size: number;
    mass: number;
    name?: string;
    skin?: string;
    color?: string;
    isMe: boolean;
}

export interface Camera {
    x: number;
    y: number;
    scale: number;
}

export interface MapBounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
}

export interface Position {
    x: number;
    y: number;
}

type GameEventCallback = () => void;

export class GameInterface {
    ws: WebSocket | null = null;
    canvas: HTMLCanvasElement | null = null;
    ctx: CanvasRenderingContext2D | null = null;

    camera: Camera = { x: 0, y: 0, scale: 1 };
    cells: Map<number, CellData> = new Map();
    myCells: Set<number> = new Set();
    myMass: number = 0;

    mouseX: number = 0;
    mouseY: number = 0;
    frozen: boolean = false;
    frozenPos: Position = { x: 0, y: 0 };

    mapBounds: MapBounds = {
        minX: -7071,
        minY: -7071,
        maxX: 7071,
        maxY: 7071
    };

    private onSpawnCallbacks: GameEventCallback[] = [];
    private onDeathCallbacks: GameEventCallback[] = [];
    private originalWebSocket: typeof WebSocket;

    constructor() {
        this.originalWebSocket = window.WebSocket;
        this.hookWebSocket();
        this.hookCanvas();
    }

    private hookWebSocket(): void {
        const self = this;
        const OriginalWS = this.originalWebSocket;

        (window as any).WebSocket = function(
            url: string,
            protocols?: string | string[]
        ): WebSocket {
            const ws = protocols
                ? new OriginalWS(url, protocols)
                : new OriginalWS(url);

            if (url.includes('sigmally') || url.includes('agar')) {
                self.ws = ws;
                self.setupWebSocketListeners(ws);
            }

            return ws;
        };

        // Copy static properties
        (window as any).WebSocket.prototype = OriginalWS.prototype;
        (window as any).WebSocket.CONNECTING = OriginalWS.CONNECTING;
        (window as any).WebSocket.OPEN = OriginalWS.OPEN;
        (window as any).WebSocket.CLOSING = OriginalWS.CLOSING;
        (window as any).WebSocket.CLOSED = OriginalWS.CLOSED;
    }

    private setupWebSocketListeners(ws: WebSocket): void {
        ws.addEventListener('message', (event: MessageEvent) => {
            this.parseMessage(event.data);
        });

        ws.addEventListener('close', () => {
            this.handleDisconnect();
        });

        ws.addEventListener('open', () => {
            console.log('[GameInterface] Connected to game server');
        });
    }

    private hookCanvas(): void {
        const setupCanvas = (): boolean => {
            this.canvas = document.querySelector('canvas');
            if (this.canvas) {
                this.ctx = this.canvas.getContext('2d');
                if (this.ctx) {
                    this.hookCanvasContext();
                    return true;
                }
            }
            return false;
        };

        if (!setupCanvas()) {
            const observer = new MutationObserver(() => {
                if (setupCanvas()) {
                    observer.disconnect();
                }
            });

            const target = document.body || document.documentElement;
            observer.observe(target, {
                childList: true,
                subtree: true
            });
        }
    }

    private hookCanvasContext(): void {
        if (!this.ctx) return;

        const originalTranslate = this.ctx.translate.bind(this.ctx);
        const originalScale = this.ctx.scale.bind(this.ctx);

        const self = this;

        this.ctx.translate = function(x: number, y: number): void {
            self.camera.x = -x;
            self.camera.y = -y;
            return originalTranslate(x, y);
        };

        this.ctx.scale = function(x: number, y: number): void {
            self.camera.scale = x;
            return originalScale(x, y);
        };
    }

    private parseMessage(data: any): void {
        if (!(data instanceof ArrayBuffer)) return;

        const view = new DataView(data);
        if (view.byteLength < 1) return;

        const opcode = view.getUint8(0);

        try {
            switch (opcode) {
                case 16:
                    this.parseCellUpdate(view);
                    break;
                case 17:
                    this.parsePosition(view);
                    break;
                case 32:
                    this.parseOwnCell(view);
                    break;
                case 64:
                    this.parseMapBounds(view);
                    break;
            }
        } catch (e) {
            // Silent error handling for malformed packets
        }
    }

    private parseCellUpdate(view: DataView): void {
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

            const flags = view.getUint8(offset);
            offset += 1;

            let color: string | undefined;
            let skin: string | undefined;
            let name: string | undefined;

            // Parse optional fields
            if (flags & 2) {
                const r = view.getUint8(offset);
                const g = view.getUint8(offset + 1);
                const b = view.getUint8(offset + 2);
                color = `rgb(${r},${g},${b})`;
                offset += 3;
            }

            if (flags & 4) {
                skin = this.readString(view, offset);
                offset += skin.length + 1;
            }

            if (flags & 8) {
                name = this.readString(view, offset);
                offset += name.length + 1;
            }

            this.cells.set(cellId, {
                id: cellId,
                x,
                y,
                size,
                mass: Math.floor(size * size / 100),
                name,
                skin,
                color,
                isMe: this.myCells.has(cellId)
            });
        }

        // Parse destroyed cells
        if (offset + 2 <= view.byteLength) {
            const destroyCount = view.getUint16(offset, true);
            offset += 2;

            for (let i = 0; i < destroyCount && offset + 4 <= view.byteLength; i++) {
                const cellId = view.getUint32(offset, true);
                offset += 4;
                this.cells.delete(cellId);
                this.myCells.delete(cellId);
            }
        }

        this.updateMyMass();
    }

    private readString(view: DataView, offset: number): string {
        let str = '';
        while (offset < view.byteLength) {
            const char = view.getUint8(offset);
            if (char === 0) break;
            str += String.fromCharCode(char);
            offset++;
        }
        return str;
    }

    private parsePosition(view: DataView): void {
        if (view.byteLength >= 9) {
            this.camera.x = view.getFloat32(1, true);
            this.camera.y = view.getFloat32(5, true);
        }
    }

    private parseOwnCell(view: DataView): void {
        if (view.byteLength >= 5) {
            const cellId = view.getUint32(1, true);
            const wasEmpty = this.myCells.size === 0;
            this.myCells.add(cellId);

            if (wasEmpty) {
                this.onSpawnCallbacks.forEach(cb => cb());
            }
        }
    }

    private parseMapBounds(view: DataView): void {
        if (view.byteLength >= 33) {
            this.mapBounds = {
                minX: view.getFloat64(1, true),
                minY: view.getFloat64(9, true),
                maxX: view.getFloat64(17, true),
                maxY: view.getFloat64(25, true)
            };
        }
    }

    private updateMyMass(): void {
        this.myMass = 0;
        for (const cellId of this.myCells) {
            const cell = this.cells.get(cellId);
            if (cell) {
                this.myMass += cell.mass;
            }
        }
    }

    private handleDisconnect(): void {
        const hadCells = this.myCells.size > 0;
        this.myCells.clear();
        this.cells.clear();
        this.myMass = 0;

        if (hadCells) {
            this.onDeathCallbacks.forEach(cb => cb());
        }
    }

    // Public methods for game actions
    send(buffer: ArrayBuffer): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(buffer);
        }
    }

    feed(): void {
        const buffer = new ArrayBuffer(1);
        new DataView(buffer).setUint8(0, 21);
        this.send(buffer);
    }

    split(): void {
        const buffer = new ArrayBuffer(1);
        new DataView(buffer).setUint8(0, 17);
        this.send(buffer);
    }

    setTarget(x: number, y: number): void {
        const buffer = new ArrayBuffer(13);
        const view = new DataView(buffer);
        view.setUint8(0, 16);
        view.setInt32(1, x, true);
        view.setInt32(5, y, true);
        view.setUint32(9, 0, true);
        this.send(buffer);
    }

    // Event registration
    onSpawn(callback: GameEventCallback): void {
        this.onSpawnCallbacks.push(callback);
    }

    onDeath(callback: GameEventCallback): void {
        this.onDeathCallbacks.push(callback);
    }

    // Utility methods
    worldToScreen(worldX: number, worldY: number): Position {
        const canvas = this.canvas;
        if (!canvas) return { x: 0, y: 0 };

        return {
            x: (worldX - this.camera.x) * this.camera.scale + canvas.width / 2,
            y: (worldY - this.camera.y) * this.camera.scale + canvas.height / 2
        };
    }

    screenToWorld(screenX: number, screenY: number): Position {
        const canvas = this.canvas;
        if (!canvas) return { x: 0, y: 0 };

        return {
            x: (screenX - canvas.width / 2) / this.camera.scale + this.camera.x,
            y: (screenY - canvas.height / 2) / this.camera.scale + this.camera.y
        };
    }

    isAlive(): boolean {
        return this.myCells.size > 0;
    }

    getCellCount(): number {
        return this.myCells.size;
    }

    getMyPosition(): Position {
        if (this.myCells.size === 0) {
            return { x: 0, y: 0 };
        }

        let totalX = 0;
        let totalY = 0;
        let totalMass = 0;

        for (const cellId of this.myCells) {
            const cell = this.cells.get(cellId);
            if (cell) {
                totalX += cell.x * cell.mass;
                totalY += cell.y * cell.mass;
                totalMass += cell.mass;
            }
        }

        return totalMass > 0
            ? { x: totalX / totalMass, y: totalY / totalMass }
            : { x: 0, y: 0 };
    }
}

// Singleton
let gameInstance: GameInterface | null = null;

export function getGame(): GameInterface {
    if (!gameInstance) {
        gameInstance = new GameInterface();
    }
    return gameInstance;
}
