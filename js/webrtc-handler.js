import { SUPABASE_URL, SUPABASE_KEY } from './supabase-config.js';

/**
 * War Tanks II - WebRTC Handler
 * Управление WebRTC P2P соединением между игроками
 */
export class WebRTCHandler {
    constructor(roomId, playerName, isHost) {
        this.roomId = roomId;
        this.playerName = playerName;
        this.isHost = isHost;
        this.peerConnection = null;
        this.dataChannel = null;
        
        // Callbacks
        this.onPlayerUpdate = null;
        this.onPlayerFire = null;
        this.onConnectionStateChange = null;
        
        // ICE серверы для NAT traversal
        this.iceServers = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' },
                { urls: 'stun:stun2.l.google.com:19302' }
            ]
        };
        
        // Буфер для ICE candidates до установки remote description
        this.iceCandidatesBuffer = [];
    }

    /**
     * Инициализация RTCPeerConnection
     */
    initPeerConnection() {
        this.peerConnection = new RTCPeerConnection(this.iceServers);
        
        // Обработка ICE candidates
        this.peerConnection.onicecandidate = (event) => {
            if (event.candidate && this.onIceCandidate) {
                this.onIceCandidate(event.candidate);
            }
        };
        
        // Мониторинг состояния соединения
        this.peerConnection.onconnectionstatechange = () => {
            console.log('WebRTC connection state:', this.peerConnection.connectionState);
            if (this.onConnectionStateChange) {
                this.onConnectionStateChange(this.peerConnection.connectionState);
            }
        };
        
        // Обработка входящего data channel (для гостя)
        this.peerConnection.ondatachannel = (event) => {
            this.dataChannel = event.channel;
            this.setupDataChannel();
        };
    }

    /**
     * Создание offer (вызывается хостом)
     */
    async createOffer() {
        this.initPeerConnection();
        
        // Создаем data channel (хост создает канал)
        this.dataChannel = this.peerConnection.createDataChannel('game-data', {
            ordered: false, // Не гарантируем порядок для скорости
            maxRetransmits: 0 // Не переотправляем старые пакеты
        });
        this.setupDataChannel();
        
        // Создаем offer
        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);
        
        return offer;
    }

    /**
     * Обработка offer и создание answer (вызывается гостем)
     */
    async handleOffer(offer) {
        this.initPeerConnection();
        
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        
        // Обрабатываем буферизованные ICE candidates
        for (const candidate of this.iceCandidatesBuffer) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
        this.iceCandidatesBuffer = [];
        
        // Создаем answer
        const answer = await this.peerConnection.createAnswer();
        await this.peerConnection.setLocalDescription(answer);
        
        return answer;
    }

    /**
     * Обработка answer (вызывается хостом)
     */
    async handleAnswer(answer) {
        await this.peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
        
        // Обрабатываем буферизованные ICE candidates
        for (const candidate of this.iceCandidatesBuffer) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        }
        this.iceCandidatesBuffer = [];
    }

    /**
     * Добавление ICE candidate
     */
    async addIceCandidate(candidate) {
        if (this.peerConnection && this.peerConnection.remoteDescription) {
            await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
            // Буферизуем если remote description еще не установлен
            this.iceCandidatesBuffer.push(candidate);
        }
    }

    /**
     * Настройка data channel
     */
    setupDataChannel() {
        this.dataChannel.onopen = () => {
            console.log('WebRTC DataChannel opened');
            if (this.onConnectionStateChange) {
                this.onConnectionStateChange('connected');
            }
        };
        
        this.dataChannel.onclose = () => {
            console.log('WebRTC DataChannel closed');
            if (this.onConnectionStateChange) {
                this.onConnectionStateChange('disconnected');
            }
        };
        
        this.dataChannel.onerror = (error) => {
            console.error('WebRTC DataChannel error:', error);
        };
        
        this.dataChannel.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                this.handleMessage(message);
            } catch (error) {
                console.error('Failed to parse WebRTC message:', error);
            }
        };
    }

    /**
     * Обработка входящих сообщений
     */
    handleMessage(message) {
        switch (message.type) {
            case 'position':
                if (this.onPlayerUpdate) {
                    this.onPlayerUpdate(message.data);
                }
                break;
            case 'fire':
                if (this.onPlayerFire) {
                    this.onPlayerFire(message.data);
                }
                break;
            default:
                console.warn('Unknown message type:', message.type);
        }
    }

    /**
     * Отправка позиции танка
     */
    sendPosition(data) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify({
                type: 'position',
                data: data
            }));
        }
    }

    /**
     * Отправка выстрела
     */
    sendFire(data) {
        if (this.dataChannel && this.dataChannel.readyState === 'open') {
            this.dataChannel.send(JSON.stringify({
                type: 'fire',
                data: data
            }));
        }
    }

    /**
     * Закрытие соединения
     */
    close() {
        if (this.dataChannel) {
            this.dataChannel.close();
        }
        if (this.peerConnection) {
            this.peerConnection.close();
        }
    }
}
