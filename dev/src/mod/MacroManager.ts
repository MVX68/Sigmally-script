/**
 * Macro Manager
 * Handles rapid feeding, multi-split, and other macro actions
 */

import { GameInterface } from './GameInterface';
import { SettingsManager } from './ModSettings';

export class MacroManager {
    private game: GameInterface;
    private settings: SettingsManager;
    private rapidFeedInterval: ReturnType<typeof setInterval> | null = null;
    private isRapidFeeding: boolean = false;

    constructor(game: GameInterface, settings: SettingsManager) {
        this.game = game;
        this.settings = settings;
    }

    /**
     * Start rapid feeding (hold to mass eject)
     */
    startRapidFeed(): void {
        if (this.isRapidFeeding) return;

        this.isRapidFeeding = true;
        const speed = this.settings.get<number>('rapidFeedSpeed');

        // Initial feed
        this.game.feed();

        this.rapidFeedInterval = setInterval(() => {
            this.game.feed();
        }, speed);
    }

    /**
     * Stop rapid feeding
     */
    stopRapidFeed(): void {
        this.isRapidFeeding = false;
        if (this.rapidFeedInterval) {
            clearInterval(this.rapidFeedInterval);
            this.rapidFeedInterval = null;
        }
    }

    /**
     * Check if currently rapid feeding
     */
    isFeeding(): boolean {
        return this.isRapidFeeding;
    }

    /**
     * Double split - 2 rapid splits
     */
    doubleSplit(): void {
        this.game.split();
        setTimeout(() => this.game.split(), 50);
    }

    /**
     * Triple split - 3 rapid splits
     */
    tripleSplit(): void {
        this.game.split();
        setTimeout(() => this.game.split(), 50);
        setTimeout(() => this.game.split(), 100);
    }

    /**
     * Quad split - 4 rapid splits (16 cells max)
     */
    quadSplit(): void {
        this.game.split();
        setTimeout(() => this.game.split(), 50);
        setTimeout(() => this.game.split(), 100);
        setTimeout(() => this.game.split(), 150);
    }

    /**
     * Pop split - Split towards smallest cell
     */
    popSplit(): void {
        // Find smallest enemy cell nearby
        const myPos = this.game.getMyPosition();
        let nearestSmall: { x: number; y: number; dist: number } | null = null;
        const maxDist = 1000;

        for (const [id, cell] of this.game.cells) {
            if (cell.isMe) continue;
            if (cell.mass > this.game.myMass * 0.1) continue; // Only small cells

            const dx = cell.x - myPos.x;
            const dy = cell.y - myPos.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < maxDist && (!nearestSmall || dist < nearestSmall.dist)) {
                nearestSmall = { x: cell.x, y: cell.y, dist };
            }
        }

        if (nearestSmall) {
            // Set target towards small cell then split
            this.game.setTarget(nearestSmall.x, nearestSmall.y);
            setTimeout(() => this.game.split(), 50);
        }
    }

    /**
     * Line split - Split in a line
     */
    lineSplit(count: number = 4): void {
        for (let i = 0; i < count; i++) {
            setTimeout(() => this.game.split(), i * 50);
        }
    }

    /**
     * Trick split - Split then quickly return
     */
    trickSplit(): void {
        const originalX = this.game.mouseX;
        const originalY = this.game.mouseY;

        this.game.split();

        setTimeout(() => {
            // Move mouse in opposite direction briefly
            const canvas = this.game.canvas;
            if (canvas) {
                const centerX = canvas.width / 2;
                const centerY = canvas.height / 2;
                const dx = originalX - centerX;
                const dy = originalY - centerY;

                this.game.setTarget(
                    centerX - dx,
                    centerY - dy
                );
            }
        }, 100);

        setTimeout(() => {
            this.game.setTarget(originalX, originalY);
        }, 200);
    }

    /**
     * Self feed - Feed your own cells (for team modes)
     */
    selfFeed(duration: number = 1000): void {
        const endTime = Date.now() + duration;

        const feedLoop = () => {
            if (Date.now() < endTime) {
                this.game.feed();
                setTimeout(feedLoop, 50);
            }
        };

        feedLoop();
    }

    /**
     * Update rapid feed speed from settings
     */
    updateFeedSpeed(): void {
        if (this.isRapidFeeding) {
            this.stopRapidFeed();
            this.startRapidFeed();
        }
    }

    /**
     * Cleanup
     */
    destroy(): void {
        this.stopRapidFeed();
    }
}
