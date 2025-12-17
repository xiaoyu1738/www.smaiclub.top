DROP TABLE IF EXISTS messages;
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id TEXT NOT NULL,
    username TEXT NOT NULL,
    role TEXT,
    content TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

DROP TABLE IF EXISTS rooms;
CREATE TABLE rooms (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    min_role_level INTEGER DEFAULT 0
);

-- Seed initial rooms
INSERT INTO rooms (id, name, description, min_role_level) VALUES
('lobby', '公共大厅', '欢迎所有人', 0),
('vip', 'VIP 休息室', 'VIP 会员专属', 1),
('svip', 'SVIP 俱乐部', 'SVIP 尊享', 2);
