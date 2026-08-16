import { createContext, useContext, useState, useEffect, useCallback, useRef } from "react";
import { useLocation } from "wouter";
import { trackSignUp } from "@/lib/ga4Events";
import { queryClient } from "@/lib/queryClient";
import {
  applyDatabaseLanguagePreference,
  clearExplicitLanguageSelection,
  resolveSignupLanguagePreference,
} from "@/lib/userLanguagePreference";
import {
  clearAccountLocalHints,
  fetchAuthoritativeSessionUser,
  resetAccountQueryCache,
  sessionIdentitiesMatch,
  type SessionUser,
} from "@/lib/accountQueryScope";

interface User {
  id: string;
  name: string;
  email: string;
  avatarUrl?: string | null;
  role?: string | null;
  emailVerifiedAt?: string | null;
  /** Set when a self-service deletion request has been recorded (pending processing). */
  deletionRequestedAt?: string | null;
  /** Saved account language preference from /api/auth/me (en | es | he). */
  language?: string | null;
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
  /** True after a no-store /api/auth/me confirms cookie identity matches `user`. */
  sessionAligned: boolean;
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

function asAppUser(session: SessionUser): User {
  return session as unknown as User;
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sessionAligned, setSessionAligned] = useState(false);
  const [location, setLocation] = useLocation();
  const userRef = useRef<User | null>(null);
  const mismatchAttemptsRef = useRef(0);

  const replaceSessionUser = useCallback((next: User | null, aligned: boolean) => {
    const prevId = userRef.current?.id ?? null;
    const nextId = next?.id ?? null;
    if (prevId !== nextId) {
      resetAccountQueryCache(queryClient);
      clearAccountLocalHints();
    }
    userRef.current = next;
    setUser(next);
    setSessionAligned(aligned && !!nextId);
  }, []);

  const refreshSession = useCallback(async () => {
    try {
      const session = await fetchAuthoritativeSessionUser();
      const currentId = userRef.current?.id ?? null;
      if (!session) {
        mismatchAttemptsRef.current = 0;
        replaceSessionUser(null, false);
        return;
      }
      if (currentId && !sessionIdentitiesMatch(currentId, session.id)) {
        mismatchAttemptsRef.current += 1;
        if (mismatchAttemptsRef.current > 2) {
          replaceSessionUser(null, false);
          return;
        }
        replaceSessionUser(asAppUser(session), true);
        mismatchAttemptsRef.current = 0;
        return;
      }
      mismatchAttemptsRef.current = 0;
      replaceSessionUser(asAppUser(session), true);
    } catch (error) {
      console.error("Failed to refresh session:", error);
      // Transient network errors must not flip AUTH MATCH → splash/mismatch loop.
    }
  }, [replaceSessionUser]);

  useEffect(() => {
    (async () => {
      try {
        await refreshSession();
      } finally {
        setIsLoading(false);
      }
    })();
  }, [refreshSession]);

  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      void refreshSession();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refreshSession]);

  // Restore DB language once auth is known (and when leaving public URL-locale routes).
  useEffect(() => {
    if (isLoading || !user) return;
    void applyDatabaseLanguagePreference(user.language);
  }, [user?.id, user?.language, location, isLoading]);

  const login = async (email: string, password: string, rememberMe: boolean = false): Promise<boolean> => {
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, rememberMe }),
        credentials: "include",
        cache: "no-store",
      });

      if (!response.ok) return false;

      const session = await fetchAuthoritativeSessionUser();
      if (!session) {
        replaceSessionUser(null, false);
        return false;
      }
      replaceSessionUser(asAppUser(session), true);
      return true;
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
      const language = resolveSignupLanguagePreference();
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
          language,
        }),
        credentials: "include",
        cache: "no-store",
      });

      const data = await response.json().catch(() => ({}));

      if (response.ok && data.pendingVerification) {
        // GA4 sign_up fires after email verification once we have a session user id
        return { success: true, pendingVerification: true };
      }

      if (response.ok && data.id) {
        const session = await fetchAuthoritativeSessionUser();
        if (!session || session.id !== data.id) {
          replaceSessionUser(null, false);
          return { success: false, error: "Could not start a signed-in session. Please log in." };
        }
        replaceSessionUser(asAppUser(session), true);
        trackSignUp({ method: "email", plan: "free", userId: session.id });
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
        cache: "no-store",
      });
    } catch (error) {
      console.error("Logout error:", error);
    } finally {
      resetAccountQueryCache(queryClient);
      clearAccountLocalHints();
      clearExplicitLanguageSelection();
      userRef.current = null;
      setUser(null);
      setSessionAligned(false);
      // Keep whachatcrm_language — not auth-sensitive; public URL locale still wins on marketing pages.
      setLocation("/");
    }
  };

  return (
    <AuthContext.Provider
      value={{ user, isLoading, sessionAligned, login, signup, logout, refreshSession, resendVerification }}
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
