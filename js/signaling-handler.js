import { SUPABASE_URL, SUPABASE_KEY } from './supabase-config.js';

/**
 * War Tanks II - Signaling Handler
 * Обмен WebRTC сигналами через Supabase
 */
export class SignalingHandler {
    constructor(roomId, isHost) {
        this.roomId = roomId;
        this.isHost = isHost;
        this.channel = null;
        
        // Callbacks
        this.onOffer = null;
        this.onAnswer = null;
        this.onIceCandidate = null;
        
        const { createClient } = supabase;
        this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    }

    /**
     * Подписка на сигналы
     */
    async subscribe() {
        this.channel = this.supabase.channel(`signaling_${this.roomId}`, {
            config: {
                broadcast: { self: false }
            }
        });

        // Слушаем offer
        this.channel.on('broadcast', { event: 'offer' }, ({ payload }) => {
            console.log('Received offer via signaling');
            if (this.onOffer) {
                this.onOffer(payload);
            }
        });

        // Слушаем answer
        this.channel.on('broadcast', { event: 'answer' }, ({ payload }) => {
            console.log('Received answer via signaling');
            if (this.onAnswer) {
                this.onAnswer(payload);
            }
        });

        // Слушаем ICE candidates
        this.channel.on('broadcast', { event: 'ice-candidate' }, ({ payload }) => {
            if (this.onIceCandidate) {
                this.onIceCandidate(payload);
            }
        });

        await this.channel.subscribe();
        console.log('Signaling channel subscribed');
    }

    /**
     * Отправка offer
     */
    async sendOffer(offer) {
        if (!this.channel) {
            throw new Error('Signaling channel not initialized');
        }
        
        await this.channel.send({
            type: 'broadcast',
            event: 'offer',
            payload: offer
        });
        console.log('Sent offer via signaling');
    }

    /**
     * Отправка answer
     */
    async sendAnswer(answer) {
        if (!this.channel) {
            throw new Error('Signaling channel not initialized');
        }
        
        await this.channel.send({
            type: 'broadcast',
            event: 'answer',
            payload: answer
        });
        console.log('Sent answer via signaling');
    }

    /**
     * Отправка ICE candidate
     */
    async sendIceCandidate(candidate) {
        if (!this.channel) {
            throw new Error('Signaling channel not initialized');
        }
        
        await this.channel.send({
            type: 'broadcast',
            event: 'ice-candidate',
            payload: candidate
        });
    }

    /**
     * Закрытие канала
     */
    close() {
        if (this.channel) {
            this.supabase.removeChannel(this.channel);
        }
    }
}
