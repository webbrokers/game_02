import { SUPABASE_URL, SUPABASE_KEY } from './supabase-config.js';

/**
 * War Tanks II - Network Handler
 * Синхронизация через Supabase Broadcast.
 */
export class NetworkHandler {
    constructor(roomId, playerName) {
        this.roomId = roomId;
        this.playerName = playerName;
        this.channel = null;
        this.onPlayerUpdate = null; // Callback для обновления чужого танка
        this.onPlayerFire = null;   // Callback для выстрела
        this.onPlayerJoined = null;
        
        const { createClient } = supabase;
        this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    }

    async connect() {
        this.channel = this.supabase.channel(`room_${this.roomId}`, {
            config: {
                broadcast: { self: false },
            },
        });

        this.channel
            .on('broadcast', { event: 'position' }, ({ payload }) => {
                if (this.onPlayerUpdate) this.onPlayerUpdate(payload);
            })
            .on('broadcast', { event: 'fire' }, ({ payload }) => {
                if (this.onPlayerFire) this.onPlayerFire(payload);
            })
            .on('presence', { event: 'sync' }, () => {
                const state = this.channel.presenceState();
                if (this.onPlayerJoined) this.onPlayerJoined(state);
            })
            .subscribe(async (status) => {
                if (status === 'SUBSCRIBED') {
                    await this.channel.track({
                        name: this.playerName,
                        joined_at: new Date().toISOString(),
                    });
                }
            });
    }

    sendPosition(data) {
        if (!this.channel) return;
        this.channel.send({
            type: 'broadcast',
            event: 'position',
            payload: data
        });
    }

    sendFire(data) {
        if (!this.channel) return;
        this.channel.send({
            type: 'broadcast',
            event: 'fire',
            payload: data
        });
    }

    async closeRoom() {
        // Если мы хост, помечаем комнату в БД как неактивную
        const { error } = await this.supabase
            .from('rooms')
            .update({ status: 'closed' })
            .eq('id', this.roomId);
            
        if (error) console.error('Error closing room:', error);
    }
}
