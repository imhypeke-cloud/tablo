-- Миграция 001: Создание таблиц системы LIVE-табло

-- Таблица сотрудников
CREATE TABLE employees (
    id SERIAL PRIMARY KEY,
    employee_id VARCHAR(100) UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    category VARCHAR(50) NOT NULL CHECK (category IN ('worker', 'itr', 'contractor', 'guest')),
    company VARCHAR(255),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_employees_employee_id ON employees(employee_id);
CREATE INDEX idx_employees_category ON employees(category);
CREATE INDEX idx_employees_company ON employees(company);

-- Таблица контрольных точек (КПП)
CREATE TABLE checkpoints (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    code VARCHAR(100) UNIQUE NOT NULL,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_checkpoints_code ON checkpoints(code);

-- Таблица событий доступа
CREATE TABLE access_events (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    checkpoint_id INTEGER REFERENCES checkpoints(id) ON DELETE SET NULL,
    event_type VARCHAR(10) NOT NULL CHECK (event_type IN ('entry', 'exit')),
    event_time TIMESTAMP WITH TIME ZONE NOT NULL,
    source_system VARCHAR(100),
    raw_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_access_events_employee ON access_events(employee_id);
CREATE INDEX idx_access_events_event_time ON access_events(event_time);
CREATE INDEX idx_access_events_event_type ON access_events(event_type);
CREATE INDEX idx_access_events_date ON access_events((DATE(event_time)));
CREATE INDEX idx_access_events_checkpoint ON access_events(checkpoint_id);

-- Таблица текущего присутствия
CREATE TABLE current_presence (
    id SERIAL PRIMARY KEY,
    employee_id INTEGER UNIQUE NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
    is_inside BOOLEAN NOT NULL DEFAULT false,
    last_entry_time TIMESTAMP WITH TIME ZONE,
    last_exit_time TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_current_presence_is_inside ON current_presence(is_inside);
CREATE INDEX idx_current_presence_employee ON current_presence(employee_id);

-- Таблица дневной статистики (для кэширования)
CREATE TABLE daily_statistics (
    id SERIAL PRIMARY KEY,
    date DATE UNIQUE NOT NULL,
    total_entries INTEGER DEFAULT 0,
    total_exits INTEGER DEFAULT 0,
    entries_by_category JSONB DEFAULT '{}',
    exits_by_category JSONB DEFAULT '{}',
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_daily_statistics_date ON daily_statistics(date);

-- Триггер для обновления updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_employees_updated_at BEFORE UPDATE ON employees
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_current_presence_updated_at BEFORE UPDATE ON current_presence
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_daily_statistics_updated_at BEFORE UPDATE ON daily_statistics
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Представление для быстрой статистики
CREATE VIEW dashboard_stats AS
SELECT 
    (SELECT COUNT(*) FROM current_presence WHERE is_inside = true) as total_inside,
    (SELECT COUNT(*) FROM access_events WHERE event_type = 'entry' AND DATE(event_time) = CURRENT_DATE) as total_entries_today,
    (SELECT COUNT(*) FROM access_events WHERE event_type = 'exit' AND DATE(event_time) = CURRENT_DATE) as total_exits_today;

-- Представление статистики по категориям
CREATE VIEW category_stats AS
SELECT 
    e.category,
    COUNT(CASE WHEN cp.is_inside = true THEN 1 END) as inside_count,
    COUNT(CASE WHEN ae.event_type = 'entry' AND DATE(ae.event_time) = CURRENT_DATE THEN 1 END) as entries_today,
    COUNT(CASE WHEN ae.event_type = 'exit' AND DATE(ae.event_time) = CURRENT_DATE THEN 1 END) as exits_today
FROM employees e
LEFT JOIN current_presence cp ON e.id = cp.employee_id
LEFT JOIN access_events ae ON e.id = ae.employee_id
GROUP BY e.category;

-- Функция для обработки события доступа
CREATE OR REPLACE FUNCTION process_access_event(
    p_employee_id VARCHAR,
    p_checkpoint_code VARCHAR,
    p_event_type VARCHAR,
    p_event_time TIMESTAMP WITH TIME ZONE,
    p_source_system VARCHAR,
    p_raw_data JSONB
)
RETURNS INTEGER AS $$
DECLARE
    v_employee_id INTEGER;
    v_checkpoint_id INTEGER;
    v_access_event_id INTEGER;
    v_is_inside BOOLEAN;
BEGIN
    -- Получаем или создаем сотрудника
    SELECT id INTO v_employee_id FROM employees WHERE employee_id = p_employee_id;
    
    IF v_employee_id IS NULL THEN
        -- Создаем нового сотрудника с дефолтными значениями
        INSERT INTO employees (employee_id, full_name, category)
        VALUES (p_employee_id, 'Сотрудник ' || p_employee_id, 'worker')
        RETURNING id INTO v_employee_id;
    END IF;
    
    -- Получаем КПП
    SELECT id INTO v_checkpoint_id FROM checkpoints WHERE code = p_checkpoint_code;
    
    -- Создаем событие доступа
    INSERT INTO access_events (employee_id, checkpoint_id, event_type, event_time, source_system, raw_data)
    VALUES (v_employee_id, v_checkpoint_id, p_event_type, p_event_time, p_source_system, p_raw_data)
    RETURNING id INTO v_access_event_id;
    
    -- Обновляем текущее присутствие
    IF p_event_type = 'entry' THEN
        v_is_inside = true;
        
        INSERT INTO current_presence (employee_id, is_inside, last_entry_time)
        VALUES (v_employee_id, true, p_event_time)
        ON CONFLICT (employee_id) DO UPDATE SET
            is_inside = true,
            last_entry_time = p_event_time,
            updated_at = CURRENT_TIMESTAMP;
            
    ELSE
        v_is_inside = false;
        
        INSERT INTO current_presence (employee_id, is_inside, last_exit_time)
        VALUES (v_employee_id, false, p_event_time)
        ON CONFLICT (employee_id) DO UPDATE SET
            is_inside = false,
            last_exit_time = p_event_time,
            updated_at = CURRENT_TIMESTAMP;
    END IF;
    
    -- Обновляем дневную статистику
    INSERT INTO daily_statistics (date, total_entries, total_exits)
    VALUES (DATE(p_event_time), 
            CASE WHEN p_event_type = 'entry' THEN 1 ELSE 0 END,
            CASE WHEN p_event_type = 'exit' THEN 1 ELSE 0 END)
    ON CONFLICT (date) DO UPDATE SET
        total_entries = total_entries + CASE WHEN p_event_type = 'entry' THEN 1 ELSE 0 END,
        total_exits = total_exits + CASE WHEN p_event_type = 'exit' THEN 1 ELSE 0 END,
        updated_at = CURRENT_TIMESTAMP;
    
    RETURN v_access_event_id;
END;
$$ LANGUAGE plpgsql;

-- Начальные данные для КПП
INSERT INTO checkpoints (name, code) VALUES 
    ('Главный вход', 'MAIN_GATE'),
    ('Вход №2', 'GATE_2'),
    ('Вход №3', 'GATE_3');
