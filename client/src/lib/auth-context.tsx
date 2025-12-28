import { createContext, useContext, useState, useEffect, ReactNode } from "react";
import { useLocation } from "wouter";
import * as storage from "./storage";
import { User } from "./data";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  signup: (name: string, email: string, password: string) => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // const [, setLocation] = useLocation();

  useEffect(() => {
    // Check for persisted session on mount
    const persistedUser = storage.getPersistedSession();
    if (persistedUser) {
      setUser(persistedUser);
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const foundUser = storage.findUserByEmail(email);
    
    if (foundUser && foundUser.password === password) {
      const { password, ...safeUser } = foundUser;
      setUser(safeUser as User);
      storage.persistSession(safeUser as User);
      return true;
    }
    return false;
  };

  const signup = async (name: string, email: string, password: string): Promise<boolean> => {
    // Simulate network delay
    await new Promise(resolve => setTimeout(resolve, 800));
    
    const newUser: User = {
      id: Math.random().toString(36).substring(2, 9),
      name,
      email,
      password
    };
    
    const success = storage.createUser(newUser);
    
    if (success) {
      const { password, ...safeUser } = newUser;
      setUser(safeUser as User);
      storage.persistSession(safeUser as User);
      return true;
    }
    return false;
  };

  const logout = () => {
    setUser(null);
    storage.clearSession();
    window.location.hash = "/";
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, signup, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
