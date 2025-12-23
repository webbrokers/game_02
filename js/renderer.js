/**
 * War Tanks II - Renderer
 * Этот файл отвечает за визуальное представление игры (DOM элементы, анимации).
 */

export class Renderer {
    constructor(worldElement) {
        this.world = worldElement;
        this.tanks = new Map(); // CoreID -> ElementGroup
        this.bullets = new Map(); // CoreBullet -> Element
        this.hud = {
            left: null,
            right: null
        };
    }

    createTankElements(variantClass) {
        const root = document.createElement("div");
        root.className = `tank ${variantClass}`;

        const reloadBar = document.createElement("div");
        reloadBar.className = "tank__reload";
        const reloadFill = document.createElement("div");
        reloadFill.className = "tank__reload-fill";
        reloadBar.appendChild(reloadFill);
        root.appendChild(reloadBar);

        const healthBar = document.createElement("div");
        healthBar.className = "tank__health";
        const healthFill = document.createElement("div");
        healthFill.className = "tank__health-fill";
        healthBar.appendChild(healthFill);
        root.appendChild(healthBar);

        const chassis = document.createElement("div");
        chassis.className = "tank__chassis";

        const body = document.createElement("div");
        body.className = "tank__body";
        const fuelPack = document.createElement("div");
        fuelPack.className = "tank__fuel-pack";
        const front = document.createElement("div");
        front.className = "tank__front";
        body.appendChild(fuelPack);
        body.appendChild(front);

        const turret = document.createElement("div");
        turret.className = "tank__turret";
        const barrel = document.createElement("div");
        barrel.className = "tank__barrel";
        turret.appendChild(barrel);

        const leftTrack = document.createElement("div");
        leftTrack.className = "tank__track tank__track--left";
        const rightTrack = document.createElement("div");
        rightTrack.className = "tank__track tank__track--right";

        chassis.appendChild(leftTrack);
        chassis.appendChild(rightTrack);
        chassis.appendChild(body);
        chassis.appendChild(turret);
        root.appendChild(chassis);

        return {
            root,
            chassis,
            turret,
            reloadFill,
            healthFill,
        };
    }

    registerTank(tankCore, variantClass, role = 'p1') {
        // P1 всегда использует базовый класс (зеленый), P2 всегда использует вражеский класс (коричневый)
        const finalClass = role === 'p1' ? 'tank--player' : 'tank--enemy';
        // Также добавляем специфичный класс пресета (tiger/phantom/crusher)
        const presetClass = variantClass.includes('tiger') ? 'tank--tiger-mk-ii' : 
                           (variantClass.includes('phantom') ? 'tank--phantom-x' : 'tank--crusher-88');
        
        const elements = this.createTankElements(`${finalClass} ${presetClass}`);
        this.world.appendChild(elements.root);
        this.tanks.set(tankCore.id, elements);
    }

    updateCamera(camera) {
        // Сдвигаем мир в обратную сторону от камеры
        this.world.style.transform = `translate3d(${-camera.x}px, ${-camera.y}px, 0)`;
    }

    updateTank(tankCore) {
        const elements = this.tanks.get(tankCore.id);
        if (!elements) return;

        const { root, chassis, turret, reloadFill, healthFill } = elements;
        
        root.style.transform = `translate3d(${tankCore.x}px, ${tankCore.y}px, 0)`;
        chassis.style.transform = `translate(-50%, -50%) rotate(${tankCore.hullAngle}deg)`;
        
        const relativeTurret = (tankCore.turretAngle - tankCore.hullAngle + 360) % 360;
        turret.style.transform = `translate(-50%, -50%) rotate(${relativeTurret}deg)`;

        // Обновление полосок
        const reloadProgress = 1 - (tankCore.reloadTimer / tankCore.settings.fireCooldown);
        reloadFill.style.transform = `scaleX(${Math.max(0, Math.min(1, reloadProgress))})`;
        healthFill.style.transform = `scaleX(${Math.max(0, Math.min(1, tankCore.health))})`;

        if (tankCore.isDestroyed) {
            root.classList.add("tank--destroyed");
        }
    }

    createBulletElement(isPlayer) {
        const bulletElement = document.createElement("div");
        bulletElement.className = `tank-bullet ${isPlayer ? "tank-bullet--player" : "tank-bullet--enemy"}`;
        this.world.appendChild(bulletElement);
        return bulletElement;
    }

    removeBullet(bulletElement) {
        bulletElement.remove();
    }

    updateBullet(bulletCore, element) {
        element.style.transform = `translate3d(${bulletCore.x - 5}px, ${bulletCore.y - 5}px, 0)`;
    }

    setTankVisibility(tankId, visible) {
        const elements = this.tanks.get(tankId);
        if (elements) {
            elements.root.style.display = visible ? "block" : "none";
        }
    }

    createAimCursor() {
        const cursor = document.createElement("div");
        cursor.className = "aim-cursor";
        
        const dot = document.createElement("div");
        dot.className = "aim-cursor__dot";
        cursor.appendChild(dot);

        ["top", "bottom", "left", "right"].forEach(pos => {
            const line = document.createElement("div");
            line.className = `aim-cursor__cross aim-cursor__cross--${pos}`;
            cursor.appendChild(line);
        });

        this.world.appendChild(cursor);
        return cursor;
    }

    updateAimCursor(cursor, x, y, spread = 0) {
        cursor.style.transform = `translate3d(${x}px, ${y}px, 0) translate(-50%, -50%)`;
        cursor.style.setProperty('--spread', `${spread}px`);
    }

    initHUD(p1Name, p2Name) {
        const hudContainer = document.createElement("div");
        hudContainer.className = "player-hud";
        
        const createPlayerInfo = (name, side) => {
            const player = document.createElement("div");
            player.className = `hud-player hud-player--${side}`;
            
            const header = document.createElement("div");
            header.className = "hud-header";
            
            const avatar = document.createElement("div");
            avatar.className = "hud-avatar";
            avatar.textContent = side === "left" ? "P1" : "P2";
            
            const nameEl = document.createElement("div");
            nameEl.className = "hud-name";
            nameEl.textContent = name;
            
            header.appendChild(avatar);
            header.appendChild(nameEl);
            
            const bar = document.createElement("div");
            bar.className = "hud-bar";
            
            const fill = document.createElement("div");
            fill.className = "hud-fill";
            
            const label = document.createElement("div");
            label.className = "hud-label";
            label.textContent = "100%";
            
            bar.appendChild(fill);
            bar.appendChild(label);
            
            const reloadBar = document.createElement("div");
            reloadBar.className = "hud-reload-bar";
            const reloadFill = document.createElement("div");
            reloadFill.className = "hud-reload-fill";
            reloadBar.appendChild(reloadFill);
            
            player.appendChild(header);
            player.appendChild(bar);
            player.appendChild(reloadBar);
            
            return { root: player, fill, label, reloadFill };
        };

        this.hud.left = createPlayerInfo(p1Name, "left");
        this.hud.right = createPlayerInfo(p2Name || "Ожидание...", "right");
        
        hudContainer.appendChild(this.hud.left.root);
        hudContainer.appendChild(this.hud.right.root);
        
        document.body.appendChild(hudContainer);
    }

    updateHUD(hp1, hp2, name1, name2, rld1, rld2, p2Visible = true) {
        if (this.hud.left) {
            if (name1 && this.hud.left.root.querySelector('.hud-name').textContent === "Загрузка...") {
                this.hud.left.root.querySelector('.hud-name').textContent = name1;
            }
            const p1Val = Math.max(0, Math.ceil(hp1 * 100));
            this.hud.left.fill.style.width = `${p1Val}%`;
            this.hud.left.label.textContent = `${p1Val}%`;
            if (this.hud.left.reloadFill) {
                this.hud.left.reloadFill.style.transform = `scaleX(${Math.max(0, Math.min(1, rld1))})`;
            }
        }
        if (this.hud.right) {
            if (name2 && (this.hud.right.root.querySelector('.hud-name').textContent === "Ожидание..." || 
                         this.hud.right.root.querySelector('.hud-name').textContent === "Загрузка...")) {
                this.hud.right.root.querySelector('.hud-name').textContent = name2;
            }
            
            const p2Val = Math.max(0, Math.ceil(hp2 * 100));
            if (p2Visible) {
                this.hud.right.fill.style.width = `${p2Val}%`;
                this.hud.right.label.textContent = `${p2Val}%`;
                this.hud.right.root.classList.remove('hud-player--hidden');
                if (this.hud.right.reloadFill) {
                    this.hud.right.reloadFill.style.transform = `scaleX(${Math.max(0, Math.min(1, rld2))})`;
                }
            } else {
                this.hud.right.label.textContent = "???";
                this.hud.right.root.classList.add('hud-player--hidden');
                if (this.hud.right.reloadFill) {
                    this.hud.right.reloadFill.style.transform = `scaleX(0)`;
                }
            }
        }
    }
}
