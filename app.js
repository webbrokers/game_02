(function () {
    const { body } = document;
    if (!body) {
        return;
    }

    const navigationDelay = 250;
    let isNavigating = false;

    const TANK_PRESETS = Object.freeze({
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
    const DEFAULT_TANK_ID = "tiger";
    const TANK_SETTINGS_STORAGE_KEY = "wt2:tank-settings";
    const TANK_IDS = Object.keys(TANK_PRESETS);

    const TANK_SETTINGS_LIMITS = Object.freeze({
        moveSpeed: { min: 100, max: 400 },
        fireCooldown: { min: 0.5, max: 5 },
        damagePerHit: { min: 0.1, max: 1 },
    });

    const clampToRange = (value, { min, max }) => Math.min(max, Math.max(min, value));

    const sanitizeSingleTankSettings = (rawSettings, defaults) => {
        const safeSettings = { ...defaults };
        if (!rawSettings || typeof rawSettings !== "object") {
            return safeSettings;
        }

        ["moveSpeed", "fireCooldown", "damagePerHit"].forEach((key) => {
            const ranges = TANK_SETTINGS_LIMITS[key];
            const candidate = Number(rawSettings[key]);
            if (Number.isFinite(candidate)) {
                safeSettings[key] = clampToRange(candidate, ranges);
            }
        });

        return safeSettings;
    };

    const sanitizeTankSettingsMap = (rawSettingsMap) => {
        const safeMap = {};
        TANK_IDS.forEach((id) => {
            const defaults = TANK_PRESETS[id].defaults;
            const rawSettings = rawSettingsMap && typeof rawSettingsMap === "object" ? rawSettingsMap[id] : undefined;
            safeMap[id] = sanitizeSingleTankSettings(rawSettings, defaults);
        });
        return safeMap;
    };

    const loadTankSettings = () => {
        try {
            const storage = window.localStorage;
            if (!storage) {
                return sanitizeTankSettingsMap(null);
            }

            const raw = storage.getItem(TANK_SETTINGS_STORAGE_KEY);
            if (!raw) {
                return sanitizeTankSettingsMap(null);
            }

            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
                const isLegacyShape = Object.keys(parsed).every((key) =>
                    Object.prototype.hasOwnProperty.call(TANK_SETTINGS_LIMITS, key),
                );

                if (isLegacyShape) {
                    return sanitizeTankSettingsMap(
                        Object.fromEntries(TANK_IDS.map((id) => [id, parsed])),
                    );
                }

                return sanitizeTankSettingsMap(parsed);
            }
        } catch (error) {
            /* Ignore storage errors */
        }

        return sanitizeTankSettingsMap(null);
    };

    const saveTankSettings = (settingsMap) => {
        const sanitized = sanitizeTankSettingsMap(settingsMap);
        try {
            const storage = window.localStorage;
            if (!storage) {
                return sanitized;
            }

            storage.setItem(TANK_SETTINGS_STORAGE_KEY, JSON.stringify(sanitized));
        } catch (error) {
            /* Persistence can fail in private mode; ignore */
        }

        return sanitized;
    };

    const resolveSelectedTankPreset = () => {
        try {
            const params = new URLSearchParams(window.location.search || "");
            const requestedId = params.get("tank");
            if (requestedId && Object.prototype.hasOwnProperty.call(TANK_PRESETS, requestedId)) {
                return TANK_PRESETS[requestedId];
            }
        } catch (error) {
            /* Ignore malformed query strings */
        }

        return TANK_PRESETS[DEFAULT_TANK_ID];
    };

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

    const submitFormWithOverrides = (form, submitter) => {
        if (!form) {
            return;
        }

        const original = {
            action: form.getAttribute("action"),
            method: form.getAttribute("method"),
            target: form.getAttribute("target"),
            enctype: form.getAttribute("enctype"),
        };

        if (submitter instanceof HTMLElement) {
            const applyOverride = (attr, value) => {
                if (value === null) {
                    return;
                }

                form.setAttribute(attr, value);
            };

            if (submitter.hasAttribute("formaction")) {
                applyOverride("action", submitter.getAttribute("formaction"));
            }

            if (submitter.hasAttribute("formmethod")) {
                applyOverride("method", submitter.getAttribute("formmethod"));
            }

            if (submitter.hasAttribute("formtarget")) {
                applyOverride("target", submitter.getAttribute("formtarget"));
            }

            if (submitter.hasAttribute("formenctype")) {
                applyOverride("enctype", submitter.getAttribute("formenctype"));
            }
        }

        const shouldTriggerSubmitHandlers = form.matches(".settings-form");
        const performNativeSubmit = () => {
            if (shouldTriggerSubmitHandlers && typeof form.requestSubmit === "function") {
                form.requestSubmit(submitter);
                return;
            }

            if (shouldTriggerSubmitHandlers) {
                const submitEvent = new Event("submit", { cancelable: true });
                const notCancelled = form.dispatchEvent(submitEvent);
                if (!notCancelled) {
                    return;
                }
            }

            form.submit();
        };

        performNativeSubmit();

        window.setTimeout(() => {
            Object.entries(original).forEach(([attr, value]) => {
                if (value === null) {
                    form.removeAttribute(attr);
                } else {
                    form.setAttribute(attr, value);
                }
            });
        }, 0);
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
                    submitFormWithOverrides(form, element);
                });
            }
        });
    };

    const interactiveButtons = document.querySelectorAll(".menu-link, .retro-button, .play-menu-button");
    interactiveButtons.forEach(registerInteractiveElement);

    const settingsForm = document.querySelector(".settings-form");
    if (settingsForm) {
        const tankSettingsMap = loadTankSettings();
        const feedback = settingsForm.querySelector(".settings-feedback");
        const inputs = Array.from(settingsForm.querySelectorAll("input[data-tank-id][data-field]"));

        const writeFeedback = (message = "") => {
            if (!feedback) {
                return;
            }

            feedback.textContent = message;
        };

        const applySettingsToInputs = () => {
            inputs.forEach((input) => {
                const { tankId, field } = input.dataset;
                if (!tankId || !field || !Object.prototype.hasOwnProperty.call(TANK_PRESETS, tankId)) {
                    return;
                }

                const preset = TANK_PRESETS[tankId];
                const settings = tankSettingsMap[tankId] || preset.defaults;
                const value = settings[field];

                if (value !== undefined) {
                    input.value = value;
                }
            });
        };

        applySettingsToInputs();

        inputs.forEach((input) => {
            input.addEventListener("input", () => {
                writeFeedback("");
            });
        });

        settingsForm.addEventListener("submit", (event) => {
            event.preventDefault();

            if (typeof settingsForm.reportValidity === "function" && !settingsForm.reportValidity()) {
                isNavigating = false;
                return;
            }

            const nextSettingsMap = {};

            TANK_IDS.forEach((id) => {
                nextSettingsMap[id] = { ...tankSettingsMap[id] };
            });

            inputs.forEach((input) => {
                const { tankId, field } = input.dataset;
                if (!tankId || !field || !Object.prototype.hasOwnProperty.call(TANK_PRESETS, tankId)) {
                    return;
                }

                if (!nextSettingsMap[tankId]) {
                    nextSettingsMap[tankId] = { ...TANK_PRESETS[tankId].defaults };
                }

                const numericValue = Number(input.value);
                nextSettingsMap[tankId][field] = Number.isFinite(numericValue)
                    ? numericValue
                    : TANK_PRESETS[tankId].defaults[field];
            });

            const savedSettingsMap = saveTankSettings(nextSettingsMap);
            Object.keys(savedSettingsMap).forEach((tankId) => {
                tankSettingsMap[tankId] = savedSettingsMap[tankId];
            });

            applySettingsToInputs();
            writeFeedback("Настройки сохранены");
            isNavigating = false;
        });
    }

    const playfield = document.querySelector(".playfield");
    const isMultiplayerMode = new URLSearchParams(window.location.search).has('room');
    if (playfield && !isMultiplayerMode) {
        const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

        const MAP_SCALE = 1.875;
        const BASE_VIEWPORT_WIDTH = 1024;
        const BASE_VIEWPORT_HEIGHT = 800;
        let viewportWidth = playfield.clientWidth;
        let viewportHeight = playfield.clientHeight;
        const worldWidth = Math.round(BASE_VIEWPORT_WIDTH * MAP_SCALE);
        const worldHeight = Math.round(BASE_VIEWPORT_HEIGHT * MAP_SCALE);

        const world = document.createElement("div");
        world.className = "playfield__world";
        world.style.width = `${worldWidth}px`;
        world.style.height = `${worldHeight}px`;
        playfield.appendChild(world);

        const camera = { x: 0, y: 0 };
        const cameraDeadzone = { left: 0, right: 0, top: 0, bottom: 0 };
        const cameraBounds = {
            maxX: Math.max(0, worldWidth - viewportWidth),
            maxY: Math.max(0, worldHeight - viewportHeight),
        };

        const updateViewportMetrics = () => {
            viewportWidth = playfield.clientWidth;
            viewportHeight = playfield.clientHeight;
            cameraDeadzone.left = viewportWidth * 0.25;
            cameraDeadzone.right = viewportWidth * 0.25;
            cameraDeadzone.top = viewportHeight * 0.28;
            cameraDeadzone.bottom = viewportHeight * 0.28;
            cameraBounds.maxX = Math.max(0, worldWidth - viewportWidth);
            cameraBounds.maxY = Math.max(0, worldHeight - viewportHeight);
        };

        updateViewportMetrics();

        const clampCamera = () => {
            camera.x = clamp(camera.x, 0, cameraBounds.maxX);
            camera.y = clamp(camera.y, 0, cameraBounds.maxY);
        };

        const applyCameraTransform = () => {
            world.style.transform = `translate3d(${-camera.x}px, ${-camera.y}px, 0)`;
        };

        const centerCameraOn = (x, y) => {
            camera.x = x - viewportWidth / 2;
            camera.y = y - viewportHeight / 2;
            clampCamera();
            applyCameraTransform();
        };

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
            world.appendChild(elements.root);
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

        const playerTankPreset = resolveSelectedTankPreset();

        const playerTank = createTank({
            x: worldWidth / 2,
            y: worldHeight / 2,
            variant: playerTankPreset.variantClass || "tank--player",
            isPlayer: true,
        });

        playerTank.state.presetId = playerTankPreset.id;

        const enemyTank = createTank({
            x: worldWidth * 0.75,
            y: worldHeight * 0.35,
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

        centerCameraOn(tankState.x, tankState.y);

        const fogCanvas = document.createElement("canvas");
        fogCanvas.className = "playfield__fog";
        const fogCtx = fogCanvas.getContext("2d");
        world.appendChild(fogCanvas);

        const keyState = {
            forward: false,
            backward: false,
            turnLeft: false,
            turnRight: false,
            firing: false,
        };

        const pointerState = {
            viewportX: clamp(tankState.x - camera.x, 0, viewportWidth),
            viewportY: clamp(tankState.y - camera.y - 120, 0, viewportHeight),
            worldX: tankState.x,
            worldY: tankState.y - 120,
        };

        const syncPointerWorldPosition = () => {
            pointerState.worldX = clamp(pointerState.viewportX + camera.x, 0, worldWidth);
            pointerState.worldY = clamp(pointerState.viewportY + camera.y, 0, worldHeight);
        };

        syncPointerWorldPosition();

        const updateCameraForPlayer = ({ force = false } = {}) => {
            const prevX = camera.x;
            const prevY = camera.y;
            const targetX = tankState.x;
            const targetY = tankState.y;

            const leftBoundary = camera.x + cameraDeadzone.left;
            const rightBoundary = camera.x + viewportWidth - cameraDeadzone.right;
            const topBoundary = camera.y + cameraDeadzone.top;
            const bottomBoundary = camera.y + viewportHeight - cameraDeadzone.bottom;

            if (targetX < leftBoundary) {
                camera.x = targetX - cameraDeadzone.left;
            } else if (targetX > rightBoundary) {
                camera.x = targetX - (viewportWidth - cameraDeadzone.right);
            }

            if (targetY < topBoundary) {
                camera.y = targetY - cameraDeadzone.top;
            } else if (targetY > bottomBoundary) {
                camera.y = targetY - (viewportHeight - cameraDeadzone.bottom);
            }

            clampCamera();

            if (force || camera.x !== prevX || camera.y !== prevY) {
                applyCameraTransform();
                syncPointerWorldPosition();
            }
        };

        const aimCursor = document.createElement("div");
        aimCursor.className = "aim-cursor";
        playfield.appendChild(aimCursor);
        playfield.classList.remove("playfield--default-cursor");

        let aimCursorVisible = false;
        let isAimCursorLocked = false;

        const updateAimCursorPosition = () => {
            aimCursor.style.left = `${pointerState.viewportX}px`;
            aimCursor.style.top = `${pointerState.viewportY}px`;
        };

        const showAimCursor = () => {
            if (isAimCursorLocked || aimCursorVisible) {
                return;
            }

            aimCursorVisible = true;
            aimCursor.classList.add("aim-cursor--visible");
        };

        const hideAimCursor = () => {
            if (!aimCursorVisible) {
                return;
            }

            aimCursorVisible = false;
            aimCursor.classList.remove("aim-cursor--visible");
        };

        updateAimCursorPosition();

        updateCameraForPlayer({ force: true });

        playfield.addEventListener("pointerenter", (event) => {
            updatePointerFromEvent(event);
            showAimCursor();
        }, { capture: true });

        playfield.addEventListener("pointerdown", (event) => {
            if (event.button !== 0) {
                return;
            }

            updatePointerFromEvent(event);
            showAimCursor();
            event.preventDefault();
        });

        playfield.addEventListener("pointerup", (event) => {
            updatePointerFromEvent(event);

            const width = viewportWidth;
            const height = viewportHeight;
            const isPointerInside =
                pointerState.viewportX >= 0
                && pointerState.viewportX <= width
                && pointerState.viewportY >= 0
                && pointerState.viewportY <= height;

            if (!isPointerInside) {
                hideAimCursor();
            }
        });

        playfield.addEventListener("pointercancel", () => {
            hideAimCursor();
        });

        playfield.addEventListener("pointerleave", () => {
            hideAimCursor();
        }, { capture: true });

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
        const tankSettingsMap = loadTankSettings();
        const tankSettings = {
            ...playerTankPreset.defaults,
            ...tankSettingsMap[playerTankPreset.id],
        };
        const MOVE_SPEED = tankSettings.moveSpeed;
        const FIRE_COOLDOWN = tankSettings.fireCooldown;
        const BULLET_SPEED = 580;
        const BULLET_LIFETIME = 2.2;
        const DAMAGE_PER_HIT = tankSettings.damagePerHit;
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

        const barrels = [];
        const MAX_BARRELS = 5;
        const BARREL_RESPAWN_MIN = 6;
        const BARREL_RESPAWN_MAX = 12;
        const BARREL_HALF_WIDTH = 18;
        const BARREL_HALF_HEIGHT = 22;
        const BARREL_HIT_RADIUS = Math.max(BARREL_HALF_WIDTH, BARREL_HALF_HEIGHT) + 6;
        const BARREL_TANK_AVOID_RADIUS = 140;
        const BARREL_BARREL_AVOID_RADIUS = 100;
        const BARREL_EXPLOSION_RADIUS = 150;
        const BARREL_EXPLOSION_DAMAGE = 0.55;
        let barrelSpawnTimer = randomInRange(0.75, 2.25);

        const updateBarrelTransform = (barrel) => {
            barrel.element.style.transform = `translate3d(${barrel.x - BARREL_HALF_WIDTH}px, ${barrel.y - BARREL_HALF_HEIGHT}px, 0)`;
        };

        const clampBarrelPosition = (barrel) => {
            barrel.x = clamp(
                barrel.x,
                BARREL_HALF_WIDTH,
                Math.max(BARREL_HALF_WIDTH, worldWidth - BARREL_HALF_WIDTH),
            );
            barrel.y = clamp(
                barrel.y,
                BARREL_HALF_HEIGHT,
                Math.max(BARREL_HALF_HEIGHT, worldHeight - BARREL_HALF_HEIGHT),
            );
            updateBarrelTransform(barrel);
        };

        const spawnExplosionAt = (x, y, { variant = "large" } = {}) => {
            const explosion = document.createElement("div");
            explosion.className = `play-explosion play-explosion--${variant}`;
            explosion.style.left = `${x}px`;
            explosion.style.top = `${y}px`;
            world.appendChild(explosion);

            const cleanup = () => {
                explosion.remove();
            };

            explosion.addEventListener("animationend", cleanup, { once: true });
            window.setTimeout(() => {
                if (explosion.isConnected) {
                    cleanup();
                }
            }, 520);
        };

        const applyExplosionDamage = (centerX, centerY) => {
            allTanks.forEach((tank) => {
                if (tank.state.isDestroyed) {
                    return;
                }

                const distance = Math.hypot(tank.state.x - centerX, tank.state.y - centerY);
                if (distance > BARREL_EXPLOSION_RADIUS) {
                    return;
                }

                const falloff = 1 - distance / BARREL_EXPLOSION_RADIUS;
                const damage = BARREL_EXPLOSION_DAMAGE * (0.4 + falloff * 0.6);
                applyDamage(tank, damage);
            });
        };

        const triggerBarrelExplosion = (barrel, index) => {
            barrels.splice(index, 1);
            barrel.element.remove();
            spawnExplosionAt(barrel.x, barrel.y);
            applyExplosionDamage(barrel.x, barrel.y);
            barrelSpawnTimer = randomInRange(BARREL_RESPAWN_MIN * 0.4, BARREL_RESPAWN_MIN);
        };

        const canPlaceBarrelAt = (x, y) => {
            const withinField = x >= BARREL_HALF_WIDTH && y >= BARREL_HALF_HEIGHT
                && x <= worldWidth - BARREL_HALF_WIDTH
                && y <= worldHeight - BARREL_HALF_HEIGHT;

            if (!withinField) {
                return false;
            }

            for (let i = 0; i < barrels.length; i += 1) {
                const other = barrels[i];
                if (Math.hypot(other.x - x, other.y - y) < BARREL_BARREL_AVOID_RADIUS) {
                    return false;
                }
            }

            for (let i = 0; i < allTanks.length; i += 1) {
                const tank = allTanks[i];
                if (Math.hypot(tank.state.x - x, tank.state.y - y) < BARREL_TANK_AVOID_RADIUS) {
                    return false;
                }
            }

            return true;
        };

        const spawnBarrel = () => {
            if (barrels.length >= MAX_BARRELS) {
                return false;
            }

            const fieldWidth = worldWidth;
            const fieldHeight = worldHeight;
            if (fieldWidth <= BARREL_HALF_WIDTH * 2 || fieldHeight <= BARREL_HALF_HEIGHT * 2) {
                return false;
            }

            const marginX = Math.max(BARREL_HALF_WIDTH + 25, halfChassisWidth + 25);
            const marginY = Math.max(BARREL_HALF_HEIGHT + 25, halfChassisHeight + 25);
            const minX = marginX;
            const maxX = Math.max(minX, fieldWidth - marginX);
            const minY = marginY;
            const maxY = Math.max(minY, fieldHeight - marginY);

            for (let attempt = 0; attempt < 25; attempt += 1) {
                const candidateX = randomInRange(minX, maxX);
                const candidateY = randomInRange(minY, maxY);

                if (!canPlaceBarrelAt(candidateX, candidateY)) {
                    continue;
                }

                const barrelElement = document.createElement("div");
                barrelElement.className = "fuel-barrel";
                const barrelState = {
                    x: candidateX,
                    y: candidateY,
                    element: barrelElement,
                };
                barrels.push(barrelState);
                world.appendChild(barrelElement);
                clampBarrelPosition(barrelState);
                return true;
            }

            return false;
        };

        const updateBarrelSpawning = (deltaSeconds) => {
            if (barrels.length >= MAX_BARRELS) {
                barrelSpawnTimer = randomInRange(BARREL_RESPAWN_MIN, BARREL_RESPAWN_MAX);
                return;
            }

            barrelSpawnTimer -= deltaSeconds;
            if (barrelSpawnTimer > 0) {
                return;
            }

            const spawned = spawnBarrel();
            barrelSpawnTimer = randomInRange(
                spawned ? BARREL_RESPAWN_MIN : 1.25,
                spawned ? BARREL_RESPAWN_MAX : 2.75,
            );
        };

        const pickEnemySearchTarget = () => {
            const minX = halfChassisWidth;
            const maxX = Math.max(minX, worldWidth - halfChassisWidth);
            const minY = halfChassisHeight;
            const maxY = Math.max(minY, worldHeight - halfChassisHeight);
            return {
                x: randomInRange(minX, maxX),
                y: randomInRange(minY, maxY),
            };
        };

        enemyAiState.searchTarget = pickEnemySearchTarget();

        const initializeFogGrid = () => {
            const width = worldWidth;
            const height = worldHeight;
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
                fogCanvas.width !== worldWidth ||
                fogCanvas.height !== worldHeight ||
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
            isAimCursorLocked = true;
            hideAimCursor();
            playfield.classList.add("playfield--default-cursor");

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
            isAimCursorLocked = true;
            hideAimCursor();
            playfield.classList.add("playfield--default-cursor");

            showMissionOverlay({
                title: "MISSION COMPLET",
                buttonLabel: "MISSION COMPLETED",
                buttonHref: "mission-completed.html",
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
            tank.state.x = clamp(tank.state.x, halfChassisWidth, worldWidth - halfChassisWidth);
            tank.state.y = clamp(tank.state.y, halfChassisHeight, worldHeight - halfChassisHeight);
        };

        function updatePointerFromEvent(event) {
            const rect = playfield.getBoundingClientRect();
            pointerState.viewportX = event.clientX - rect.left;
            pointerState.viewportY = event.clientY - rect.top;
            syncPointerWorldPosition();
            updateAimCursorPosition();
        }

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
            world.appendChild(bulletElement);

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
                    bullet.x > worldWidth + 20 ||
                    bullet.y < -20 ||
                    bullet.y > worldHeight + 20
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
                        spawnExplosionAt(bullet.x, bullet.y, { variant: "small" });
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

                for (let barrelIndex = barrels.length - 1; barrelIndex >= 0; barrelIndex -= 1) {
                    const barrel = barrels[barrelIndex];
                    const dxBarrel = bullet.x - barrel.x;
                    const dyBarrel = bullet.y - barrel.y;
                    if (Math.hypot(dxBarrel, dyBarrel) <= BARREL_HIT_RADIUS) {
                        triggerBarrelExplosion(barrel, barrelIndex);
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
                if (!wasPlayerVisible) {
                    enemyAiState.reactionTimer = ENEMY_REACTION_DELAY;
                    enemyAiState.mode = "alert";
                }

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
                        Math.max(halfChassisWidth, worldWidth - halfChassisWidth),
                    );
                    enemyState.y = clamp(
                        proposedY,
                        halfChassisHeight,
                        Math.max(halfChassisHeight, worldHeight - halfChassisHeight),
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
                Math.max(halfChassisWidth, worldWidth - halfChassisWidth),
            );
            enemyState.y = clamp(
                proposedY,
                halfChassisHeight,
                Math.max(halfChassisHeight, worldHeight - halfChassisHeight),
            );

            const sweepX = enemyState.x + direction.x * 180;
            const sweepY = enemyState.y + direction.y * 180;
            aimTurretTowards(enemyTank, sweepX, sweepY, deltaSeconds, 90);
        };

        const step = (timestamp) => {
            const deltaSeconds = Math.min(0.05, (timestamp - previousTimestamp) / 1000);
            previousTimestamp = timestamp;

            if (!tankState.isDestroyed) {
                const turnInput = (keyState.turnRight ? 1 : 0) - (keyState.turnLeft ? 1 : 0);
                if (turnInput !== 0) {
                    tankState.hullAngle = (tankState.hullAngle + turnInput * TURN_SPEED * deltaSeconds + 360) % 360;
                }

                const moveInput = (keyState.forward ? 1 : 0) - (keyState.backward ? 1 : 0);
                if (moveInput !== 0) {
                    const direction = forwardComponents(tankState.hullAngle);
                    const fieldWidth = worldWidth;
                    const fieldHeight = worldHeight;

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

                    tankState.x = clampedX;
                    tankState.y = clampedY;
                }
            }

            updateCameraForPlayer();

            allTanks.forEach((tank) => {
                if (tank.state.reloadTimer > 0) {
                    tank.state.reloadTimer = Math.max(0, tank.state.reloadTimer - deltaSeconds);
                    updateReloadBar(tank);
                }
            });

            if (keyState.firing && tankState.reloadTimer <= 0 && !tankState.isDestroyed) {
                fireProjectile(playerTank);
            }

            aimTurretTowards(playerTank, pointerState.worldX, pointerState.worldY, deltaSeconds);
            updateEnemyBehavior(deltaSeconds);
            updateBarrelSpawning(deltaSeconds);

            allTanks.forEach(updateTankTransform);
            updateBullets(deltaSeconds);
            renderFog(deltaSeconds);

            window.requestAnimationFrame(step);
        };

        window.requestAnimationFrame(step);

        window.addEventListener("resize", () => {
            updateViewportMetrics();
            pointerState.viewportX = clamp(pointerState.viewportX, 0, viewportWidth);
            pointerState.viewportY = clamp(pointerState.viewportY, 0, viewportHeight);
            updateAimCursorPosition();
            updateCameraForPlayer({ force: true });
            syncPointerWorldPosition();
            allTanks.forEach((tank) => {
                clampTankPosition(tank);
                updateTankTransform(tank);
            });
            barrels.forEach(clampBarrelPosition);
            initializeFogGrid();
            renderFog(0);
        });

        initializeFogGrid();

    const forms = document.querySelectorAll("form");
    forms.forEach((form) => {
        form.addEventListener("submit", (event) => {
            if (isNavigating) {
                event.preventDefault();
                return;
            }

            event.preventDefault();
            playSfx(selectSound);
            const submitter = event.submitter instanceof HTMLElement ? event.submitter : null;
            scheduleNavigation(() => {
                submitFormWithOverrides(form, submitter);
            });
        });
    });
})();
