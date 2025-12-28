import { type User, type InsertUser, type Chat, type InsertChat } from "@shared/schema";
import { db } from "../drizzle/db";
import { users, chats } from "@shared/schema";
import { eq, and, lte, sql, isNotNull, asc } from "drizzle-orm";

export interface IStorage {
  // User methods
  getUser(id: string): Promise<User | undefined>;
  getUserByEmail(email: string): Promise<User | undefined>;
  createUser(user: InsertUser): Promise<User>;
  updateUser(id: string, updates: Partial<User>): Promise<User | undefined>;
  
  // Chat methods
  getChats(userId: string): Promise<Chat[]>;
  getChat(id: string): Promise<Chat | undefined>;
  createChat(chat: InsertChat): Promise<Chat>;
  updateChat(id: string, updates: Partial<Chat>): Promise<Chat | undefined>;
  deleteChat(id: string): Promise<void>;
  
  // Notification methods
  getDueFollowUps(): Promise<Chat[]>;
}

export class DbStorage implements IStorage {
  async getUser(id: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.id, id));
    return result[0];
  }

  async getUserByEmail(email: string): Promise<User | undefined> {
    const result = await db.select().from(users).where(eq(users.email, email));
    return result[0];
  }

  async createUser(insertUser: InsertUser): Promise<User> {
    const result = await db.insert(users).values(insertUser).returning();
    return result[0];
  }

  async updateUser(id: string, updates: Partial<User>): Promise<User | undefined> {
    const result = await db.update(users).set(updates).where(eq(users.id, id)).returning();
    return result[0];
  }

  async getChats(userId: string): Promise<Chat[]> {
    return await db.select().from(chats).where(eq(chats.userId, userId)).orderBy(asc(chats.createdAt));
  }

  async getChat(id: string): Promise<Chat | undefined> {
    const result = await db.select().from(chats).where(eq(chats.id, id));
    return result[0];
  }

  async createChat(chat: InsertChat): Promise<Chat> {
    const result = await db.insert(chats).values(chat).returning();
    return result[0];
  }

  async updateChat(id: string, updates: Partial<Chat>): Promise<Chat | undefined> {
    const result = await db
      .update(chats)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(chats.id, id))
      .returning();
    return result[0];
  }

  async deleteChat(id: string): Promise<void> {
    await db.delete(chats).where(eq(chats.id, id));
  }

  async getDueFollowUps(): Promise<Chat[]> {
    const now = new Date();
    return await db
      .select()
      .from(chats)
      .where(
        and(
          isNotNull(chats.followUpDate),
          lte(chats.followUpDate, now)
        )
      );
  }
}

export const storage = new DbStorage();
