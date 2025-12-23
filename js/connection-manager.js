import { WebRTCHandler } from './webrtc-handler.js';
import { SignalingHandler } from './signaling-handler.js';
import { NetworkHandler } from './network.js';

/**
 * War Tanks II - Connection Manager
 * Управление режимами соединения: WebRTC P2P или Supabase Broadcast
 */
export class ConnectionManager {
    constructor(roomId, playerName, isHost) {
        this.roomId = roomId;
        this.playerName = playerName;
        this.isHost = isHost;
        
        // Текущий режим: 'webrtc', 'supabase', или 'connecting'
        this.mode = 'connecting';
        
        // Активный обработчик
        this.activeHandler = null;
        
        // Обработчики для разных режимов
        this.webrtcHandler = null;
        this.signalingHandler = null;
        this.supabaseHandler = null;
        
        // Callbacks
        this.onPlayerUpdate = null;
        this.onPlayerFire = null;
        this.onPlayerJoined = null;
        this.onConnectionReady = null;
        
        // Таймаут для WebRTC (если не подключился за 10 сек, fallback)
        this.webrtcTimeout = 10000;
        this.connectionTimer = null;
    }

    /**
     * Получение предпочитаемого режима из настроек
     */
    getPreferredMode() {
        const mode = localStorage.getItem('wt2:network-mode');
        // Если не задано, по умолчанию WebRTC
        return mode || 'webrtc';
    }

    /**
     * Установка предпочитаемого режима
     */
    setPreferredMode(mode) {
        localStorage.setItem('wt2:network-mode', mode);
    }

    /**
     * Основной метод подключения
     */
    async connect() {
        const preferredMode = this.getPreferredMode();
        
        console.log(`Attempting connection, preferred mode: ${preferredMode}`);
        
        if (preferredMode === 'webrtc') {
            try {
                await this.connectWebRTC();
            } catch (error) {
                console.warn('WebRTC connection failed, falling back to Supabase:', error);
                await this.connectSupabase();
            }
        } else {
            await this.connectSupabase();
        }
    }

    /**
     * Подключение через WebRTC P2P
     */
    async connectWebRTC() {
        console.log('Connecting via WebRTC P2P...');
        this.mode = 'connecting';
        
        // Создаем WebRTC handler
        this.webrtcHandler = new WebRTCHandler(this.roomId, this.playerName, this.isHost);
        
        // Создаем signaling handler для обмена SDP
        this.signalingHandler = new SignalingHandler(this.roomId, this.isHost);
        
        // Настройка callbacks для WebRTC
        this.webrtcHandler.onPlayerUpdate = (data) => {
            if (this.onPlayerUpdate) this.onPlayerUpdate(data);
        };
        
        this.webrtcHandler.onPlayerFire = (data) => {
            if (this.onPlayerFire) this.onPlayerFire(data);
        };
        
        this.webrtcHandler.onConnectionStateChange = (state) => {
            console.log('WebRTC state:', state);
            if (state === 'connected') {
                this.mode = 'webrtc';
                this.activeHandler = this.webrtcHandler;
                if (this.connectionTimer) {
                    clearTimeout(this.connectionTimer);
                }
                if (this.onConnectionReady) {
                    this.onConnectionReady('webrtc');
                }
            } else if (state === 'failed' || state === 'disconnected') {
                console.warn('WebRTC connection failed/disconnected');
                this.fallbackToSupabase();
            }
        };
        
        // Настройка callbacks для signaling
        this.webrtcHandler.onIceCandidate = async (candidate) => {
            await this.signalingHandler.sendIceCandidate(candidate);
        };
        
        this.signalingHandler.onOffer = async (offer) => {
            if (!this.isHost) {
                const answer = await this.webrtcHandler.handleOffer(offer);
                await this.signalingHandler.sendAnswer(answer);
            }
        };
        
        this.signalingHandler.onAnswer = async (answer) => {
            if (this.isHost) {
                await this.webrtcHandler.handleAnswer(answer);
            }
        };
        
        this.signalingHandler.onIceCandidate = async (candidate) => {
            await this.webrtcHandler.addIceCandidate(candidate);
        };
        
        // Подписываемся на signaling канал
        await this.signalingHandler.subscribe();
        
        // Хост создает offer
        if (this.isHost) {
            // Небольшая задержка чтобы гость успел подписаться
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            const offer = await this.webrtcHandler.createOffer();
            await this.signalingHandler.sendOffer(offer);
            console.log('Offer sent, waiting for answer...');
        }
        
        // Устанавливаем таймаут для fallback
        this.connectionTimer = setTimeout(() => {
            if (this.mode === 'connecting') {
                console.warn('WebRTC connection timeout, falling back to Supabase');
                this.fallbackToSupabase();
            }
        }, this.webrtcTimeout);
    }

    /**
     * Подключение через Supabase Broadcast
     */
    async connectSupabase() {
        console.log('Connecting via Supabase Broadcast...');
        this.mode = 'supabase';
        
        // Закрываем WebRTC если был
        if (this.webrtcHandler) {
            this.webrtcHandler.close();
        }
        if (this.signalingHandler) {
            this.signalingHandler.close();
        }
        
        // Создаем Supabase handler
        this.supabaseHandler = new NetworkHandler(this.roomId, this.playerName);
        
        // Настройка callbacks
        this.supabaseHandler.onPlayerUpdate = (data) => {
            if (this.onPlayerUpdate) this.onPlayerUpdate(data);
        };
        
        this.supabaseHandler.onPlayerFire = (data) => {
            if (this.onPlayerFire) this.onPlayerFire(data);
        };
        
        this.supabaseHandler.onPlayerJoined = (data) => {
            if (this.onPlayerJoined) this.onPlayerJoined(data);
        };
        
        await this.supabaseHandler.connect();
        
        this.activeHandler = this.supabaseHandler;
        
        if (this.onConnectionReady) {
            this.onConnectionReady('supabase');
        }
        
        console.log('Connected via Supabase Broadcast');
    }

    /**
     * Fallback на Supabase при ошибке WebRTC
     */
    async fallbackToSupabase() {
        if (this.mode !== 'supabase') {
            console.log('Falling back to Supabase...');
            await this.connectSupabase();
        }
    }

    /**
     * Отправка позиции
     */
    sendPosition(data) {
        if (this.activeHandler) {
            if (this.mode === 'webrtc') {
                this.activeHandler.sendPosition(data);
            } else {
                // Supabase использует sendPositionDelta
                this.activeHandler.sendPositionDelta(data);
            }
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
     * Закрытие соединения
     */
    close() {
        if (this.connectionTimer) {
            clearTimeout(this.connectionTimer);
        }
        
        if (this.webrtcHandler) {
            this.webrtcHandler.close();
        }
        
        if (this.signalingHandler) {
            this.signalingHandler.close();
        }
        
        if (this.supabaseHandler) {
            this.supabaseHandler.close();
        }
    }
}
