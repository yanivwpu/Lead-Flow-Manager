import { Chat, MOCK_CHATS, User } from "./data";

// Keys for local storage
const USERS_KEY = "chatcrm_users";
const CHATS_KEY_PREFIX = "chatcrm_chats_";
const CURRENT_USER_KEY = "chatcrm_current_user";

// Helper to get all users
function getUsers(): User[] {
  const users = localStorage.getItem(USERS_KEY);
  return users ? JSON.parse(users) : [];
}

// Helper to save users
function saveUsers(users: User[]) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

// Helper to get chats for a specific user
export function getUserChats(userId: string): Chat[] {
  const key = CHATS_KEY_PREFIX + userId;
  const chats = localStorage.getItem(key);
  if (chats) {
    return JSON.parse(chats);
  }
  // Initialize with mock data for new users
  localStorage.setItem(key, JSON.stringify(MOCK_CHATS));
  return MOCK_CHATS;
}

// Helper to save chats for a specific user
export function saveUserChats(userId: string, chats: Chat[]) {
  const key = CHATS_KEY_PREFIX + userId;
  localStorage.setItem(key, JSON.stringify(chats));
}

// Helper to update a single chat
export function updateUserChat(userId: string, chatId: string, updates: Partial<Chat>) {
  const chats = getUserChats(userId);
  const updatedChats = chats.map(c => c.id === chatId ? { ...c, ...updates } : c);
  saveUserChats(userId, updatedChats);
  return updatedChats;
}

// Auth simulation
export function findUserByEmail(email: string): User | undefined {
  const users = getUsers();
  return users.find(u => u.email === email);
}

export function createUser(user: User): boolean {
  const users = getUsers();
  if (users.some(u => u.email === user.email)) {
    return false; // User already exists
  }
  users.push(user);
  saveUsers(users);
  
  // Initialize their data
  saveUserChats(user.id, MOCK_CHATS);
  return true;
}

export function persistSession(user: User) {
  localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  localStorage.removeItem(CURRENT_USER_KEY);
}

export function getPersistedSession(): User | null {
  const user = localStorage.getItem(CURRENT_USER_KEY);
  return user ? JSON.parse(user) : null;
}
