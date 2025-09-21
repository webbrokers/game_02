(function () {
    const { body } = document;
    if (!body) {
        return;
    }

    const navigationDelay = 250;
    let isNavigating = false;

    const scheduleNavigation = (task, { reset = false } = {}) => {
        isNavigating = true;
        window.setTimeout(() => {
            task();
            if (reset) {
                isNavigating = false;
            }
        }, navigationDelay);
    };

    if (body.dataset.disableBgm !== "true") {
        const theme = new Audio("audio/background-themes.mp3");
        theme.loop = true;
        theme.volume = 0.6;

        const tryPlayTheme = () => {
            theme.play().catch(() => {
                /* Autoplay might be blocked until user interaction */
            });
        };

        const unlockTheme = () => {
            tryPlayTheme();
            window.removeEventListener("pointerdown", unlockTheme);
            window.removeEventListener("keydown", unlockTheme);
        };

        tryPlayTheme();
        window.addEventListener("pointerdown", unlockTheme, { once: true });
        window.addEventListener("keydown", unlockTheme, { once: true });

        window.addEventListener("beforeunload", () => {
            theme.pause();
            theme.src = "";
        });
    }

    const hoverSound = new Audio("audio/menu-hover_2.mp3");
    hoverSound.preload = "auto";

    const selectSound = new Audio("audio/menu-select.mp3");
    selectSound.preload = "auto";

    const playSfx = (clip) => {
        clip.currentTime = 0;
        clip.play().catch(() => {
            /* SFX play can fail if not yet allowed; ignore */
        });
    };

    const interactiveButtons = document.querySelectorAll(".menu-link, .retro-button, .play-menu-button");
    interactiveButtons.forEach((element) => {
        element.addEventListener("mouseenter", () => playSfx(hoverSound));
        element.addEventListener("click", (event) => {
            playSfx(selectSound);

            if (isNavigating) {
                event.preventDefault();
                return;
            }

            if (element.matches("a[href]")) {
                const rawHref = element.getAttribute("href") || "";
                const absoluteHref = element.href;
                event.preventDefault();

                scheduleNavigation(() => {
                    if (!rawHref || rawHref === "#") {
                        window.location.hash = "";
                        isNavigating = false;
                        return;
                    }

                    if (rawHref.startsWith("#")) {
                        window.location.hash = rawHref;
                        isNavigating = false;
                        return;
                    }

                    window.location.href = absoluteHref;
                }, { reset: rawHref.startsWith("#") || rawHref === "#" });
            } else if (element.matches("button, input[type=\"submit\"]")) {
                const { form } = element;
                if (!form) {
                    return;
                }

                event.preventDefault();
                scheduleNavigation(() => {
                    form.submit();
                });
            }
        });
    });

    const playfield = document.querySelector(".playfield");
    if (playfield) {
        // Allow dragging the oversized background map inside the fixed viewport.
        const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
        let currentPosX = 50;
        let currentPosY = 50;
        let isDraggingField = false;
        let activePointerId = null;
        let dragStartX = 0;
        let dragStartY = 0;
        let dragOriginPosX = currentPosX;
        let dragOriginPosY = currentPosY;

        const MAP_SCALE = 1.875;
        const MAP_EXTRA_RATIO = MAP_SCALE - 1;

        const setBackgroundPosition = (x, y) => {
            currentPosX = clamp(x, 0, 100);
            currentPosY = clamp(y, 0, 100);
            playfield.style.backgroundPosition = `${currentPosX}% ${currentPosY}%`;
        };

        const shiftBackgroundByPixels = (deltaX, deltaY) => {
            if (deltaX === 0 && deltaY === 0) {
                return;
            }

            const fieldWidth = playfield.clientWidth;
            const fieldHeight = playfield.clientHeight;
            let targetPosX = currentPosX;
            let targetPosY = currentPosY;

            const extraWidth = fieldWidth * MAP_EXTRA_RATIO;
            const extraHeight = fieldHeight * MAP_EXTRA_RATIO;

            if (deltaX !== 0 && extraWidth > 0) {
                targetPosX += (deltaX / extraWidth) * 100;
            }

            if (deltaY !== 0 && extraHeight > 0) {
                targetPosY += (deltaY / extraHeight) * 100;
            }

            setBackgroundPosition(targetPosX, targetPosY);
        };

        setBackgroundPosition(currentPosX, currentPosY);

        playfield.addEventListener("pointerdown", (event) => {
            if (event.button !== 0) {
                return;
            }

            isDraggingField = true;
            activePointerId = event.pointerId;
            dragStartX = event.clientX;
            dragStartY = event.clientY;
            dragOriginPosX = currentPosX;
            dragOriginPosY = currentPosY;
            playfield.classList.add("is-dragging");

            if (typeof playfield.setPointerCapture === "function") {
                try {
                    playfield.setPointerCapture(activePointerId);
                } catch (error) {
                    /* Pointer capture may fail in rare cases; safe to ignore */
                }
            }

            event.preventDefault();
        });

        playfield.addEventListener("pointermove", (event) => {
            if (!isDraggingField || event.pointerId !== activePointerId) {
                return;
            }

            const fieldWidth = playfield.clientWidth;
            const fieldHeight = playfield.clientHeight;
            const extraWidth = fieldWidth * MAP_EXTRA_RATIO;
            const extraHeight = fieldHeight * MAP_EXTRA_RATIO;

            let nextX = dragOriginPosX;
            let nextY = dragOriginPosY;

            if (extraWidth > 0) {
                const deltaX = event.clientX - dragStartX;
                nextX = dragOriginPosX - (deltaX / extraWidth) * 100;
            }

            if (extraHeight > 0) {
                const deltaY = event.clientY - dragStartY;
                nextY = dragOriginPosY - (deltaY / extraHeight) * 100;
            }

            setBackgroundPosition(nextX, nextY);
        });

        const stopDraggingField = () => {
            if (!isDraggingField) {
                return;
            }

            isDraggingField = false;
            playfield.classList.remove("is-dragging");

            if (typeof playfield.releasePointerCapture === "function" && activePointerId !== null) {
                try {
                    playfield.releasePointerCapture(activePointerId);
                } catch (error) {
                    /* Ignore release errors */
                }
            }

            activePointerId = null;
        };

        playfield.addEventListener("pointerup", (event) => {
            if (event.pointerId === activePointerId) {
                stopDraggingField();
            }
        });

        playfield.addEventListener("pointercancel", stopDraggingField);
        playfield.addEventListener("pointerleave", (event) => {
            if (event.pointerId === activePointerId) {
                stopDraggingField();
            }
        });

        const tankRoot = document.createElement("div");
        tankRoot.className = "tank";

        const reloadBar = document.createElement("div");
        reloadBar.className = "tank__reload";
        const reloadFill = document.createElement("div");
        reloadFill.className = "tank__reload-fill";
        reloadBar.appendChild(reloadFill);
        tankRoot.appendChild(reloadBar);

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
        tankRoot.appendChild(chassis);
        playfield.appendChild(tankRoot);

        const tankState = {
            x: playfield.clientWidth / 2,
            y: playfield.clientHeight / 2,
            hullAngle: 0,
            turretAngle: 0,
            reloadTimer: 0,
        };

        const keyState = {
            forward: false,
            backward: false,
            turnLeft: false,
            turnRight: false,
            firing: false,
        };

        const pointerState = {
            x: tankState.x,
            y: tankState.y - 120,
        };

        const bullets = [];
        const DEG_TO_RAD = Math.PI / 180;
        const RAD_TO_DEG = 180 / Math.PI;
        const TURN_SPEED = 140;
        const MOVE_SPEED = 220;
        const FIRE_COOLDOWN = 0.65;
        const BULLET_SPEED = 580;
        const BULLET_LIFETIME = 2.2;
        const halfChassisWidth = 40;
        const halfChassisHeight = 48;
        const bulletHalfSize = 5;

        const updateTankTransform = () => {
            tankRoot.style.transform = `translate3d(${tankState.x}px, ${tankState.y}px, 0)`;
            chassis.style.transform = `translate(-50%, -50%) rotate(${tankState.hullAngle}deg)`;
            const relativeTurret = (tankState.turretAngle - tankState.hullAngle + 360) % 360;
            turret.style.transform = `translate(-50%, -50%) rotate(${relativeTurret}deg)`;
        };

        const updateReloadBar = () => {
            const progress = Math.max(0, Math.min(1, 1 - tankState.reloadTimer / FIRE_COOLDOWN));
            reloadFill.style.transform = `scaleX(${progress})`;
        };

        updateTankTransform();
        updateReloadBar();

        const clampTankPosition = () => {
            tankState.x = clamp(tankState.x, halfChassisWidth, playfield.clientWidth - halfChassisWidth);
            tankState.y = clamp(tankState.y, halfChassisHeight, playfield.clientHeight - halfChassisHeight);
        };

        const updatePointerFromEvent = (event) => {
            const rect = playfield.getBoundingClientRect();
            pointerState.x = event.clientX - rect.left;
            pointerState.y = event.clientY - rect.top;
        };

        window.addEventListener("pointermove", updatePointerFromEvent);

        const forwardComponents = (angleDeg) => {
            const angleRad = angleDeg * DEG_TO_RAD;
            return {
                x: Math.sin(angleRad),
                y: -Math.cos(angleRad),
            };
        };

        const fireProjectile = () => {
            if (tankState.reloadTimer > 0) {
                return;
            }

            const { x: dirX, y: dirY } = forwardComponents(tankState.turretAngle);
            const muzzleDistance = 60;
            const spawnX = tankState.x + dirX * muzzleDistance;
            const spawnY = tankState.y + dirY * muzzleDistance;

            const bulletElement = document.createElement("div");
            bulletElement.className = "tank-bullet";
            playfield.appendChild(bulletElement);

            const bulletState = {
                x: spawnX,
                y: spawnY,
                dirX,
                dirY,
                liveTime: 0,
                element: bulletElement,
            };

            bulletElement.style.transform = `translate3d(${spawnX - bulletHalfSize}px, ${spawnY - bulletHalfSize}px, 0)`;
            bullets.push(bulletState);

            tankState.reloadTimer = FIRE_COOLDOWN;
            updateReloadBar();
        };

        const isInteractiveTarget = (target) => {
            if (!target) {
                return false;
            }

            if (target.isContentEditable) {
                return true;
            }

            const tagName = target.tagName ? target.tagName.toLowerCase() : "";
            return tagName === "input" || tagName === "textarea" || tagName === "select" || tagName === "button";
        };

        const handleKeyChange = (event, isPressed) => {
            if (isInteractiveTarget(event.target)) {
                return;
            }

            const { code } = event;

            switch (code) {
                case "ArrowUp":
                case "KeyW":
                    keyState.forward = isPressed;
                    event.preventDefault();
                    break;
                case "ArrowDown":
                case "KeyS":
                    keyState.backward = isPressed;
                    event.preventDefault();
                    break;
                case "ArrowLeft":
                case "KeyA":
                    keyState.turnLeft = isPressed;
                    event.preventDefault();
                    break;
                case "ArrowRight":
                case "KeyD":
                    keyState.turnRight = isPressed;
                    event.preventDefault();
                    break;
                default:
                    break;
            }

            if (code === "Space") {
                keyState.firing = isPressed;
                event.preventDefault();
            }
        };

        window.addEventListener("keydown", (event) => {
            if (isInteractiveTarget(event.target)) {
                return;
            }

            if (event.repeat) {
                if (event.code === "Space") {
                    event.preventDefault();
                }
                const { code } = event;
                if (code === "ArrowUp" || code === "ArrowDown" || code === "ArrowLeft" || code === "ArrowRight") {
                    event.preventDefault();
                }
            }

            handleKeyChange(event, true);
        });

        window.addEventListener("keyup", (event) => {
            if (isInteractiveTarget(event.target)) {
                return;
            }

            handleKeyChange(event, false);
        });

        let previousTimestamp = performance.now();

        const updateTurretAngle = (deltaSeconds) => {
            const deltaX = pointerState.x - tankState.x;
            const deltaY = pointerState.y - tankState.y;

            if (Math.abs(deltaX) < 0.0001 && Math.abs(deltaY) < 0.0001) {
                return;
            }

            const angleRad = Math.atan2(deltaX, -deltaY);
            let angleDeg = angleRad * RAD_TO_DEG;
            if (angleDeg < 0) {
                angleDeg += 360;
            }

            const current = tankState.turretAngle;
            const diffRaw = ((angleDeg - current + 540) % 360) - 180;

            const maxDelta = 160 * deltaSeconds;
            let appliedDelta = diffRaw;
            if (Math.abs(diffRaw) > maxDelta) {
                appliedDelta = Math.sign(diffRaw) * maxDelta;
            }

            tankState.turretAngle = (current + appliedDelta + 360) % 360;
        };

        const updateBullets = (deltaSeconds) => {
            for (let index = bullets.length - 1; index >= 0; index -= 1) {
                const bullet = bullets[index];
                bullet.x += bullet.dirX * BULLET_SPEED * deltaSeconds;
                bullet.y += bullet.dirY * BULLET_SPEED * deltaSeconds;
                bullet.liveTime += deltaSeconds;

                if (
                    bullet.liveTime > BULLET_LIFETIME ||
                    bullet.x < -20 ||
                    bullet.x > playfield.clientWidth + 20 ||
                    bullet.y < -20 ||
                    bullet.y > playfield.clientHeight + 20
                ) {
                    bullet.element.remove();
                    bullets.splice(index, 1);
                    continue;
                }

                bullet.element.style.transform = `translate3d(${bullet.x - bulletHalfSize}px, ${bullet.y - bulletHalfSize}px, 0)`;
            }
        };

        const step = (timestamp) => {
            const deltaSeconds = Math.min(0.05, (timestamp - previousTimestamp) / 1000);
            previousTimestamp = timestamp;

            const turnInput = (keyState.turnRight ? 1 : 0) - (keyState.turnLeft ? 1 : 0);
            if (turnInput !== 0) {
                tankState.hullAngle = (tankState.hullAngle + turnInput * TURN_SPEED * deltaSeconds + 360) % 360;
            }

            let overflowX = 0;
            let overflowY = 0;

            const moveInput = (keyState.forward ? 1 : 0) - (keyState.backward ? 1 : 0);
            if (moveInput !== 0) {
                const direction = forwardComponents(tankState.hullAngle);
                const fieldWidth = playfield.clientWidth;
                const fieldHeight = playfield.clientHeight;

                const deltaX = direction.x * moveInput * MOVE_SPEED * deltaSeconds;
                const deltaY = direction.y * moveInput * MOVE_SPEED * deltaSeconds;

                const proposedX = tankState.x + deltaX;
                const proposedY = tankState.y + deltaY;

                const clampedX = clamp(proposedX, halfChassisWidth, Math.max(halfChassisWidth, fieldWidth - halfChassisWidth));
                const clampedY = clamp(proposedY, halfChassisHeight, Math.max(halfChassisHeight, fieldHeight - halfChassisHeight));

                overflowX = proposedX - clampedX;
                overflowY = proposedY - clampedY;

                tankState.x = clampedX;
                tankState.y = clampedY;
            }

            if (tankState.reloadTimer > 0) {
                tankState.reloadTimer = Math.max(0, tankState.reloadTimer - deltaSeconds);
                updateReloadBar();
            }

            if (keyState.firing && tankState.reloadTimer <= 0) {
                fireProjectile();
            }

            updateTurretAngle(deltaSeconds);
            updateTankTransform();
            updateBullets(deltaSeconds);

            if ((overflowX !== 0 || overflowY !== 0) && !isDraggingField) {
                shiftBackgroundByPixels(overflowX, overflowY);
            }

            window.requestAnimationFrame(step);
        };

        window.requestAnimationFrame(step);

        window.addEventListener("resize", () => {
            clampTankPosition();
            updateTankTransform();
        });
    }

    const forms = document.querySelectorAll("form");
    forms.forEach((form) => {
        form.addEventListener("submit", (event) => {
            if (isNavigating) {
                event.preventDefault();
                return;
            }

            event.preventDefault();
            playSfx(selectSound);
            scheduleNavigation(() => {
                form.submit();
            });
        });
    });
})();
