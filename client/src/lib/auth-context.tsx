import { createContext, useContext, useState, useEffect, useCallback } from "react";
import { useLocation } from "wouter";
import { trackSignUp } from "@/lib/ga4Events";

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role?: string | null;
  emailVerifiedAt?: string | null;
  /** Set when a self-service deletion request has been recorded (pending processing). */
  deletionRequestedAt?: string | null;
}

export type SignupOptions = {
  phoneNumber?: string;
  businessName?: string;
  turnstileToken?: string | null;
  /** Honeypot — must stay empty for real users */
  website?: string;
};

export type SignupResult = {
  success: boolean;
  pendingVerification?: boolean;
  error?: string;
};

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string, rememberMe?: boolean) => Promise<boolean>;
  signup: (
    name: string,
    email: string,
    password: string,
    options?: SignupOptions,
  ) => Promise<SignupResult>;
  logout: () => void;
  refreshSession: () => Promise<void>;
  resendVerification: (email: string) => Promise<{ ok: boolean; error?: string }>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [, setLocation] = useLocation();

  const refreshSession = useCallback(async () => {
    try {
      const response = await fetch("/api/auth/me", { credentials: "include" });
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        setUser(null);
      }
    } catch (error) {
      console.error("Failed to refresh session:", error);
    }
  }, []);

  useEffect(() => {
    (async () => {
      try {
        await refreshSession();
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshSession]);

  const login = async (email: string, password: string, rememberMe: boolean = false): Promise<boolean> => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe }),
        credentials: "include",
      });

      if (response.ok) {
        const me = await fetch("/api/auth/me", { credentials: "include" });
        if (me.ok) {
          setUser(await me.json());
        } else {
          setUser(await response.json());
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error("Login error:", error);
      return false;
    }
  };

  const signup = async (
    name: string,
    email: string,
    password: string,
    options: SignupOptions = {},
  ): Promise<SignupResult> => {
    try {
      const response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          email,
          password,
          phoneNumber: options.phoneNumber || "",
          businessName: options.businessName || "",
          turnstileToken: options.turnstileToken || undefined,
          website: options.website || "",
        }),
        credentials: "include",
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.pendingVerification) {
        // GA4 sign_up fires after email verification once we have a session user id
        return { success: true, pendingVerification: true };
      }

      if (response.ok && data.id) {
        setUser(data);
        trackSignUp({ method: "email", plan: "free", userId: data.id });
        return { success: true };
      }

      console.error("Signup failed:", response.status, data);
      return { success: false, error: data.error || "Signup failed" };
    } catch (error) {
      console.error("Signup error:", error);
      return { success: false, error: "Network error - please try again" };
    }
  };

  const resendVerification = async (email: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const response = await fetch("/api/auth/resend-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "include",
      });
      if (response.status === 429) {
        const data = await response.json().catch(() => ({}));
        return { ok: false, error: data.error || "Too many requests. Please try again shortly." };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: "Network error - please try again" };
    }
  };

  const logout = async () => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "include",
      });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      setUser(null);
      setLocation("/");
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, isLoading, login, signup, logout, refreshSession, resendVerification }}
    >
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
