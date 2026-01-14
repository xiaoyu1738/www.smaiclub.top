DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS chat_sessions;
DROP TABLE IF EXISTS room_members;
DROP TABLE IF EXISTS rooms;

-- Rooms Table
CREATE TABLE rooms (
    id INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    is_private INTEGER DEFAULT 0,
    owner TEXT NOT NULL,
    owner_role TEXT DEFAULT 'user',
    created_at INTEGER NOT NULL,
    last_accessed INTEGER NOT NULL
);

CREATE INDEX idx_rooms_owner ON rooms(owner);

-- Room Members Table
CREATE TABLE room_members (
    room_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    joined_at INTEGER NOT NULL,
    PRIMARY KEY (room_id, user_id),
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE INDEX idx_room_members_user ON room_members(user_id);

-- Chat Sessions Table (New)
CREATE TABLE chat_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    user_id TEXT NOT NULL,
    start_time INTEGER NOT NULL,
    end_time INTEGER,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

CREATE INDEX idx_chat_sessions_room_user ON chat_sessions(room_id, user_id);

-- Messages Table
CREATE TABLE messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    room_id INTEGER NOT NULL,
    iv TEXT NOT NULL,
    content TEXT NOT NULL,
    sender TEXT NOT NULL,
    sender_role TEXT DEFAULT 'user',
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_messages_room_created ON messages(room_id, created_at);

-- Activity Logs Table (New)
CREATE TABLE activity_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL, -- 'login', 'register', 'create_room', 'delete_room', 'message', 'ownership_transfer'
    user_id TEXT,
    details TEXT, -- Encrypted JSON content
    ip_address TEXT,
    created_at INTEGER NOT NULL
);

CREATE INDEX idx_activity_logs_created ON activity_logs(created_at);
CREATE INDEX idx_activity_logs_type ON activity_logs(event_type);

-- Seed "Issues" Room (Emergency Mode)
INSERT INTO rooms (id, name, is_private, owner, owner_role, created_at, last_accessed)
VALUES (1, 'Issues', 0, 'system', 'admin', 1735689600000, 1735689600000);

-- Command to clear all rooms except Emergency Room (ID 1)
-- DELETE FROM messages WHERE room_id != 1;
-- DELETE FROM room_members WHERE room_id != 1;
-- DELETE FROM rooms WHERE id != 1;
