import { SUPABASE_URL, SUPABASE_KEY } from './supabase-config.js';

// Инициализация Supabase
const { createClient } = supabase;
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_KEY);

const createBtn = document.getElementById('create-room');
const refreshBtn = document.getElementById('refresh-list');
const roomsList = document.getElementById('rooms-list');
const modal = document.getElementById('create-modal');
const cancelBtn = document.getElementById('cancel-create');
const createForm = document.getElementById('create-form');

// Флаг для предотвращения удаления комнаты при переходе на другую страницу игры
let isNavigatingAway = false;

// Загрузка списка комнат
async function fetchRooms() {
    roomsList.innerHTML = '<li class="menu-item">Загрузка...</li>';
    
    const { data, error } = await supabaseClient
        .from('rooms')
        .select('*')
        .eq('status', 'active')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching rooms:', error);
        roomsList.innerHTML = '<li class="menu-item" style="color: red;">Ошибка загрузки</li>';
        return;
    }

    if (data.length === 0) {
        roomsList.innerHTML = '<li class="menu-item">Нет активных игр</li>';
        return;
    }

    roomsList.innerHTML = '';
    data.forEach(room => {
        const li = document.createElement('li');
        li.className = 'menu-item-container'; // Используем новый класс контейнера
        
        const a = document.createElement('a');
        a.href = `select.html?room=${room.id}${room.has_password ? '&pw=1' : ''}`;
        a.className = 'menu-link room-link';
        a.innerHTML = `${room.name} ${room.has_password ? '🔒' : ''}`;
        
        a.onclick = (e) => {
            if (room.has_password) {
                const pass = prompt('Введите пароль:');
                if (pass !== room.password) {
                    alert('Неверный пароль!');
                    e.preventDefault();
                    return;
                }
            }
        };

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'delete-room-btn';
        deleteBtn.innerHTML = '×';
        deleteBtn.title = 'Удалить комнату';
        deleteBtn.onclick = async (e) => {
            e.stopPropagation();
            if (room.has_password) {
                const pass = prompt('Для удаления введите пароль комнаты:');
                if (pass !== room.password) {
                    alert('Неверный пароль! Удаление отменено.');
                    return;
                }
            } else {
                if (!confirm(`Вы уверены, что хотите удалить комнату "${room.name}"?`)) {
                    return;
                }
            }
            await deleteRoom(room.id);
        };

        li.appendChild(a);
        li.appendChild(deleteBtn);
        roomsList.appendChild(li);
    });
}

/**
 * Ручное удаление комнаты
 */
async function deleteRoom(id) {
    const { error } = await supabaseClient
        .from('rooms')
        .update({ status: 'closed' })
        .eq('id', id);

    if (error) {
        alert('Ошибка при удалении: ' + error.message);
    } else {
        fetchRooms(); // Обновляем список
    }
}

// Показ модалки
createBtn.onclick = () => {
    modal.style.display = 'flex';
};

// Скрытие модалки
cancelBtn.onclick = () => {
    modal.style.display = 'none';
};

// Создание комнаты
createForm.onsubmit = async (e) => {
    e.preventDefault();
    
    const name = document.getElementById('room-name').value;
    const password = document.getElementById('room-password').value;
    
    const { data, error } = await supabaseClient
        .from('rooms')
        .insert([
            { 
                name, 
                password: password || null, 
                has_password: !!password,
                status: 'active',
                host_name: localStorage.getItem('wt2:player-name') || 'Commander'
            }
        ])
        .select();

    if (error) {
        alert('Ошибка при создании комнаты: ' + error.message);
        return;
    }

    const room = data[0];
    // Помечаем, что мы хост этой комнаты
    sessionStorage.setItem('wt2:hosted-room-id', room.id);
    isNavigatingAway = true;
    
    // Переходим на выбор танка с ID комнаты
    window.location.href = `select.html?room=${room.id}&host=1`;
};

/**
 * Закрытие комнаты в БД
 */
async function closeHostedRoom() {
    const roomId = sessionStorage.getItem('wt2:hosted-room-id');
    if (!roomId) return;

    // Используем fetch с keepalive для надежности при закрытии вкладки
    const body = JSON.stringify({ status: 'closed' });
    const url = `${SUPABASE_URL}/rest/v1/rooms?id=eq.${roomId}`;
    
    try {
        await fetch(url, {
            method: 'PATCH',
            headers: {
                'apikey': SUPABASE_KEY,
                'Authorization': `Bearer ${SUPABASE_KEY}`,
                'Content-Type': 'application/json',
                'Prefer': 'return=minimal'
            },
            body: body,
            keepalive: true
        });
        sessionStorage.removeItem('wt2:hosted-room-id');
    } catch (e) {
        console.error('Ошибка при закрытии комнаты:', e);
    }
}

// Обработка перехода на другие страницы (чтобы не закрывать комнату)
document.addEventListener('click', (e) => {
    const link = e.target.closest('a');
    if (link) {
        isNavigatingAway = true;
    }
});

// Обработка выхода со страницы
window.addEventListener('beforeunload', () => {
    if (!isNavigatingAway) {
        closeHostedRoom();
    }
});

// Дополнительно: закрытие комнаты если нажали кнопку "Назад" в браузере
window.addEventListener('popstate', () => {
    closeHostedRoom();
});

// Инициализация
refreshBtn.onclick = fetchRooms;
fetchRooms();
