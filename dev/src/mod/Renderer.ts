/**
 * Renderer
 * Handles overlay rendering, mass display, and visual features
 */

import { GameInterface, CellData, Position } from './GameInterface';
import { SettingsManager } from './ModSettings';

export class Renderer {
    private game: GameInterface;
    private settings: SettingsManager;
    private overlay: HTMLCanvasElement;
    private overlayCtx: CanvasRenderingContext2D;
    private zoomLevel: number;
    private animationFrameId: number | null = null;

    constructor(game: GameInterface, settings: SettingsManager) {
        this.game = game;
        this.settings = settings;
        this.zoomLevel = settings.get<number>('zoomLevel');
        this.overlay = this.createOverlay();
        this.overlayCtx = this.overlay.getContext('2d')!;

        this.setupResizeHandler();
        this.startRenderLoop();
    }

    private createOverlay(): HTMLCanvasElement {
        const overlay = document.createElement('canvas');
        overlay.id = 'sigmally-mod-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 999;
        `;

        // Wait for body to be available
        const appendOverlay = () => {
            if (document.body) {
                document.body.appendChild(overlay);
                this.resizeOverlay();
            } else {
                requestAnimationFrame(appendOverlay);
            }
        };
        appendOverlay();

        return overlay;
    }

    private setupResizeHandler(): void {
        window.addEventListener('resize', () => this.resizeOverlay());
    }

    private resizeOverlay(): void {
        this.overlay.width = window.innerWidth;
        this.overlay.height = window.innerHeight;
    }

    private startRenderLoop(): void {
        const render = () => {
            this.render();
            this.animationFrameId = requestAnimationFrame(render);
        };
        render();
    }

    private render(): void {
        this.overlayCtx.clearRect(0, 0, this.overlay.width, this.overlay.height);

        if (this.settings.get<boolean>('showMass')) {
            this.renderMass();
        }

        if (this.settings.get<boolean>('showMinimap')) {
            this.renderMinimap();
        }

        this.renderStats();
        this.renderIndicators();
    }

    private renderMass(): void {
        const ctx = this.overlayCtx;
        const fontSize = this.settings.get<number>('massFontSize');
        const massType = this.settings.get<'mass' | 'short'>('massType');
        const showOutline = this.settings.get<boolean>('massOutline');
        const massColor = this.settings.get<string>('massColor');
        const outlineColor = this.settings.get<string>('massOutlineColor');

        ctx.font = `bold ${fontSize}px Ubuntu, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        for (const [id, cell] of this.game.cells) {
            // Skip own cells
            if (cell.isMe) continue;

            // Skip very small cells
            if (cell.mass < 10) continue;

            // Convert world to screen coordinates
            const screenPos = this.game.worldToScreen(cell.x, cell.y);

            // Skip if off screen
            if (
                screenPos.x < -50 ||
                screenPos.x > this.overlay.width + 50 ||
                screenPos.y < -50 ||
                screenPos.y > this.overlay.height + 50
            ) {
                continue;
            }

            const massText = massType === 'short'
                ? this.formatMass(cell.mass)
                : cell.mass.toString();

            // Draw text outline
            if (showOutline) {
                ctx.strokeStyle = outlineColor;
                ctx.lineWidth = 3;
                ctx.strokeText(massText, screenPos.x, screenPos.y);
            }

            // Draw text
            ctx.fillStyle = massColor;
            ctx.fillText(massText, screenPos.x, screenPos.y);
        }
    }

    private formatMass(mass: number): string {
        if (mass >= 1000000) {
            return (mass / 1000000).toFixed(1) + 'M';
        }
        if (mass >= 1000) {
            return (mass / 1000).toFixed(1) + 'K';
        }
        return mass.toString();
    }

    private renderMinimap(): void {
        const ctx = this.overlayCtx;
        const size = this.settings.get<number>('minimapSize');
        const opacity = this.settings.get<number>('minimapOpacity');
        const padding = 10;
        const x = this.overlay.width - size - padding;
        const y = this.overlay.height - size - padding;

        ctx.globalAlpha = opacity;

        // Background
        ctx.fillStyle = '#111111';
        ctx.fillRect(x, y, size, size);

        // Border
        ctx.strokeStyle = '#333333';
        ctx.lineWidth = 2;
        ctx.strokeRect(x, y, size, size);

        // Grid
        ctx.strokeStyle = '#222222';
        ctx.lineWidth = 1;
        const gridSize = size / 5;
        for (let i = 1; i < 5; i++) {
            ctx.beginPath();
            ctx.moveTo(x + i * gridSize, y);
            ctx.lineTo(x + i * gridSize, y + size);
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(x, y + i * gridSize);
            ctx.lineTo(x + size, y + i * gridSize);
            ctx.stroke();
        }

        const mapWidth = this.game.mapBounds.maxX - this.game.mapBounds.minX;
        const mapHeight = this.game.mapBounds.maxY - this.game.mapBounds.minY;

        // Draw other cells
        for (const [id, cell] of this.game.cells) {
            if (cell.isMe) continue;

            const cellX = x + ((cell.x - this.game.mapBounds.minX) / mapWidth) * size;
            const cellY = y + ((cell.y - this.game.mapBounds.minY) / mapHeight) * size;
            const cellSize = Math.max(2, Math.min(8, cell.size / 100));

            ctx.beginPath();
            ctx.arc(cellX, cellY, cellSize, 0, Math.PI * 2);
            ctx.fillStyle = '#FF4444';
            ctx.fill();
        }

        // Draw own cells (on top)
        for (const cellId of this.game.myCells) {
            const cell = this.game.cells.get(cellId);
            if (!cell) continue;

            const cellX = x + ((cell.x - this.game.mapBounds.minX) / mapWidth) * size;
            const cellY = y + ((cell.y - this.game.mapBounds.minY) / mapHeight) * size;
            const cellSize = Math.max(3, Math.min(10, cell.size / 80));

            ctx.beginPath();
            ctx.arc(cellX, cellY, cellSize, 0, Math.PI * 2);
            ctx.fillStyle = '#00FF00';
            ctx.fill();

            ctx.strokeStyle = '#FFFFFF';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        ctx.globalAlpha = 1;
    }

    private renderStats(): void {
        const ctx = this.overlayCtx;
        const padding = 10;

        ctx.font = 'bold 14px Ubuntu, sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';

        const stats = [
            `Mass: ${this.formatMass(this.game.myMass)}`,
            `Cells: ${this.game.myCells.size}/16`,
            `Zoom: ${(this.game.camera.scale * 100).toFixed(0)}%`,
            `FPS: ${this.calculateFPS()}`
        ];

        const boxWidth = 130;
        const boxHeight = stats.length * 20 + 15;

        // Background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.roundRect(padding, padding, boxWidth, boxHeight, 8);
        ctx.fill();

        // Border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 1;
        ctx.roundRect(padding, padding, boxWidth, boxHeight, 8);
        ctx.stroke();

        // Stats text
        ctx.fillStyle = '#FFFFFF';
        stats.forEach((stat, i) => {
            ctx.fillText(stat, padding + 10, padding + 10 + i * 20);
        });
    }

    private lastFrameTime: number = 0;
    private frameCount: number = 0;
    private fps: number = 0;

    private calculateFPS(): number {
        const now = performance.now();
        this.frameCount++;

        if (now - this.lastFrameTime >= 1000) {
            this.fps = this.frameCount;
            this.frameCount = 0;
            this.lastFrameTime = now;
        }

        return this.fps;
    }

    private renderIndicators(): void {
        const ctx = this.overlayCtx;

        // Frozen indicator
        if (this.game.frozen) {
            ctx.font = 'bold 16px Ubuntu, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillStyle = '#FF6B6B';
            ctx.fillText('FROZEN', this.overlay.width / 2, 30);
        }
    }

    // Zoom methods
    setZoom(level: number): void {
        const min = this.settings.get<number>('minZoom');
        const max = this.settings.get<number>('maxZoom');
        this.zoomLevel = Math.max(min, Math.min(max, level));
        this.settings.set('zoomLevel', this.zoomLevel);

        if (this.game.canvas) {
            this.game.canvas.style.transform = `scale(${this.zoomLevel})`;
            this.game.canvas.style.transformOrigin = 'center center';
        }
    }

    zoomIn(): void {
        const step = this.settings.get<number>('zoomStep');
        this.setZoom(this.zoomLevel + step);
    }

    zoomOut(): void {
        const step = this.settings.get<number>('zoomStep');
        this.setZoom(this.zoomLevel - step);
    }

    resetZoom(): void {
        this.setZoom(1);
    }

    getZoom(): number {
        return this.zoomLevel;
    }

    // Cleanup
    destroy(): void {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
        }
        this.overlay.remove();
    }
}

// Polyfill for roundRect if needed
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(
        x: number,
        y: number,
        width: number,
        height: number,
        radius: number
    ) {
        this.beginPath();
        this.moveTo(x + radius, y);
        this.lineTo(x + width - radius, y);
        this.quadraticCurveTo(x + width, y, x + width, y + radius);
        this.lineTo(x + width, y + height - radius);
        this.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        this.lineTo(x + radius, y + height);
        this.quadraticCurveTo(x, y + height, x, y + height - radius);
        this.lineTo(x, y + radius);
        this.quadraticCurveTo(x, y, x + radius, y);
        this.closePath();
        return this;
    };
}
