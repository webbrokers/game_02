-- Миграция для WebRTC Signaling
-- Запустите этот SQL скрипт в SQL Editor вашего проекта Supabase

-- 1. Создание таблицы signaling
create table if not exists signaling (
  id uuid default gen_random_uuid() primary key,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  room_id uuid references rooms(id) on delete cascade,
  type text not null, -- 'offer', 'answer', 'ice-candidate'
  data jsonb not null
);

-- 2. Индекс для быстрого поиска по комнате
create index if not exists signaling_room_id_idx on signaling(room_id);

-- 3. Функция для автоматического удаления старых сигналов
create or replace function delete_old_signaling()
returns trigger as $$
begin
  delete from signaling 
  where created_at < now() - interval '5 minutes';
  return new;
end;
$$ language plpgsql;

-- 4. Триггер для очистки
drop trigger if exists cleanup_signaling on signaling;
create trigger cleanup_signaling
  after insert on signaling
  execute function delete_old_signaling();

-- 5. Включение Realtime для таблицы
alter publication supabase_realtime add table signaling;

-- 6. Политики безопасности (RLS)
alter table signaling enable row level security;

-- Разрешаем чтение и запись всем (так же как для rooms)
create policy "Enable access for all users" on signaling for all using (true) with check (true);
