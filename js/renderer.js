/**
 * War Tanks II - Renderer
 * Этот файл отвечает за визуальное представление игры (DOM элементы, анимации).
 */

export class Renderer {
    constructor(worldElement) {
        this.world = worldElement;
        this.tanks = new Map(); // CoreID -> ElementGroup
        this.bullets = new Map(); // CoreBullet -> Element
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

    registerTank(tankCore, variantClass) {
        const elements = this.createTankElements(variantClass);
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
}
