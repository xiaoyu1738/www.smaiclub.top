DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS rooms;

-- Rooms Table
CREATE TABLE rooms (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    is_private INTEGER DEFAULT 0,
    owner TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_accessed INTEGER NOT NULL
);

-- Messages Table
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    iv TEXT NOT NULL,
    content TEXT NOT NULL,
    sender TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

-- Seed "Issues" Room (Emergency Mode)
INSERT INTO rooms (id, name, is_private, owner, created_at, last_accessed)
VALUES (1, 'Issues', 0, 'system', 1735689600000, 1735689600000);
