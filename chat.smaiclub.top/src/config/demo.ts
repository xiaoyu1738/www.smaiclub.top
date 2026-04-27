import type { Room, User } from "../types";

export const demoUser: User = {
  username: "preview_user",
  displayName: "预览用户",
  role: "owner",
  isBanned: false,
  avatarUrl: "",
};

export const demoRooms: { owned: Room[]; joined: Room[] } = {
  owned: [
    { id: 26001, name: "安全改造讨论", is_private: 1, key: "previewroomkey01" },
    { id: 26002, name: "很长的房间名称用于检查移动端布局稳定性", is_private: 0, key: "previewroomkey02" },
  ],
  joined: [
    { id: 90001, name: "工单同步", is_private: 0, key: "previewroomkey03" },
    { id: 90002, name: "密钥错误预览", is_private: 1, key: "wrongpreviewkey" },
  ],
};
