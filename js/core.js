/**
 * War Tanks II - Core Game Logic
 * Этот файл содержит основную логику игры, физику и константы.
 * Отрисовка здесь отсутствует.
 */

export const TANK_PRESETS = Object.freeze({
    tiger: Object.freeze({
        id: "tiger",
        displayName: "Tiger MK II",
        variantClass: "tank--player tank--tiger-mk-ii",
        defaults: Object.freeze({
            moveSpeed: 220,
            fireCooldown: 1.5,
            damagePerHit: 0.2,
        }),
    }),
    phantom: Object.freeze({
        id: "phantom",
        displayName: "FANTOM X",
        variantClass: "tank--player tank--phantom-x",
        defaults: Object.freeze({
            moveSpeed: 280,
            fireCooldown: 1.2,
            damagePerHit: 0.16,
        }),
    }),
    crusher: Object.freeze({
        id: "crusher",
        displayName: "CRUSHER 88",
        variantClass: "tank--player tank--crusher-88",
        defaults: Object.freeze({
            moveSpeed: 170,
            fireCooldown: 1.9,
            damagePerHit: 0.26,
        }),
    }),
});

export const TANK_SETTINGS_LIMITS = Object.freeze({
    moveSpeed: { min: 100, max: 400 },
    fireCooldown: { min: 0.5, max: 5 },
    damagePerHit: { min: 0.1, max: 1 },
});

export const MAP_SCALE = 1.875;
export const BASE_VIEWPORT_WIDTH = 1024;
export const BASE_VIEWPORT_HEIGHT = 800;
export const WORLD_WIDTH = Math.round(BASE_VIEWPORT_WIDTH * MAP_SCALE);
export const WORLD_HEIGHT = Math.round(BASE_VIEWPORT_HEIGHT * MAP_SCALE);

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

export const TURN_SPEED = 140;
export const BULLET_SPEED = 580;
export const BULLET_LIFETIME = 2.2;

export const MissionOutcome = Object.freeze({
    NONE: null,
    FAILED: "failed",
    COMPLETED: "completed",
});

/**
 * Класс танка (Логика)
 */
export class TankCore {
    constructor(data) {
        this.id = data.id || Math.random().toString(36).substr(2, 9);
        this.x = data.x || 0;
        this.y = data.y || 0;
        this.hullAngle = data.hullAngle || 0;
        this.turretAngle = data.turretAngle || 0;
        this.health = data.health || 1;
        this.reloadTimer = 0;
        this.isPlayer = data.isPlayer || false;
        this.isDestroyed = false;
        this.presetId = data.presetId || 'tiger';
        
        const preset = TANK_PRESETS[this.presetId];
        this.settings = { ...preset.defaults, ...(data.settings || {}) };
    }

    update(deltaSeconds) {
        if (this.isDestroyed) return;
        
        if (this.reloadTimer > 0) {
            this.reloadTimer = Math.max(0, this.reloadTimer - deltaSeconds);
        }
    }

    applyDamage(amount) {
        if (this.isDestroyed) return;
        this.health = Math.max(0, this.health - amount);
        if (this.health <= 0) {
            this.isDestroyed = true;
        }
    }
}

/**
 * Класс снаряда (Логика)
 */
export class BulletCore {
    constructor(data) {
        this.x = data.x;
        this.y = data.y;
        this.dirX = data.dirX;
        this.dirY = data.dirY;
        this.ownerId = data.ownerId;
        this.liveTime = 0;
        this.isDestroyed = false;
    }

    update(deltaSeconds) {
        this.x += this.dirX * BULLET_SPEED * deltaSeconds;
        this.y += this.dirY * BULLET_SPEED * deltaSeconds;
        this.liveTime += deltaSeconds;

        if (this.liveTime > BULLET_LIFETIME) {
            this.isDestroyed = true;
        }
    }
}
