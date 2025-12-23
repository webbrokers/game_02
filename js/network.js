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
        
        // Для delta compression - сохраняем последнее отправленное состояние
        this.lastSentState = null;
        
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

    /**
     * Отправка только изменившихся полей (delta compression)
     * Снижает размер сообщения в 2-3 раза
     */
    sendPositionDelta(data) {
        if (!this.channel) return;
        
        // Первая отправка - отправляем все поля
        if (!this.lastSentState) {
            this.lastSentState = { ...data };
            this.sendPosition(data);
            return;
        }
        
        // Формируем delta - только изменившиеся поля
        const delta = { id: data.id }; // ID всегда нужен для идентификации
        let hasChanges = false;
        
        // Проверяем каждое поле на изменение
        const threshold = 0.5; // Порог для позиции/углов (игнорируем микроизменения)
        
        if (data.name !== this.lastSentState.name) {
            delta.name = data.name;
            hasChanges = true;
        }
        
        if (Math.abs(data.x - this.lastSentState.x) > threshold) {
            delta.x = data.x;
            hasChanges = true;
        }
        
        if (Math.abs(data.y - this.lastSentState.y) > threshold) {
            delta.y = data.y;
            hasChanges = true;
        }
        
        if (Math.abs(data.hullAngle - this.lastSentState.hullAngle) > threshold) {
            delta.hullAngle = data.hullAngle;
            hasChanges = true;
        }
        
        if (Math.abs(data.turretAngle - this.lastSentState.turretAngle) > threshold) {
            delta.turretAngle = data.turretAngle;
            hasChanges = true;
        }
        
        if (Math.abs(data.health - this.lastSentState.health) > 0.01) {
            delta.health = data.health;
            hasChanges = true;
        }
        
        if (data.isDestroyed !== this.lastSentState.isDestroyed) {
            delta.isDestroyed = data.isDestroyed;
            hasChanges = true;
        }
        
        if (data.presetId !== this.lastSentState.presetId) {
            delta.presetId = data.presetId;
            hasChanges = true;
        }
        
        // Отправляем только если есть изменения
        if (hasChanges) {
            this.channel.send({
                type: 'broadcast',
                event: 'position',
                payload: delta
            });
            
            // Обновляем последнее отправленное состояние
            this.lastSentState = { ...data };
        }
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

    /**
     * Закрытие комнаты через beacon (для beforeunload)
     */
    static closeRoomBeacon(roomId) {
        if (!roomId) return;
        
        const body = JSON.stringify({ status: 'closed' });
        const url = `${SUPABASE_URL}/rest/v1/rooms?id=eq.${roomId}`;
        
        // Используем fetch с keepalive: true для отправки запроса после закрытия вкладки
        fetch(url, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: body,
            keepalive: true
        }).catch(err => console.error('Beacon error:', err));
    }
}
