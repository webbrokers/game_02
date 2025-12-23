import { TankCore, BulletCore, WORLD_WIDTH, WORLD_HEIGHT, TANK_PRESETS } from './core.js';
import { Renderer } from './renderer.js';
import { InputHandler } from './input.js';
import { NetworkHandler } from './network.js';
import { FogRenderer } from './fog.js';

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
        this.camera = { x: 0, y: 0 };
        this.viewportWidth = 1024;
        this.viewportHeight = 800;
        
        this.network = null;
        this.isHost = false;
        this.outcomeShown = false;
        this.fog = null;
        this.isEnemyVisible = false;

        this.aimSpread = 0; // Текущий разлет прицела (0-20)
        this.isTurretMoving = false;

        this.init();
    }

    async init() {
        const params = new URLSearchParams(window.location.search);
        const roomId = params.get('room');
        const tankId = params.get('tank') || 'tiger';
        this.isHost = params.get('host') === '1';

        // Очистка плейфилда от возможного мусора из app.js
        this.playfield.innerHTML = '';

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
            
            // Инициализация HUD для мультиплеера
            this.renderer.initHUD(this.playerName, null);
        } else {
            // Режим синглплеера - добавляем ИИ
            const pName = localStorage.getItem('wt2:player-name') || 'Commander';
            this.enemyTank = new TankCore({
                x: WORLD_WIDTH * 0.75,
                y: WORLD_HEIGHT * 0.35,
                isPlayer: false,
                presetId: 'tiger'
            });
            this.renderer.registerTank(this.enemyTank, "tank--enemy");
            
            // Инициализация HUD для синглплеера
            this.renderer.initHUD(pName, "AI: Tiger MK-II");
        }

        // Инициализация тумана войны
        this.fog = new FogRenderer(this.worldElement);

        // Создаем прицел
        this.aimCursor = this.renderer.createAimCursor();

        // Закрытие комнаты при выходе (для хоста)
        window.addEventListener('beforeunload', () => {
            if (this.isHost && this.isMultiplayer && this.network) {
                this.network.closeRoom();
            }
        });

        requestAnimationFrame((t) => this.gameLoop(t));
    }

    handleRemotePlayerUpdate(data) {
        // Защита: не обрабатываем сообщения от самих себя
        if (this.playerTank && data.id === this.playerTank.id) return;

        if (!this.enemyTank) {
            this.enemyName = data.name || 'Enemy';
            this. enemyTank = new TankCore({
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

        // 4. Обновление камеры (центрирование на игроке)
        this.updateCamera(delta);

        // 5. Отрисовка
        this.renderer.updateCamera(this.camera);
        this.renderer.updateTank(this.playerTank);
        if (this.enemyTank) {
            this.renderer.updateTank(this.enemyTank);
        }

        // 5.1 Обновление HUD
        const hp1 = this.playerTank ? this.playerTank.health : 0;
        const hp2 = this.enemyTank ? this.enemyTank.health : 0;
        this.renderer.updateHUD(hp1, hp2, this.enemyName);

        // 6. Обновление тумана войны
        this.updateEnemyVisibility();
        this.fog.update(this.playerTank, this.enemyTank, this.isEnemyVisible, delta);
        
        // Принудительно скрываем врага, если он вне зоны видимости (и не в синглплеере с читами)
        if (this.enemyTank) {
            this.renderer.setTankVisibility(this.enemyTank.id, this.isEnemyVisible);
        }

        // 7. Сетевая синхронизация
        if (this.isMultiplayer && this.playerTank) {
            this.network.sendPosition({
                id: this.playerTank.id,
                name: this.playerName,
                x: this.playerTank.x,
                y: this.playerTank.y,
                hullAngle: this.playerTank.hullAngle,
                turretAngle: this.playerTank.turretAngle,
                health: this.playerTank.health,
                isDestroyed: this.playerTank.isDestroyed,
                presetId: this.playerTank.presetId,
                visibleToEnemy: true // Для простоты пока так
            });
        }

        // 8. Проверка условий победы/поражения
        this.checkGameOutcome();

        requestAnimationFrame((t) => this.gameLoop(t));
    }

    updateEnemyVisibility() {
        if (!this.playerTank || !this.enemyTank) {
            this.isEnemyVisible = false;
            return;
        }

        const dx = this.playerTank.x - this.enemyTank.x;
        const dy = this.playerTank.y - this.enemyTank.y;
        const dist = Math.hypot(dx, dy);
        
        // В тумане войны радиус 450
        this.isEnemyVisible = dist < 420; // Чуть меньше радиуса тумана для красоты
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

    updateCamera(delta) {
        if (!this.playerTank) return;
        
        // Плавное следование за игроком
        const targetX = this.playerTank.x - this.viewportWidth / 2;
        const targetY = this.playerTank.y - this.viewportHeight / 2;
        
        // Ограничение камеры границами мира
        const mapWidth = 1920;  // WORLD_WIDTH из core.js
        const mapHeight = 1500; // WORLD_HEIGHT из core.js
        this.camera.x = Math.max(0, Math.min(mapWidth - this.viewportWidth, targetX));
        this.camera.y = Math.max(0, Math.min(mapHeight - this.viewportHeight, targetY));
    }

    updatePlayerLogic(delta) {
        if (!this.playerTank || this.playerTank.isDestroyed) return;

        const moveSpeed = this.playerTank.settings.moveSpeed;
        const turnSpeed = 45; // Согласовано с core.js

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

        // Прицеливание башней за курсором с учетом камеры и инерции
        const worldMouseX = this.input.pointerState.viewportX + this.camera.x;
        const worldMouseY = this.input.pointerState.viewportY + this.camera.y;
        
        // Обновление разлета прицела
        if (this.isTurretMoving) {
            this.aimSpread = Math.min(20, this.aimSpread + 1); // Быстрое расширение
        } else {
            const shrinkAmount = (20 / 0.5) * delta; // Схождение за 0.5с
            this.aimSpread = Math.max(0, this.aimSpread - shrinkAmount);
        }

        // Обновление позиции и состояния прицела
        this.renderer.updateAimCursor(this.aimCursor, worldMouseX, worldMouseY, this.aimSpread);

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

    aimTurretTowards(tank, targetX, targetY, delta) {
        const dx = targetX - tank.x;
        const dy = targetY - tank.y;
        const targetAngle = (Math.atan2(dx, -dy) * (180 / Math.PI) + 360) % 360;
        
        const angleDiff = ((targetAngle - tank.turretAngle + 540) % 360) - 180;
        const turretTurnRate = 30; // 30 градусов в секунду (в 3 раза медленнее)
        const maxTurn = turretTurnRate * delta;
        
        const appliedTurn = Math.abs(angleDiff) > maxTurn 
            ? Math.sign(angleDiff) * maxTurn 
            : angleDiff;
            
        tank.turretAngle = (tank.turretAngle + appliedTurn + 360) % 360;
        this.isTurretMoving = Math.abs(appliedTurn) > 0.01;
    }

    fireProjectile(tank) {
        // Добавляем случайное отклонение на основе разлета
        const spreadRad = (this.aimSpread * (Math.random() - 0.5) * 0.1); 
        const angleRad = (tank.turretAngle * (Math.PI / 180)) + spreadRad;
        
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
                bullet.isDestroyed = true;
                return true;
            }
        }

        // Проверка попадания во врага
        if (this.enemyTank && bullet.ownerId !== this.enemyTank.id && !this.enemyTank.isDestroyed) {
            const dist = Math.hypot(bullet.x - this.enemyTank.x, bullet.y - this.enemyTank.y);
            if (dist < 30) {
                if (!this.isMultiplayer) {
                    this.enemyTank.applyDamage(0.1);
                }
                bullet.isDestroyed = true;
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
