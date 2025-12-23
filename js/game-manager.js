import { TankCore, BulletCore, WORLD_WIDTH, WORLD_HEIGHT, TANK_PRESETS } from './core.js';
import { Renderer } from './renderer.js';
import { InputHandler } from './input.js';
import { ConnectionManager } from './connection-manager.js';
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
        this.isMouseMoving = false;
        this.mouseMoveTimer = 0;

        // Throttling для сетевых обновлений (100мс = 10 обновлений/сек)
        this.networkUpdateTimer = 0;
        this.networkUpdateInterval = 0.1; // 100мс

        this.init();
    }

    async init() {
        const params = new URLSearchParams(window.location.search);
        const roomId = params.get('room');
        const tankId = params.get('tank') || 'tiger';
        this.isHost = params.get('host') === '1';

        // Очистка плейфилда от возможного мусора из app.js
        this.playfield.innerHTML = '';

        // Детерминированные ID на основе роли игрока и режима игры
        // В мультиплеере: хост всегда player1, гость всегда player2
        // В синглплеере: игрок всегда player1
        if (roomId) {
            this.myPlayerId = this.isHost ? 'player1' : 'player2';
            this.enemyPlayerId = this.isHost ? 'player2' : 'player1';
        } else {
            this.myPlayerId = 'player1';
            this.enemyPlayerId = 'ai_enemy';
        }

        // Инициализация игрока с детерминированным ID
        this.playerTank = new TankCore({
            id: this.myPlayerId,
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

        // Регистрация своего танка
        // Хост всегда зеленый (P1), гость всегда коричневый (P2)
        const isGreenTank = this.isHost; // Хост = зеленый, гость = коричневый
        this.renderer.registerTank(this.playerTank, TANK_PRESETS[tankId].variantClass, isGreenTank);

        // Слушаем мышь для прицеливания
        this.playfield.addEventListener("pointermove", (e) => {
            const rect = this.playfield.getBoundingClientRect();
            // Пока камера фиксированная, worldX = viewportX (в реальной игре нужно добавить камеру)
            this.input.updatePointer(e, rect, { x: 0, y: 0 }); 
            this.isMouseMoving = true;
            this.mouseMoveTimer = 0.1; // Считаем мышь движущейся еще 0.1с после последнего события
        });

        if (roomId) {
            this.isMultiplayer = true;
            this.playerName = localStorage.getItem('wt2:player-name') || 'Commander';
            this.network = new ConnectionManager(roomId, this.playerName, this.isHost);
            
            // Настройка сетевых коллбэков
            this.network.onPlayerUpdate = (data) => this.handleRemotePlayerUpdate(data);
            this.network.onPlayerFire = (data) => this.handleRemoteFire(data);
            this.network.onConnectionReady = (mode) => {
                console.log(`✅ Подключено через ${mode === 'webrtc' ? 'WebRTC P2P' : 'Supabase Broadcast'}`);
                // Показываем индикатор режима в HUD
                this.currentNetworkMode = mode;
            };
            
            await this.network.connect();
            
            // Инициализация HUD для мультиплеера
            // Хост (P1) слева, гость (P2) справа
            if (this.isHost) {
                this.renderer.initHUD(this.playerName, "Ожидание...");
            } else {
                this.renderer.initHUD("Ожидание...", this.playerName);
            }
        } else {
            // Режим синглплеера - добавляем ИИ
            const pName = localStorage.getItem('wt2:player-name') || 'Commander';
            this.enemyTank = new TankCore({
                id: 'ai_enemy',  // Детерминированный ID для AI
                x: WORLD_WIDTH * 0.75,
                y: WORLD_HEIGHT * 0.35,
                isPlayer: false,
                presetId: 'tiger'
            });
            this.renderer.registerTank(this.enemyTank, "tank--enemy", false);
            
            // В сингле мы всегда P1
            this.renderer.initHUD(pName, "AI: Tiger MK-II");
            this.enemyName = "AI: Tiger MK-II";
        }

        // Инициализация тумана войны
        this.fog = new FogRenderer(this.worldElement);

        // Создаем прицел
        this.aimCursor = this.renderer.createAimCursor();
        this.aimCursor.classList.add("aim-cursor--visible");

        // Отключаем контекстное меню на поле боя
        this.playfield.addEventListener('contextmenu', e => e.preventDefault());

        // Закрытие комнаты при выходе (для хоста)
        window.addEventListener('beforeunload', () => {
            if (this.isHost && this.isMultiplayer && roomId) {
                NetworkHandler.closeRoomBeacon(roomId);
            }
        });

        requestAnimationFrame((t) => this.gameLoop(t));
    }

    handleRemotePlayerUpdate(data) {
        // Детерминированная проверка: обрабатываем только сообщения от противника
        // Игнорируем сообщения с неправильным ID или от самих себя
        if (!data.id || data.id !== this.enemyPlayerId) return;

        if (!this.enemyTank) {
            this.enemyName = data.name || 'Enemy';
            this.enemyTank = new TankCore({
                id: this.enemyPlayerId,  // Используем детерминированный ID противника
                x: data.x,
                y: data.y,
                presetId: data.presetId,
                isPlayer: false
            });
            // Регистрируем вражеский танк
            // Если мы хост (P1 зеленый), то противник P2 коричневый
            // Если мы гость (P2 коричневый), то противник P1 зеленый
            const isEnemyGreen = !this.isHost; // Противник зеленый если мы не хост
            this.renderer.registerTank(this.enemyTank, TANK_PRESETS[data.presetId].variantClass, isEnemyGreen);
            
            // Инициализация целевых значений для интерполяции
            this.enemyTank.targetX = data.x;
            this.enemyTank.targetY = data.y;
            this.enemyTank.targetHullAngle = data.hullAngle || 0;
            this.enemyTank.targetTurretAngle = data.turretAngle || 0;
        }
        
        // Обновляем целевые значения для интерполяции (вместо мгновенного применения)
        // Delta compression - обновляем только переданные поля
        if (data.x !== undefined) this.enemyTank.targetX = data.x;
        if (data.y !== undefined) this.enemyTank.targetY = data.y;
        if (data.hullAngle !== undefined) this.enemyTank.targetHullAngle = data.hullAngle;
        if (data.turretAngle !== undefined) this.enemyTank.targetTurretAngle = data.turretAngle;
        
        // Здоровье и состояние обновляем мгновенно (критичные данные)
        if (data.health !== undefined) this.enemyTank.health = data.health;
        if (data.isDestroyed !== undefined) this.enemyTank.isDestroyed = data.isDestroyed;
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
        } else if (this.isMultiplayer && this.enemyTank) {
            // В мультиплеере применяем интерполяцию для плавности
            this.interpolateEnemyTank(delta);
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
        // HP1 (лево) -> Хост, HP2 (право) -> Гость
        let hpLeft, hpRight, nameLeft, nameRight, rldLeft, rldRight;
        
        const getReloadProgress = (tank) => {
            if (!tank) return 0;
            return 1 - (tank.reloadTimer / tank.settings.fireCooldown);
        };

        // Логика HUD: хост (P1) слева, гость (P2) справа
        if (this.isHost) {
            // Мы хост (P1) - мы слева, противник справа
            hpLeft = this.playerTank ? this.playerTank.health : 0;
            hpRight = this.enemyTank ? this.enemyTank.health : 0;
            nameLeft = this.playerName;
            nameRight = this.enemyName || "Ожидание...";
            rldLeft = getReloadProgress(this.playerTank);
            rldRight = getReloadProgress(this.enemyTank);
        } else {
            // Мы гость (P2) - противник слева, мы справа
            hpLeft = this.enemyTank ? this.enemyTank.health : 0;
            hpRight = this.playerTank ? this.playerTank.health : 0;
            nameLeft = this.enemyName || "Ожидание...";
            nameRight = this.playerName;
            rldLeft = getReloadProgress(this.enemyTank);
            rldRight = getReloadProgress(this.playerTank);
        }

        this.renderer.updateHUD(hpLeft, hpRight, nameLeft, nameRight, rldLeft, rldRight, this.isEnemyVisible || !this.isMultiplayer);

        // 6. Обновление тумана войны
        this.updateEnemyVisibility();
        this.fog.update(this.playerTank, this.enemyTank, this.isEnemyVisible, delta);
        
        // Принудительно скрываем врага, если он вне зоны видимости (и не в синглплеере с читами)
        if (this.enemyTank) {
            this.renderer.setTankVisibility(this.enemyTank.id, this.isEnemyVisible);
        }

        // 7. Сетевая синхронизация (throttled)
        if (this.isMultiplayer && this.playerTank) {
            // Обновляем таймер
            this.networkUpdateTimer += delta;
            
            // Отправляем обновление только раз в 100мс
            if (this.networkUpdateTimer >= this.networkUpdateInterval) {
                this.networkUpdateTimer = 0;
                
                // Используем delta compression для снижения трафика
                this.network.sendPositionDelta({
                    id: this.myPlayerId,  // Отправляем детерминированный ID
                    name: this.playerName,
                    x: this.playerTank.x,
                    y: this.playerTank.y,
                    hullAngle: this.playerTank.hullAngle,
                    turretAngle: this.playerTank.turretAngle,
                    health: this.playerTank.health,
                    isDestroyed: this.playerTank.isDestroyed,
                    presetId: this.playerTank.presetId
                });
            }
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

    /**
     * Интерполяция вражеского танка для плавного движения между обновлениями
     * Компенсирует редкие сетевые обновления (10 раз/сек вместо 60)
     */
    interpolateEnemyTank(delta) {
        if (!this.enemyTank) return;
        
        // Инициализация целевых значений при первом вызове
        if (this.enemyTank.targetX === undefined) {
            this.enemyTank.targetX = this.enemyTank.x;
            this.enemyTank.targetY = this.enemyTank.y;
            this.enemyTank.targetHullAngle = this.enemyTank.hullAngle;
            this.enemyTank.targetTurretAngle = this.enemyTank.turretAngle;
            return;
        }
        
        // Скорость интерполяции (чем выше, тем быстрее догоняет)
        const lerpSpeed = 8; // Догоняет за ~125мс
        const angleLerpSpeed = 10; // Углы чуть быстрее
        
        // Линейная интерполяция позиции
        const dx = this.enemyTank.targetX - this.enemyTank.x;
        const dy = this.enemyTank.targetY - this.enemyTank.y;
        this.enemyTank.x += dx * lerpSpeed * delta;
        this.enemyTank.y += dy * lerpSpeed * delta;
        
        // Интерполяция углов (с учетом кругового характера)
        const interpolateAngle = (current, target, speed) => {
            let diff = ((target - current + 540) % 360) - 180;
            return (current + diff * speed * delta + 360) % 360;
        };
        
        this.enemyTank.hullAngle = interpolateAngle(
            this.enemyTank.hullAngle, 
            this.enemyTank.targetHullAngle, 
            angleLerpSpeed
        );
        
        this.enemyTank.turretAngle = interpolateAngle(
            this.enemyTank.turretAngle, 
            this.enemyTank.targetTurretAngle, 
            angleLerpSpeed
        );
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
        this.aimTurretTowards(this.playerTank, worldMouseX, worldMouseY, delta);

        if (this.mouseMoveTimer > 0) this.mouseMoveTimer -= delta;
        if (this.mouseMoveTimer <= 0) this.isMouseMoving = false;

        if (this.isTurretMoving || this.isMouseMoving) {
            this.aimSpread = Math.min(20, this.aimSpread + (20 / 0.2) * delta); // Быстрое расширение за 0.2с
        } else {
            const shrinkAmount = (20 / 1.0) * delta; // Схождение за 1.0с (согласно ТЗ)
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
        const turretTurnRate = 45; // 45 градусов в секунду (увеличено на 50%)
        const maxTurn = turretTurnRate * delta;
        
        const appliedTurn = Math.abs(angleDiff) > maxTurn 
            ? Math.sign(angleDiff) * maxTurn 
            : angleDiff;
            
        tank.turretAngle = (tank.turretAngle + appliedTurn + 360) % 360;
        this.isTurretMoving = Math.abs(appliedTurn) > 0.01;
    }

    fireProjectile(tank) {
        // Добавляем случайное отклонение на основе разлета
        // Максимальный разброс 10 градусов (±5 градусов) при aimSpread = 20
        const maxSpreadDeg = 15; 
        const currentSpreadDeg = (this.aimSpread / 20) * maxSpreadDeg;
        const spreadRad = (currentSpreadDeg * (Math.random() - 0.5) * 2) * (Math.PI / 180); 
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
