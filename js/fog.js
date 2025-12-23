/**
 * War Tanks II - Fog of War Module
 * Реализация тумана войны с использованием Canvas и сеточного алгоритма видимости.
 */

import { WORLD_WIDTH, WORLD_HEIGHT } from './core.js';

export const FOG_CELL_SIZE = 40;
export const FOG_BASE_ALPHA = 0.92;

export class FogRenderer {
    constructor(playfield) {
        this.canvas = document.createElement("canvas");
        this.canvas.className = "playfield__fog";
        this.canvas.width = WORLD_WIDTH;
        this.canvas.height = WORLD_HEIGHT;
        playfield.appendChild(this.canvas);
        
        this.ctx = this.canvas.getContext("2d", { alpha: true });
        this.cols = Math.ceil(WORLD_WIDTH / FOG_CELL_SIZE);
        this.rows = Math.ceil(WORLD_HEIGHT / FOG_CELL_SIZE);
        this.alphaField = new Float32Array(this.cols * this.rows);
        
        this.outerRadius = 450;
        this.innerRadius = 240;
    }

    update(playerTank, enemyTank, isEnemyVisible, delta) {
        if (!this.ctx) return;

        // Постепенное затухание (критично для эффекта памяти)
        // В оригинале было мгновенно, но мы можем улучшить
        this.alphaField.fill(0);

        const applyReveal = (tx, ty) => {
            const startCol = Math.max(0, Math.floor((tx - this.outerRadius) / FOG_CELL_SIZE));
            const endCol = Math.min(this.cols - 1, Math.floor((tx + this.outerRadius) / FOG_CELL_SIZE));
            const startRow = Math.max(0, Math.floor((ty - this.outerRadius) / FOG_CELL_SIZE));
            const endRow = Math.min(this.rows - 1, Math.floor((ty + this.outerRadius) / FOG_CELL_SIZE));

            const outerRadiusSq = this.outerRadius * this.outerRadius;
            const innerRadiusSq = this.innerRadius * this.innerRadius;
            const falloffRange = this.outerRadius - this.innerRadius;

            for (let row = startRow; row <= endRow; row++) {
                for (let col = startCol; col <= endCol; col++) {
                    const cx = col * FOG_CELL_SIZE + FOG_CELL_SIZE / 2;
                    const cy = row * FOG_CELL_SIZE + FOG_CELL_SIZE / 2;
                    const dx = cx - tx;
                    const dy = cy - ty;
                    const distSq = dx * dx + dy * dy;

                    if (distSq > outerRadiusSq) continue;

                    let influence = 0;
                    if (distSq <= innerRadiusSq) {
                        influence = 1;
                    } else {
                        const dist = Math.sqrt(distSq);
                        influence = 1 - (dist - this.innerRadius) / falloffRange;
                    }

                    const idx = row * this.cols + col;
                    if (influence > this.alphaField[idx]) {
                        this.alphaField[idx] = influence;
                    }
                }
            }
        };

        if (playerTank && !playerTank.isDestroyed) {
            applyReveal(playerTank.x, playerTank.y);
        }

        this.draw();
    }

    draw() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Рисуем базовый темный слой
        this.ctx.globalCompositeOperation = "source-over";
        this.ctx.fillStyle = `rgba(8, 11, 16, ${FOG_BASE_ALPHA})`;
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // "Прогрызаем" дырки в тумане
        this.ctx.globalCompositeOperation = "destination-out";
        const cellHalf = FOG_CELL_SIZE / 2;
        const baseRadius = FOG_CELL_SIZE * 0.95;

        for (let row = 0; row < this.rows; row++) {
            for (let col = 0; col < this.cols; col++) {
                const alpha = this.alphaField[row * this.cols + col];
                if (alpha <= 0) continue;

                const cx = col * FOG_CELL_SIZE + cellHalf;
                const cy = row * FOG_CELL_SIZE + cellHalf;

                this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
                this.ctx.beginPath();
                this.ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
    }
}
