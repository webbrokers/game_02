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
            moveSpeed: 100,
            fireCooldown: 3.0,
            damagePerHit: 0.2,
        }),
    }),
    phantom: Object.freeze({
        id: "phantom",
        displayName: "FANTOM X",
        variantClass: "tank--player tank--phantom-x",
        defaults: Object.freeze({
            moveSpeed: 130,
            fireCooldown: 2.4,
            damagePerHit: 0.16,
        }),
    }),
    crusher: Object.freeze({
        id: "crusher",
        displayName: "CRUSHER 88",
        variantClass: "tank--player tank--crusher-88",
        defaults: Object.freeze({
            moveSpeed: 80,
            fireCooldown: 3.8,
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

export const SPAWN_ZONES = Object.freeze({
    player1: { // Left side (Host)
        minX: 100, maxX: 600,
        minY: 100, maxY: WORLD_HEIGHT - 100
    },
    player2: { // Right side (Guest)
        minX: WORLD_WIDTH - 600, maxX: WORLD_WIDTH - 100,
        minY: 100, maxY: WORLD_HEIGHT - 100
    }
});

export const DEG_TO_RAD = Math.PI / 180;
export const RAD_TO_DEG = 180 / Math.PI;

export const TURN_SPEED = 45;
export const BULLET_SPEED = 406;
export const BULLET_LIFETIME = 2.2;

export const MissionOutcome = Object.freeze({
    NONE: null,
    FAILED: "failed",
    COMPLETED: "completed",
});

export const CHASSIS_WIDTH = 58;
export const CHASSIS_HEIGHT = 70;

/**
 * Класс танка (Логика)
 */
export class TankCore {
    constructor(data) {
        // ID теперь ОБЯЗАТЕЛЕН - генерируется в GameManager на основе роли игрока
        this.id = data.id;
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

        this.clampPosition();
    }

    clampPosition() {
        const halfW = CHASSIS_WIDTH / 2;
        const halfH = CHASSIS_HEIGHT / 2;
        this.x = Math.max(halfW, Math.min(WORLD_WIDTH - halfW, this.x));
        this.y = Math.max(halfH, Math.min(WORLD_HEIGHT - halfH, this.y));
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
