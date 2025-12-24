import { NetworkHandler } from './network.js';

/**
 * War Tanks II - Connection Manager
 * Управление соединением: Supabase Broadcast (Pro Plan)
 */
export class ConnectionManager {
    constructor(roomId, playerName, isHost) {
        this.roomId = roomId;
        this.playerName = playerName;
        this.isHost = isHost;
        
        // Единственный режим - Supabase
        this.activeHandler = null;
        
        // Callbacks
        this.onPlayerUpdate = null;
        this.onPlayerFire = null;
        this.onPlayerJoined = null;
        this.onConnectionReady = null;
    }

    /**
     * Основной метод подключения
     */
    async connect() {
        console.log('Connecting via Supabase Broadcast (Pro Mode)...');
        
        // Создаем Supabase handler
        this.activeHandler = new NetworkHandler(this.roomId, this.playerName);
        
        // Настройка callbacks
        this.activeHandler.onPlayerUpdate = (data) => {
            if (this.onPlayerUpdate) this.onPlayerUpdate(data);
        };
        
        this.activeHandler.onPlayerFire = (data) => {
            if (this.onPlayerFire) this.onPlayerFire(data);
        };
        
        this.activeHandler.onPlayerJoined = (data) => {
            if (this.onPlayerJoined) this.onPlayerJoined(data);
        };
        
        await this.activeHandler.connect();
        
        if (this.onConnectionReady) {
            this.onConnectionReady('supabase');
        }
        
        console.log('✅ Connected via Supabase Broadcast');
    }

    /**
     * Отправка позиции (использует Delta Compression из NetworkHandler)
     */
    sendPosition(data) {
        if (this.activeHandler) {
            this.activeHandler.sendPositionDelta(data);
        }
    }

    /**
     * Отправка выстрела
     */
    sendFire(data) {
        if (this.activeHandler) {
            this.activeHandler.sendFire(data);
        }
    }

    /**
     * Закрытие комнаты (для хоста)
     */
    async closeRoom() {
        if (this.activeHandler) {
            await this.activeHandler.closeRoom();
        }
    }

    /**
     * Закрытие соединения
     */
    close() {
        if (this.activeHandler) {
            // У NetworkHandler нет явного метода close для подписки, но это ок
            // Главное, что мы удаляем ссылку, а GC сделает остальное.
            // При необходимости можно добавить this.activeHandler.disconnect() в network.js
            this.activeHandler = null;
        }
    }
}
