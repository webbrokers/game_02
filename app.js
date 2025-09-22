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

    const tankShotSound = new Audio("audio/tank-shot.wav");
    tankShotSound.preload = "auto";
    tankShotSound.volume = 1;

    const playSfx = (clip) => {
        clip.currentTime = 0;
        clip.play().catch(() => {
            /* SFX play can fail if not yet allowed; ignore */
        });
    };

    const playTankShot = () => {
        const instance = tankShotSound.cloneNode();
        instance.volume = tankShotSound.volume;
        playSfx(instance);
    };

    const wiredInteractiveElements = new WeakSet();
    const registerInteractiveElement = (element) => {
        if (!element || wiredInteractiveElements.has(element)) {
            return;
        }

        wiredInteractiveElements.add(element);

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
    };

    const interactiveButtons = document.querySelectorAll(".menu-link, .retro-button, .play-menu-button");
    interactiveButtons.forEach(registerInteractiveElement);

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

        const createTankElements = (variant) => {
            const root = document.createElement("div");
            root.className = `tank ${variant}`;

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
        };

        const createTank = ({ x, y, variant, isPlayer }) => {
            const elements = createTankElements(variant);
            playfield.appendChild(elements.root);
            return {
                elements,
                state: {
                    x,
                    y,
                    hullAngle: 0,
                    turretAngle: 0,
                    reloadTimer: 0,
                    health: 1,
                    isPlayer,
                    isDestroyed: false,
                },
            };
        };

        const playerTank = createTank({
            x: playfield.clientWidth / 2,
            y: playfield.clientHeight / 2,
            variant: "tank--player",
            isPlayer: true,
        });

        const enemyTank = createTank({
            x: playfield.clientWidth * 0.75,
            y: playfield.clientHeight * 0.35,
            variant: "tank--enemy",
            isPlayer: false,
        });

        const allTanks = [playerTank, enemyTank];

        const tankState = playerTank.state;
        const enemyState = enemyTank.state;
        const enemyAiState = {
            mode: "search",
            playerVisible: false,
            reactionTimer: 0,
            searchTarget: null,
            searchIdleTime: 0,
            lastSeenPosition: null,
            pendingInvestigate: false,
            playerVisibilityTimer: 0,
            seenByPlayerTimer: 0,
            visibleToPlayer: false,
        };

        const fogCanvas = document.createElement("canvas");
        fogCanvas.className = "playfield__fog";
        const fogCtx = fogCanvas.getContext("2d");
        playfield.appendChild(fogCanvas);

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

        const MissionOutcome = Object.freeze({
            NONE: null,
            FAILED: "failed",
            COMPLETED: "completed",
        });

        let missionOutcome = MissionOutcome.NONE;

        const missionOverlay = document.createElement("div");
        missionOverlay.className = "mission-overlay";
        missionOverlay.setAttribute("aria-hidden", "true");

        const missionOverlayPanel = document.createElement("div");
        missionOverlayPanel.className = "mission-overlay__panel";
        missionOverlayPanel.setAttribute("role", "dialog");
        missionOverlayPanel.setAttribute("aria-modal", "true");

        const missionTitle = document.createElement("div");
        missionTitle.className = "mission-overlay__title";
        const missionTitleId = "mission-overlay-title";
        missionTitle.id = missionTitleId;
        missionOverlayPanel.setAttribute("aria-labelledby", missionTitleId);

        const missionActions = document.createElement("div");
        missionActions.className = "mission-overlay__actions";

        const missionActionButton = document.createElement("a");
        missionActionButton.className = "retro-button mission-overlay__button";
        missionActionButton.setAttribute("href", "#");
        missionActions.appendChild(missionActionButton);

        missionOverlayPanel.appendChild(missionTitle);
        missionOverlayPanel.appendChild(missionActions);
        missionOverlay.appendChild(missionOverlayPanel);
        playfield.appendChild(missionOverlay);

        registerInteractiveElement(missionActionButton);

        const resetInputState = () => {
            keyState.forward = false;
            keyState.backward = false;
            keyState.turnLeft = false;
            keyState.turnRight = false;
            keyState.firing = false;
        };

        const showMissionOverlay = ({
            title,
            buttonLabel,
            buttonHref,
            modifierClass,
        }) => {
            missionOverlay.classList.remove(
                "mission-overlay--failed",
                "mission-overlay--completed",
            );

            if (modifierClass) {
                missionOverlay.classList.add(modifierClass);
            }

            missionTitle.textContent = title;
            missionActionButton.textContent = buttonLabel;
            missionActionButton.setAttribute("href", buttonHref);
            missionOverlay.classList.add("mission-overlay--visible");
            missionOverlay.setAttribute("aria-hidden", "false");

            window.setTimeout(() => {
                try {
                    missionActionButton.focus({ preventScroll: true });
                } catch (error) {
                    missionActionButton.focus();
                }
            }, 50);
        };

        const bullets = [];
        const DEG_TO_RAD = Math.PI / 180;
        const RAD_TO_DEG = 180 / Math.PI;
        const TURN_SPEED = 140;
        const MOVE_SPEED = 220;
        const FIRE_COOLDOWN = 1.5;
        const BULLET_SPEED = 580;
        const BULLET_LIFETIME = 2.2;
        const DAMAGE_PER_HIT = 0.2;
        const halfChassisWidth = 40;
        const halfChassisHeight = 48;
        const bulletHalfSize = 5;
        const FOG_CELL_SIZE = 16;
        const FOG_RESTORE_SECONDS = 3;
        const FOG_BASE_ALPHA = 0.45;
        const tankBaseSize = Math.max(halfChassisWidth, halfChassisHeight);
        const fogInnerRadius = tankBaseSize * 5;
        const fogFalloffRadius = tankBaseSize * 2;
        const fogOuterRadius = fogInnerRadius + fogFalloffRadius;
        let fogCols = 0;
        let fogRows = 0;
        let fogAlpha = new Float32Array(0);
        const VISION_RADIUS = fogOuterRadius;
        const ENEMY_REACTION_DELAY = 0.5;
        const ENEMY_SEARCH_SPEED_FACTOR = 0.65;
        const ENEMY_SEARCH_TURN_RATE = TURN_SPEED * 0.75;
        const ENEMY_SEARCH_TARGET_RADIUS = 96;
        const ENEMY_SEARCH_IDLE_MIN = 0.5;
        const ENEMY_SEARCH_IDLE_MAX = 1.5;
        const VISIBILITY_MEMORY_SECONDS = 1;

        const randomInRange = (min, max) => Math.random() * (max - min) + min;

        const pickEnemySearchTarget = () => {
            const minX = halfChassisWidth;
            const maxX = Math.max(minX, playfield.clientWidth - halfChassisWidth);
            const minY = halfChassisHeight;
            const maxY = Math.max(minY, playfield.clientHeight - halfChassisHeight);
            return {
                x: randomInRange(minX, maxX),
                y: randomInRange(minY, maxY),
            };
        };

        enemyAiState.searchTarget = pickEnemySearchTarget();

        const initializeFogGrid = () => {
            const width = playfield.clientWidth;
            const height = playfield.clientHeight;
            fogCanvas.width = width;
            fogCanvas.height = height;
            fogCols = Math.ceil(width / FOG_CELL_SIZE);
            fogRows = Math.ceil(height / FOG_CELL_SIZE);
            fogAlpha = new Float32Array(fogCols * fogRows);
            if (fogCtx) {
                fogCtx.clearRect(0, 0, width, height);
            }
        };

        const ensureFogGrid = () => {
            if (
                fogCanvas.width !== playfield.clientWidth ||
                fogCanvas.height !== playfield.clientHeight ||
                fogAlpha.length === 0
            ) {
                initializeFogGrid();
            }
        };

        const updateFogField = (deltaSeconds) => {
            ensureFogGrid();
            if (!fogCtx || fogCols === 0 || fogRows === 0) {
                return;
            }

            if (deltaSeconds > 0) {
                const decay = deltaSeconds / FOG_RESTORE_SECONDS;
                for (let i = 0; i < fogAlpha.length; i += 1) {
                    const value = fogAlpha[i] - decay;
                    fogAlpha[i] = value > 0 ? value : 0;
                }
            }

            const innerRadiusSq = fogInnerRadius * fogInnerRadius;
            const outerRadiusSq = fogOuterRadius * fogOuterRadius;
            const falloffRange = fogOuterRadius - fogInnerRadius || 1;
            const cellHalf = FOG_CELL_SIZE / 2;

            const applyReveal = (centerX, centerY) => {
                const minCol = Math.max(0, Math.floor((centerX - fogOuterRadius) / FOG_CELL_SIZE));
                const maxCol = Math.min(fogCols - 1, Math.floor((centerX + fogOuterRadius) / FOG_CELL_SIZE));
                const minRow = Math.max(0, Math.floor((centerY - fogOuterRadius) / FOG_CELL_SIZE));
                const maxRow = Math.min(fogRows - 1, Math.floor((centerY + fogOuterRadius) / FOG_CELL_SIZE));

                for (let row = minRow; row <= maxRow; row += 1) {
                    const cellCenterY = row * FOG_CELL_SIZE + cellHalf;
                    const dy = cellCenterY - centerY;
                    const dySq = dy * dy;
                    for (let col = minCol; col <= maxCol; col += 1) {
                        const cellCenterX = col * FOG_CELL_SIZE + cellHalf;
                        const dx = cellCenterX - centerX;
                        const distSq = dx * dx + dySq;
                        if (distSq > outerRadiusSq) {
                            continue;
                        }

                        let influence = 0;
                        if (distSq <= innerRadiusSq) {
                            influence = 1;
                        } else {
                            const dist = Math.sqrt(distSq);
                            influence = 1 - (dist - fogInnerRadius) / falloffRange;
                        }

                        const index = row * fogCols + col;
                        if (influence > fogAlpha[index]) {
                            fogAlpha[index] = influence;
                        }
                    }
                }
            };

            applyReveal(tankState.x, tankState.y);

            if (!enemyState.isDestroyed && enemyAiState.visibleToPlayer) {
                applyReveal(enemyState.x, enemyState.y);
            }
        };

        const renderFog = (deltaSeconds) => {
            if (!fogCtx) {
                return;
            }

            if (missionOutcome === MissionOutcome.COMPLETED) {
                fogCanvas.classList.add("playfield__fog--disabled");
                fogCtx.clearRect(0, 0, fogCanvas.width, fogCanvas.height);
                return;
            }

            fogCanvas.classList.remove("playfield__fog--disabled");

            if (missionOutcome === MissionOutcome.FAILED) {
                ensureFogGrid();

                const { width, height } = fogCanvas;
                fogCtx.clearRect(0, 0, width, height);
                fogCtx.globalCompositeOperation = "source-over";
                fogCtx.globalAlpha = 1;
                fogCtx.fillStyle = "rgba(8, 11, 16, 0.92)";
                fogCtx.fillRect(0, 0, width, height);

                const ghostRadius = fogOuterRadius * 0.45;
                const ghostInnerRadius = ghostRadius * 0.35;
                fogCtx.globalCompositeOperation = "destination-out";

                const gradient = fogCtx.createRadialGradient(
                    tankState.x,
                    tankState.y,
                    ghostInnerRadius,
                    tankState.x,
                    tankState.y,
                    ghostRadius,
                );

                gradient.addColorStop(0, "rgba(0, 0, 0, 0.75)");
                gradient.addColorStop(1, "rgba(0, 0, 0, 0)");

                fogCtx.fillStyle = gradient;
                fogCtx.beginPath();
                fogCtx.arc(tankState.x, tankState.y, ghostRadius, 0, Math.PI * 2);
                fogCtx.fill();

                fogCtx.globalCompositeOperation = "source-over";
                fogCtx.globalAlpha = 1;
                return;
            }

            updateFogField(deltaSeconds);

            const { width, height } = fogCanvas;
            fogCtx.clearRect(0, 0, width, height);
            fogCtx.globalCompositeOperation = "source-over";
            fogCtx.globalAlpha = 1;
            fogCtx.fillStyle = `rgba(8, 11, 16, ${FOG_BASE_ALPHA})`;
            fogCtx.fillRect(0, 0, width, height);

            fogCtx.globalCompositeOperation = "destination-out";
            const cellHalf = FOG_CELL_SIZE / 2;
            const baseRadius = FOG_CELL_SIZE * 0.9;
            for (let row = 0; row < fogRows; row += 1) {
                const centerY = row * FOG_CELL_SIZE + cellHalf;
                for (let col = 0; col < fogCols; col += 1) {
                    const alpha = fogAlpha[row * fogCols + col];
                    if (alpha <= 0) {
                        continue;
                    }

                    const centerX = col * FOG_CELL_SIZE + cellHalf;
                    fogCtx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
                    fogCtx.beginPath();
                    fogCtx.arc(centerX, centerY, baseRadius, 0, Math.PI * 2);
                    fogCtx.fill();
                }
            }

            fogCtx.globalCompositeOperation = "source-over";
            fogCtx.globalAlpha = 1;
        };

        const updateTankTransform = (tank) => {
            const { state, elements } = tank;
            elements.root.style.transform = `translate3d(${state.x}px, ${state.y}px, 0)`;
            elements.chassis.style.transform = `translate(-50%, -50%) rotate(${state.hullAngle}deg)`;
            const relativeTurret = (state.turretAngle - state.hullAngle + 360) % 360;
            elements.turret.style.transform = `translate(-50%, -50%) rotate(${relativeTurret}deg)`;
        };

        const updateReloadBar = (tank) => {
            const progress = Math.max(0, Math.min(1, 1 - tank.state.reloadTimer / FIRE_COOLDOWN));
            tank.elements.reloadFill.style.transform = `scaleX(${progress})`;
        };

        const updateHealthBar = (tank) => {
            tank.elements.healthFill.style.transform = `scaleX(${Math.max(0, Math.min(1, tank.state.health))})`;
        };

        allTanks.forEach((tank) => {
            updateTankTransform(tank);
            updateReloadBar(tank);
            updateHealthBar(tank);
        });

        const handleMissionFailed = () => {
            if (missionOutcome !== MissionOutcome.NONE) {
                return;
            }

            missionOutcome = MissionOutcome.FAILED;
            resetInputState();
            playerTank.elements.root.classList.add("tank--ghost");

            showMissionOverlay({
                title: "MISSION FAILED",
                buttonLabel: "пойти на завод",
                buttonHref: "select.html",
                modifierClass: "mission-overlay--failed",
            });
        };

        const handleMissionCompleted = () => {
            if (missionOutcome !== MissionOutcome.NONE) {
                return;
            }

            missionOutcome = MissionOutcome.COMPLETED;
            resetInputState();

            showMissionOverlay({
                title: "MISSION COMPLET",
                buttonLabel: "Далее",
                buttonHref: "menu.html",
                modifierClass: "mission-overlay--completed",
            });
        };

        const applyDamage = (tank, amount) => {
            if (tank.state.isDestroyed) {
                return;
            }

            tank.state.health = Math.max(0, tank.state.health - amount);
            updateHealthBar(tank);

            if (tank.state.health <= 0) {
                tank.state.isDestroyed = true;
                tank.elements.root.classList.add("tank--destroyed");

                if (tank.state.isPlayer) {
                    handleMissionFailed();
                } else {
                    handleMissionCompleted();
                }
            }
        };

        const clampTankPosition = (tank) => {
            tank.state.x = clamp(tank.state.x, halfChassisWidth, playfield.clientWidth - halfChassisWidth);
            tank.state.y = clamp(tank.state.y, halfChassisHeight, playfield.clientHeight - halfChassisHeight);
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

        const fireProjectile = (tank) => {
            if (tank.state.reloadTimer > 0 || tank.state.isDestroyed) {
                return;
            }

            const { x: dirX, y: dirY } = forwardComponents(tank.state.turretAngle);
            const muzzleDistance = 60;
            const spawnX = tank.state.x + dirX * muzzleDistance;
            const spawnY = tank.state.y + dirY * muzzleDistance;

            const bulletElement = document.createElement("div");
            bulletElement.className = `tank-bullet ${tank.state.isPlayer ? "tank-bullet--player" : "tank-bullet--enemy"}`;
            playfield.appendChild(bulletElement);

            const bulletState = {
                x: spawnX,
                y: spawnY,
                dirX,
                dirY,
                liveTime: 0,
                element: bulletElement,
                owner: tank,
            };

            bulletElement.style.transform = `translate3d(${spawnX - bulletHalfSize}px, ${spawnY - bulletHalfSize}px, 0)`;
            bullets.push(bulletState);

            tank.state.reloadTimer = FIRE_COOLDOWN;
            updateReloadBar(tank);
            playTankShot();
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

        const aimTurretTowards = (tank, targetX, targetY, deltaSeconds, turnRate = 160) => {
            if (tank.state.isDestroyed) {
                return;
            }

            const deltaX = targetX - tank.state.x;
            const deltaY = targetY - tank.state.y;

            if (Math.abs(deltaX) < 0.0001 && Math.abs(deltaY) < 0.0001) {
                return;
            }

            const angleRad = Math.atan2(deltaX, -deltaY);
            let angleDeg = angleRad * RAD_TO_DEG;
            if (angleDeg < 0) {
                angleDeg += 360;
            }

            const current = tank.state.turretAngle;
            const diffRaw = ((angleDeg - current + 540) % 360) - 180;

            const maxDelta = turnRate * deltaSeconds;
            let appliedDelta = diffRaw;
            if (Math.abs(diffRaw) > maxDelta) {
                appliedDelta = Math.sign(diffRaw) * maxDelta;
            }

            tank.state.turretAngle = (current + appliedDelta + 360) % 360;
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

                let hasHit = false;
                for (let targetIndex = 0; targetIndex < allTanks.length; targetIndex += 1) {
                    const targetTank = allTanks[targetIndex];
                    if (targetTank === bullet.owner || targetTank.state.isDestroyed) {
                        continue;
                    }

                    const dx = bullet.x - targetTank.state.x;
                    const dy = bullet.y - targetTank.state.y;
                    if (Math.abs(dx) <= halfChassisWidth && Math.abs(dy) <= halfChassisHeight) {
                        applyDamage(targetTank, DAMAGE_PER_HIT);
                        bullet.element.remove();
                        bullets.splice(index, 1);
                        hasHit = true;
                        break;
                    }
                }

                if (hasHit) {
                    continue;
                }

                bullet.element.style.transform = `translate3d(${bullet.x - bulletHalfSize}px, ${bullet.y - bulletHalfSize}px, 0)`;
            }
        };

        const updateEnemyBehavior = (deltaSeconds) => {
            if (enemyState.isDestroyed || tankState.isDestroyed) {
                return;
            }

            const wasPlayerVisible = enemyAiState.playerVisible;

            const targetX = tankState.x;
            const targetY = tankState.y;
            const deltaX = targetX - enemyState.x;
            const deltaY = targetY - enemyState.y;
            const distanceToPlayer = Math.hypot(deltaX, deltaY);
            const hasDirectSight = distanceToPlayer <= VISION_RADIUS;

            if (hasDirectSight) {
                enemyAiState.playerVisibilityTimer = VISIBILITY_MEMORY_SECONDS;
                enemyAiState.lastSeenPosition = { x: targetX, y: targetY };
            }

            const playerVisible = hasDirectSight || enemyAiState.playerVisibilityTimer > 0;
            enemyAiState.playerVisible = playerVisible;

            if (!hasDirectSight && enemyAiState.playerVisibilityTimer > 0) {
                enemyAiState.playerVisibilityTimer = Math.max(
                    0,
                    enemyAiState.playerVisibilityTimer - deltaSeconds,
                );
            }

            if (playerVisible && !wasPlayerVisible) {
                enemyAiState.reactionTimer = ENEMY_REACTION_DELAY;
                enemyAiState.mode = "alert";
            }

            if (hasDirectSight) {
                enemyAiState.seenByPlayerTimer = VISIBILITY_MEMORY_SECONDS;
            }

            const enemyVisibleToPlayer = hasDirectSight || enemyAiState.seenByPlayerTimer > 0;
            enemyAiState.visibleToPlayer = enemyVisibleToPlayer;
            enemyTank.elements.root.classList.toggle("tank--hidden", !enemyVisibleToPlayer);

            if (!hasDirectSight && enemyAiState.seenByPlayerTimer > 0) {
                enemyAiState.seenByPlayerTimer = Math.max(
                    0,
                    enemyAiState.seenByPlayerTimer - deltaSeconds,
                );
            }

            if (playerVisible) {
                let desiredAngle = Math.atan2(deltaX, -deltaY) * RAD_TO_DEG;
                if (desiredAngle < 0) {
                    desiredAngle += 360;
                }

                const hullDiff = ((desiredAngle - enemyState.hullAngle + 540) % 360) - 180;
                const hullMax = TURN_SPEED * deltaSeconds;
                const appliedHull = Math.abs(hullDiff) > hullMax
                    ? Math.sign(hullDiff) * hullMax
                    : hullDiff;
                enemyState.hullAngle = (enemyState.hullAngle + appliedHull + 360) % 360;

                aimTurretTowards(enemyTank, targetX, targetY, deltaSeconds);

                if (enemyAiState.reactionTimer > 0) {
                    enemyAiState.reactionTimer = Math.max(0, enemyAiState.reactionTimer - deltaSeconds);
                    if (enemyAiState.reactionTimer > 0) {
                        return;
                    }
                }

                enemyAiState.mode = "engage";

                let moveInput = 0;
                if (distanceToPlayer > 320) {
                    moveInput = 1;
                } else if (distanceToPlayer < 160) {
                    moveInput = -1;
                }

                if (moveInput !== 0) {
                    const direction = forwardComponents(enemyState.hullAngle);
                    const moveX = direction.x * moveInput * MOVE_SPEED * deltaSeconds;
                    const moveY = direction.y * moveInput * MOVE_SPEED * deltaSeconds;

                    const proposedX = enemyState.x + moveX;
                    const proposedY = enemyState.y + moveY;

                    enemyState.x = clamp(
                        proposedX,
                        halfChassisWidth,
                        Math.max(halfChassisWidth, playfield.clientWidth - halfChassisWidth),
                    );
                    enemyState.y = clamp(
                        proposedY,
                        halfChassisHeight,
                        Math.max(halfChassisHeight, playfield.clientHeight - halfChassisHeight),
                    );
                }

                const turretDiff = Math.abs(((desiredAngle - enemyState.turretAngle + 540) % 360) - 180);
                if (enemyState.reloadTimer <= 0 && turretDiff < 12 && distanceToPlayer <= 600) {
                    fireProjectile(enemyTank);
                }

                return;
            }

            if (wasPlayerVisible) {
                enemyAiState.mode = "search";
                enemyAiState.pendingInvestigate = Boolean(enemyAiState.lastSeenPosition);
                enemyAiState.searchTarget = enemyAiState.pendingInvestigate
                    ? { ...enemyAiState.lastSeenPosition }
                    : pickEnemySearchTarget();
                enemyAiState.searchIdleTime = enemyAiState.pendingInvestigate
                    ? 0
                    : randomInRange(ENEMY_SEARCH_IDLE_MIN, ENEMY_SEARCH_IDLE_MAX);
            }

            enemyAiState.reactionTimer = 0;

            if (enemyAiState.searchIdleTime > 0) {
                enemyAiState.searchIdleTime = Math.max(0, enemyAiState.searchIdleTime - deltaSeconds);
                const forward = forwardComponents(enemyState.hullAngle);
                const lookX = enemyState.x + forward.x * 180;
                const lookY = enemyState.y + forward.y * 180;
                aimTurretTowards(enemyTank, lookX, lookY, deltaSeconds, 60);
                return;
            }

            if (!enemyAiState.searchTarget) {
                enemyAiState.searchTarget = pickEnemySearchTarget();
            }

            const searchTarget = enemyAiState.searchTarget;
            const searchDeltaX = searchTarget.x - enemyState.x;
            const searchDeltaY = searchTarget.y - enemyState.y;
            const distanceToTarget = Math.hypot(searchDeltaX, searchDeltaY);

            if (distanceToTarget < ENEMY_SEARCH_TARGET_RADIUS) {
                if (enemyAiState.pendingInvestigate) {
                    enemyAiState.pendingInvestigate = false;
                    enemyAiState.lastSeenPosition = null;
                }
                enemyAiState.searchIdleTime = randomInRange(ENEMY_SEARCH_IDLE_MIN, ENEMY_SEARCH_IDLE_MAX);
                enemyAiState.searchTarget = pickEnemySearchTarget();
                return;
            }

            const angleRad = Math.atan2(searchDeltaX, -searchDeltaY);
            let angleDeg = angleRad * RAD_TO_DEG;
            if (angleDeg < 0) {
                angleDeg += 360;
            }

            const searchHullDiff = ((angleDeg - enemyState.hullAngle + 540) % 360) - 180;
            const searchMax = ENEMY_SEARCH_TURN_RATE * deltaSeconds;
            const appliedSearch = Math.abs(searchHullDiff) > searchMax
                ? Math.sign(searchHullDiff) * searchMax
                : searchHullDiff;
            enemyState.hullAngle = (enemyState.hullAngle + appliedSearch + 360) % 360;

            const direction = forwardComponents(enemyState.hullAngle);
            const moveX = direction.x * MOVE_SPEED * ENEMY_SEARCH_SPEED_FACTOR * deltaSeconds;
            const moveY = direction.y * MOVE_SPEED * ENEMY_SEARCH_SPEED_FACTOR * deltaSeconds;

            const proposedX = enemyState.x + moveX;
            const proposedY = enemyState.y + moveY;

            enemyState.x = clamp(
                proposedX,
                halfChassisWidth,
                Math.max(halfChassisWidth, playfield.clientWidth - halfChassisWidth),
            );
            enemyState.y = clamp(
                proposedY,
                halfChassisHeight,
                Math.max(halfChassisHeight, playfield.clientHeight - halfChassisHeight),
            );

            const sweepX = enemyState.x + direction.x * 180;
            const sweepY = enemyState.y + direction.y * 180;
            aimTurretTowards(enemyTank, sweepX, sweepY, deltaSeconds, 90);
        };

        const step = (timestamp) => {
            const deltaSeconds = Math.min(0.05, (timestamp - previousTimestamp) / 1000);
            previousTimestamp = timestamp;

            let overflowX = 0;
            let overflowY = 0;

            if (!tankState.isDestroyed) {
                const turnInput = (keyState.turnRight ? 1 : 0) - (keyState.turnLeft ? 1 : 0);
                if (turnInput !== 0) {
                    tankState.hullAngle = (tankState.hullAngle + turnInput * TURN_SPEED * deltaSeconds + 360) % 360;
                }

                const moveInput = (keyState.forward ? 1 : 0) - (keyState.backward ? 1 : 0);
                if (moveInput !== 0) {
                    const direction = forwardComponents(tankState.hullAngle);
                    const fieldWidth = playfield.clientWidth;
                    const fieldHeight = playfield.clientHeight;

                    const deltaMoveX = direction.x * moveInput * MOVE_SPEED * deltaSeconds;
                    const deltaMoveY = direction.y * moveInput * MOVE_SPEED * deltaSeconds;

                    const proposedX = tankState.x + deltaMoveX;
                    const proposedY = tankState.y + deltaMoveY;

                    const clampedX = clamp(
                        proposedX,
                        halfChassisWidth,
                        Math.max(halfChassisWidth, fieldWidth - halfChassisWidth),
                    );
                    const clampedY = clamp(
                        proposedY,
                        halfChassisHeight,
                        Math.max(halfChassisHeight, fieldHeight - halfChassisHeight),
                    );

                    overflowX = proposedX - clampedX;
                    overflowY = proposedY - clampedY;

                    tankState.x = clampedX;
                    tankState.y = clampedY;
                }
            }

            allTanks.forEach((tank) => {
                if (tank.state.reloadTimer > 0) {
                    tank.state.reloadTimer = Math.max(0, tank.state.reloadTimer - deltaSeconds);
                    updateReloadBar(tank);
                }
            });

            if (keyState.firing && tankState.reloadTimer <= 0 && !tankState.isDestroyed) {
                fireProjectile(playerTank);
            }

            aimTurretTowards(playerTank, pointerState.x, pointerState.y, deltaSeconds);
            updateEnemyBehavior(deltaSeconds);

            allTanks.forEach(updateTankTransform);
            updateBullets(deltaSeconds);
            renderFog(deltaSeconds);

            if ((overflowX !== 0 || overflowY !== 0) && !isDraggingField) {
                shiftBackgroundByPixels(overflowX, overflowY);
            }

            window.requestAnimationFrame(step);
        };

        window.requestAnimationFrame(step);

        window.addEventListener("resize", () => {
            allTanks.forEach((tank) => {
                clampTankPosition(tank);
                updateTankTransform(tank);
            });
            initializeFogGrid();
            renderFog(0);
        });

        initializeFogGrid();
        renderFog(0);
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
