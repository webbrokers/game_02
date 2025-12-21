/**
 * War Tanks II - Input Handler
 * Обработка ввода (клавиатура, мышь).
 */

export class InputHandler {
    constructor() {
        this.keyState = {
            forward: false,
            backward: false,
            turnLeft: false,
            turnRight: false,
            firing: false,
        };
        this.pointerState = {
            viewportX: 0,
            viewportY: 0,
            worldX: 0,
            worldY: 0
        };

        this.init();
    }

    init() {
        window.addEventListener("keydown", (e) => this.handleKey(e, true));
        window.addEventListener("keyup", (e) => this.handleKey(e, false));
    }

    handleKey(event, isPressed) {
        if (this.isInteractiveTarget(event.target)) return;
        
        const { code } = event;
        switch (code) {
            case "ArrowUp":
            case "KeyW":
                this.keyState.forward = isPressed;
                event.preventDefault();
                break;
            case "ArrowDown":
            case "KeyS":
                this.keyState.backward = isPressed;
                event.preventDefault();
                break;
            case "ArrowLeft":
            case "KeyA":
                this.keyState.turnLeft = isPressed;
                event.preventDefault();
                break;
            case "ArrowRight":
            case "KeyD":
                this.keyState.turnRight = isPressed;
                event.preventDefault();
                break;
            case "Space":
                this.keyState.firing = isPressed;
                event.preventDefault();
                break;
        }
    }

    isInteractiveTarget(target) {
        if (!target) return false;
        const tagName = target.tagName ? target.tagName.toLowerCase() : "";
        return ["input", "textarea", "select", "button"].includes(tagName) || target.isContentEditable;
    }

    updatePointer(event, rect, camera) {
        this.pointerState.viewportX = event.clientX - rect.left;
        this.pointerState.viewportY = event.clientY - rect.top;
        this.pointerState.worldX = this.pointerState.viewportX + camera.x;
        this.pointerState.worldY = this.pointerState.viewportY + camera.y;
    }
}
