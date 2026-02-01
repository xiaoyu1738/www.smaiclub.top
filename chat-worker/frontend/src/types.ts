export interface User {
    username: string;
    role: string;
    isBanned: boolean;
    bannedUntil?: number;
    avatarUrl: string;
}

export interface Room {
    id: number | string;
    name: string;
    is_private?: number;
    key: string;
}