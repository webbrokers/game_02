import { TankCore, BulletCore, WORLD_WIDTH, WORLD_HEIGHT, TANK_PRESETS } from './core.js';
import { Renderer } from './renderer.js';
import { InputHandler } from './input.js';
import { NetworkHandler } from './network.js';

/**
 * War Tanks II - Game Manager
 * Главный оркестратор игры.
 */
export class GameManager {
    constructor() {
        this.playfield = document.querySelector(".playfield");
        if (!this.playfield) return;

        this.renderer = new Renderer(this.playfield); // На самом деле в world, Renderer создаст его
        this.input = new InputHandler();
        
        this.playerTank = null;
        this.enemyTank = null; // В мультиплеере это другой игрок
        this.bullets = [];
        
        this.isMultiplayer = false;
        this.network = null;
        this.isHost = false;

        this.init();
    }

    async init() {
        const params = new URLSearchParams(window.location.search);
        const roomId = params.get('room');
        const tankId = params.get('tank') || 'tiger';
        this.isHost = params.get('host') === '1';

        // Инициализация игрока
        this.playerTank = new TankCore({
            x: WORLD_WIDTH / 2,
            y: WORLD_HEIGHT / 2,
            isPlayer: true,
            presetId: tankId
        });

        // Создаем мир в Renderer (имитация логики из app.js)
        this.worldElement = document.createElement("div");
        this.worldElement.className = "playfield__world";
        this.worldElement.style.width = `${WORLD_WIDTH}px`;
        this.worldElement.style.height = `${WORLD_HEIGHT}px`;
        this.playfield.appendChild(this.worldElement);
        this.renderer.world = this.worldElement;

        this.renderer.registerTank(this.playerTank, TANK_PRESETS[tankId].variantClass);

        // Слушаем мышь для прицеливания
        this.playfield.addEventListener("pointermove", (e) => {
            const rect = this.playfield.getBoundingClientRect();
            // Пока камера фиксированная, worldX = viewportX (в реальной игре нужно добавить камеру)
            this.input.updatePointer(e, rect, { x: 0, y: 0 }); 
        });

        if (roomId) {
            this.isMultiplayer = true;
            this.playerName = localStorage.getItem('wt2:player-name') || 'Commander';
            this.network = new NetworkHandler(roomId, this.playerName);
            
            // Настройка сетевых коллбэков
            this.network.onPlayerUpdate = (data) => this.handleRemotePlayerUpdate(data);
            this.network.onPlayerFire = (data) => this.handleRemoteFire(data);
            
            await this.network.connect();
        } else {
            // Режим синглплеера - добавляем ИИ
            this.enemyTank = new TankCore({
                x: WORLD_WIDTH * 0.75,
                y: WORLD_HEIGHT * 0.35,
                isPlayer: false,
                presetId: 'tiger'
            });
            this.renderer.registerTank(this.enemyTank, "tank--enemy");
        }

        requestAnimationFrame((t) => this.gameLoop(t));
    }

    handleRemotePlayerUpdate(data) {
        if (!this.enemyTank) {
            this.enemyTank = new TankCore({
                id: data.id,
                x: data.x,
                y: data.y,
                presetId: data.presetId,
                isPlayer: false
            });
            this.renderer.registerTank(this.enemyTank, TANK_PRESETS[data.presetId].variantClass.replace('tank--player', 'tank--enemy'));
        }
        
        this.enemyTank.x = data.x;
        this.enemyTank.y = data.y;
        this.enemyTank.hullAngle = data.hullAngle;
        this.enemyTank.turretAngle = data.turretAngle;
        this.enemyTank.health = data.health;
        this.enemyTank.isDestroyed = data.isDestroyed;
    }

    handleRemoteFire(data) {
        const bullet = new BulletCore({
            x: data.x,
            y: data.y,
            dirX: data.dirX,
            dirY: data.dirY,
            ownerId: data.ownerId
        });
        const element = this.renderer.createBulletElement(false);
        this.bullets.push({ core: bullet, element });
    }

    gameLoop(timestamp) {
        const delta = 0.016; // Упрощенно 60fps

        // 1. Обработка ввода и обновление логики игрока
        this.updatePlayerLogic(delta);
        
        // 2. Обновление врагов / ИИ
        if (!this.isMultiplayer && this.enemyTank) {
            this.updateAILogic(delta);
        }

        // 3. Обновление снарядов
        this.updateBullets(delta);

        // 4. Отрисовка
        this.renderer.updateTank(this.playerTank);
        if (this.enemyTank) {
            this.renderer.updateTank(this.enemyTank);
        }

        // 5. Сетевая синхронизация
        if (this.isMultiplayer && this.playerTank) {
            this.network.sendPosition({
                id: this.playerTank.id,
                x: this.playerTank.x,
                y: this.playerTank.y,
                hullAngle: this.playerTank.hullAngle,
                turretAngle: this.playerTank.turretAngle,
                health: this.playerTank.health,
                isDestroyed: this.playerTank.isDestroyed,
                presetId: this.playerTank.presetId
            });
        }

        // 6. Проверка условий победы/поражения
        this.checkGameOutcome();

        requestAnimationFrame((t) => this.gameLoop(t));
    }

    checkGameOutcome() {
        if (this.outcomeShown) return;

        if (this.playerTank && this.playerTank.isDestroyed) {
            this.showOutcome('DEFEAT');
        } else if (this.enemyTank && this.enemyTank.isDestroyed) {
            this.showOutcome('VICTORY');
        }
    }

    showOutcome(type) {
        this.outcomeShown = true;
        const overlay = document.createElement("div");
        overlay.className = `mission-overlay mission-overlay--visible mission-overlay--${type === 'VICTORY' ? 'completed' : 'failed'}`;
        
        const panel = document.createElement("div");
        panel.className = "mission-overlay__panel";
        
        const title = document.createElement("h2");
        title.className = "mission-overlay__title";
        title.textContent = type === 'VICTORY' ? "MISSION COMPLETED" : "MISSION FAILED";
        
        const actions = document.createElement("div");
        actions.className = "mission-overlay__actions";
        
        const btn = document.createElement("a");
        btn.className = "retro-button mission-overlay__button";
        btn.href = "lobby.html";
        btn.textContent = "CONTINUE";
        
        actions.appendChild(btn);
        panel.appendChild(title);
        panel.appendChild(actions);
        overlay.appendChild(panel);
        
        document.body.appendChild(overlay);

        // Если хост проиграл или выиграл и уходит, закрыть комнату через время
        if (this.isHost && this.isMultiplayer) {
            setTimeout(() => this.network.closeRoom(), 5000);
        }
    }

    updatePlayerLogic(delta) {
        if (!this.playerTank || this.playerTank.isDestroyed) return;

        const moveSpeed = this.playerTank.settings.moveSpeed;
        const turnSpeed = 140;

        // Поворот корпуса
        if (this.input.keyState.turnLeft) this.playerTank.hullAngle -= turnSpeed * delta;
        if (this.input.keyState.turnRight) this.playerTank.hullAngle += turnSpeed * delta;

        // Движение вперед/назад
        if (this.input.keyState.forward || this.input.keyState.backward) {
            const moveDir = this.input.keyState.forward ? 1 : -1;
            const angleRad = this.playerTank.hullAngle * (Math.PI / 180);
            this.playerTank.x += Math.sin(angleRad) * moveDir * moveSpeed * delta;
            this.playerTank.y -= Math.cos(angleRad) * moveDir * moveSpeed * delta;
        }

        // Прицеливание башней за курсором
        const rect = this.playfield.getBoundingClientRect();
        // Мы предполагаем, что камера всегда на игроке (упрощенно пока без камеры)
        // Для точного прицеливания нужно учитывать камеру, как в app.js
        const targetX = this.input.pointerState.worldX;
        const targetY = this.input.pointerState.worldY;
        
        const dx = targetX - this.playerTank.x;
        const dy = targetY - this.playerTank.y;
        this.playerTank.turretAngle = (Math.atan2(dx, -dy) * 180 / Math.PI + 360) % 360;

        // Стрельба
        if (this.input.keyState.firing && this.playerTank.reloadTimer <= 0) {
            this.fireProjectile(this.playerTank);
            if (this.isMultiplayer) {
                const angleRad = this.playerTank.turretAngle * (Math.PI / 180);
                this.network.sendFire({
                    x: this.playerTank.x + Math.sin(angleRad) * 60,
                    y: this.playerTank.y - Math.cos(angleRad) * 60,
                    dirX: Math.sin(angleRad),
                    dirY: -Math.cos(angleRad),
                    ownerId: this.playerTank.id
                });
            }
        }

        this.playerTank.update(delta);
    }

    fireProjectile(tank) {
        const angleRad = tank.turretAngle * (Math.PI / 180);
        const bullet = new BulletCore({
            x: tank.x + Math.sin(angleRad) * 60,
            y: tank.y - Math.cos(angleRad) * 60,
            dirX: Math.sin(angleRad),
            dirY: -Math.cos(angleRad),
            ownerId: tank.id
        });
        const element = this.renderer.createBulletElement(tank.isPlayer);
        this.bullets.push({ core: bullet, element });
        tank.reloadTimer = tank.settings.fireCooldown;
    }

    updateBullets(delta) {
        for (let i = this.bullets.length - 1; i >= 0; i--) {
            const b = this.bullets[i];
            b.core.update(delta);
            
            // Проверка столкновений
            if (this.checkCollision(b.core)) {
                this.renderer.removeBullet(b.element);
                this.bullets.splice(i, 1);
                continue;
            }

            if (b.core.isDestroyed) {
                this.renderer.removeBullet(b.element);
                this.bullets.splice(i, 1);
            } else {
                this.renderer.updateBullet(b.core, b.element);
            }
        }
    }

    checkCollision(bullet) {
        // Проверка попадания в игрока (если пуля не своя)
        if (bullet.ownerId !== this.playerTank.id && !this.playerTank.isDestroyed) {
            const dist = Math.hypot(bullet.x - this.playerTank.x, bullet.y - this.playerTank.y);
            if (dist < 30) {
                this.playerTank.applyDamage(0.1); 
                // В реальности урон должен браться из настроек вражеского танка
                return true;
            }
        }

        // Проверка попадания во врага (для визуального эффекта)
        if (this.enemyTank && bullet.ownerId !== this.enemyTank.id && !this.enemyTank.isDestroyed) {
            const dist = Math.hypot(bullet.x - this.enemyTank.x, bullet.y - this.enemyTank.y);
            if (dist < 30) {
                // Если не мультиплеер, наносим урон ИИ
                if (!this.isMultiplayer) {
                    this.enemyTank.applyDamage(0.1);
                }
                return true;
            }
        }

        return false;
    }

    updateAILogic(delta) {
        // Заглушка для ИИ в модульной системе
    }
}

// Запуск при загрузке
if (document.querySelector(".playfield")) {
    window.game = new GameManager();
}
