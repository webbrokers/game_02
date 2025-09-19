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

    const interactiveButtons = document.querySelectorAll(".menu-link, .retro-button");
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
