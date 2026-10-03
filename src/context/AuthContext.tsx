/* =========================================================
   AUTHENTICATION CONTEXT & PROVIDER
   Specification: Multi-Tenant Identity Layer
   Manages Supabase Auth session, JWT tokens, user profile,
   and explicit demo mode fallback.
   ========================================================= */

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  logoutUser,
  devSimulateVerifyEmail,
  subscribeMockAuth,
  getCurrentMockUser,
} from "../services/authService";
import { supabase } from "../services/supabase";
import { FirestoreUserDocument } from "../types/firestore";
import { getUserMemberships, UserFamilyMembership } from "../services/familyService";
import { setSentryUser } from "../services/sentryService";

interface AuthContextType {
  user: any;
  userProfile: FirestoreUserDocument | null;
  memberships: UserFamilyMembership[];
  familyCount: number;
  loading: boolean;
  isAuthenticated: boolean;
  isEmailVerified: boolean;
  reloadUser: () => Promise<boolean>;
  refreshMemberships: () => Promise<UserFamilyMembership[]>;
  logout: () => Promise<void>;
  devSimulateVerify: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  userProfile: null,
  memberships: [],
  familyCount: 0,
  loading: true,
  isAuthenticated: false,
  isEmailVerified: false,
  reloadUser: async () => false,
  refreshMemberships: async () => [],
  logout: async () => {},
  devSimulateVerify: async () => {},
});

/**
 * Checks whether a Supabase user is confirmed according to Supabase Auth rules.
 * Users registered via OAuth (e.g. Google, GitHub) are confirmed by default.
 * Password-based users require email_confirmed_at / confirmed_at timestamp.
 */
function isSupabaseUserVerified(sbUser: any): boolean {
  if (!sbUser) return false;
  // OAuth providers auto-verify email
  const provider = sbUser.app_metadata?.provider;
  if (provider && provider !== "email") {
    return true;
  }
  return Boolean(sbUser.email_confirmed_at || sbUser.confirmed_at);
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<FirestoreUserDocument | null>(null);
  const [memberships, setMemberships] = useState<UserFamilyMembership[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const refreshMemberships = async (): Promise<UserFamilyMembership[]> => {
    if (!user) {
      setMemberships([]);
      return [];
    }
    const mems = await getUserMemberships(user.id || user.uid);
    setMemberships(mems);
    return mems;
  };

  const syncUserProfileAndMemberships = async (sbUser: any): Promise<UserFamilyMembership[]> => {
    setUser(sbUser);
    setSentryUser(sbUser.id);

    let profileData: any = null;
    try {
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", sbUser.id)
        .maybeSingle();
      if (!error && data) {
        profileData = data;
      }
    } catch (e) {
      console.warn("Profile fetch notice:", e);
    }

    const fullName =
      profileData?.full_name ||
      profileData?.first_name ||
      sbUser.user_metadata?.full_name ||
      sbUser.email?.split("@")[0] ||
      "Member User";
    const nameParts = fullName.split(" ");
    const verified = isSupabaseUserVerified(sbUser);

    setUserProfile({
      uid: sbUser.id,
      firstName: nameParts[0] || "User",
      lastName: nameParts.slice(1).join(" ") || "",
      displayName: fullName,
      email: profileData?.email || sbUser.email || "",
      mobile: profileData?.phone || sbUser.phone || "",
      photoURL: profileData?.avatar_url || sbUser.user_metadata?.avatar_url || "",
      emailVerified: verified,
      familyId: "",
      status: "active",
      createdAt: profileData?.created_at || sbUser.created_at || new Date().toISOString(),
      updatedAt: profileData?.updated_at || new Date().toISOString(),
    });

    const mems = await getUserMemberships(sbUser.id);
    setMemberships(mems);
    return mems;
  };

  useEffect(() => {
    // 1. Check existing Supabase session first
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session && session.user) {
        await syncUserProfileAndMemberships(session.user);
        setLoading(false);
      } else {
        // Check if there is an explicit mock user for demo
        const mock = getCurrentMockUser();
        if (mock) {
          const mockWithFlag = { ...mock, isMock: true };
          setUser(mockWithFlag);
          setSentryUser(mock.uid);
          const nameParts = (mock.displayName || "Family Head").split(" ");
          setUserProfile({
            uid: mock.uid,
            firstName: nameParts[0] || "User",
            lastName: nameParts.slice(1).join(" ") || "",
            displayName: mock.displayName || "Family Head",
            email: mock.email || "",
            mobile: mock.phoneNumber || "",
            photoURL: mock.photoURL || "",
            emailVerified: Boolean(mock.emailVerified),
            familyId: `family_${mock.uid.slice(0, 8)}`,
            status: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        } else {
          setUser(null);
          setSentryUser(null);
          setUserProfile(null);
          setMemberships([]);
        }
        setLoading(false);
      }
    });

    // 2. Supabase Auth state listener for all auth events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session && session.user) {
        await syncUserProfileAndMemberships(session.user);
        setLoading(false);
      } else if (event === "SIGNED_OUT") {
        setUser(null);
        setSentryUser(null);
        setUserProfile(null);
        setMemberships([]);
        setLoading(false);
      }
    });

    // 3. Mock Auth listener for demo mode switching
    const unsubMock = subscribeMockAuth((mockUser) => {
      if (!user || user.isMock) {
        if (mockUser) {
          const mockWithFlag = { ...mockUser, isMock: true };
          setUser(mockWithFlag);
          setSentryUser(mockUser.uid);
          const nameParts = (mockUser.displayName || "Family Head").split(" ");
          setUserProfile({
            uid: mockUser.uid,
            firstName: nameParts[0] || "User",
            lastName: nameParts.slice(1).join(" ") || "",
            displayName: mockUser.displayName || "Family Head",
            email: mockUser.email || "",
            mobile: mockUser.phoneNumber || "",
            photoURL: mockUser.photoURL || "",
            emailVerified: Boolean(mockUser.emailVerified),
            familyId: `family_${mockUser.uid.slice(0, 8)}`,
            status: "active",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        } else {
          setUser(null);
          setSentryUser(null);
          setUserProfile(null);
        }
      }
    });

    return () => {
      subscription.unsubscribe();
      unsubMock();
    };
  }, []);

  const reloadUser = async (): Promise<boolean> => {
    try {
      // For real Supabase sessions, fetch fresh user from server
      const { data: { user: freshUser }, error } = await supabase.auth.getUser();
      if (!error && freshUser) {
        await syncUserProfileAndMemberships(freshUser);
        return isSupabaseUserVerified(freshUser);
      }

      // If no remote session, check mock user
      const mock = getCurrentMockUser();
      return Boolean(mock?.emailVerified);
    } catch (err) {
      console.error("Failed to reload user verification state:", err);
      return false;
    }
  };

  const devSimulateVerify = async (): Promise<void> => {
    if (!user) return;

    // Safety guard: Never allow demo simulation to mark a real Supabase user as verified
    if (!user.isMock) {
      console.warn(
        "[AuthContext] Cannot simulate email verification for live Supabase user. Real users must confirm via email link."
      );
      return;
    }

    await devSimulateVerifyEmail(user.uid || user.id);
    setUser((prev: any) => (prev ? { ...prev, emailVerified: true } : null));
    if (userProfile) {
      setUserProfile((prev) => (prev ? { ...prev, emailVerified: true } : null));
    }
  };

  const logout = async (): Promise<void> => {
    await logoutUser();
    setUser(null);
    setSentryUser(null);
    setUserProfile(null);
  };

  // Derive verification strictly from Supabase's verified email fields or explicit demo mode
  const isEmailVerified = (() => {
    if (!user) return false;
    if (user.isMock) {
      return Boolean(user.emailVerified);
    }
    return isSupabaseUserVerified(user);
  })();

  const isAuthenticated = Boolean(user);

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        memberships,
        familyCount: memberships.length,
        loading,
        isAuthenticated,
        isEmailVerified,
        reloadUser,
        refreshMemberships,
        logout,
        devSimulateVerify,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
