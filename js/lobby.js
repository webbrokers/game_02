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
        li.className = 'menu-item';
        
        const a = document.createElement('a');
        a.href = `select.html?room=${room.id}${room.has_password ? '&pw=1' : ''}`;
        a.className = 'menu-link';
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

        li.appendChild(a);
        roomsList.appendChild(li);
    });
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
    // Переходим на выбор танка с ID комнаты
    window.location.href = `select.html?room=${room.id}&host=1`;
};

// Инициализация
refreshBtn.onclick = fetchRooms;
fetchRooms();

// Удаление комнаты при выходе (если хост) - базовая реализация
window.onbeforeunload = () => {
    // В идеале это должно быть через Supabase Presence или Edge Function
    // Но для начала просто уведомление в базу если успеем
};
