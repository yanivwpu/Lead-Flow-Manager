// AI Chat storage - uses in-memory storage for AI conversations
// These are separate from CRM conversations

interface AIConversation {
  id: number;
  title: string;
  createdAt: Date;
}

interface AIMessage {
  id: number;
  conversationId: number;
  role: string;
  content: string;
  createdAt: Date;
}

let conversationIdCounter = 1;
let messageIdCounter = 1;
const conversationsStore: AIConversation[] = [];
const messagesStore: AIMessage[] = [];

export interface IChatStorage {
  getConversation(id: number): Promise<AIConversation | undefined>;
  getAllConversations(): Promise<AIConversation[]>;
  createConversation(title: string): Promise<AIConversation>;
  deleteConversation(id: number): Promise<void>;
  getMessagesByConversation(conversationId: number): Promise<AIMessage[]>;
  createMessage(conversationId: number, role: string, content: string): Promise<AIMessage>;
}

export const chatStorage: IChatStorage = {
  async getConversation(id: number) {
    return conversationsStore.find(c => c.id === id);
  },

  async getAllConversations() {
    return [...conversationsStore].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  },

  async createConversation(title: string) {
    const conversation: AIConversation = {
      id: conversationIdCounter++,
      title,
      createdAt: new Date(),
    };
    conversationsStore.push(conversation);
    return conversation;
  },

  async deleteConversation(id: number) {
    const index = conversationsStore.findIndex(c => c.id === id);
    if (index !== -1) conversationsStore.splice(index, 1);
    // Remove associated messages
    for (let i = messagesStore.length - 1; i >= 0; i--) {
      if (messagesStore[i].conversationId === id) {
        messagesStore.splice(i, 1);
      }
    }
  },

  async getMessagesByConversation(conversationId: number) {
    return messagesStore
      .filter(m => m.conversationId === conversationId)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  },

  async createMessage(conversationId: number, role: string, content: string) {
    const message: AIMessage = {
      id: messageIdCounter++,
      conversationId,
      role,
      content,
      createdAt: new Date(),
    };
    messagesStore.push(message);
    return message;
  },
};

