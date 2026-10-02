/* =========================================================
   AUTHENTICATION CONTEXT & PROVIDER
   Specification: Multi-Tenant Identity Layer
   Manages Supabase Auth session, JWT tokens, user profile,
   and demo mode fallback.
   ========================================================= */

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  logoutUser,
  checkEmailVerification,
  devSimulateVerifyEmail,
  subscribeMockAuth,
  getCurrentMockUser,
} from "../services/authService";
import { supabase, supabaseAuthService } from "../services/supabase";
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

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<any>(null);
  const [userProfile, setUserProfile] = useState<FirestoreUserDocument | null>(null);
  const [memberships, setMemberships] = useState<UserFamilyMembership[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [localVerifiedOverride, setLocalVerifiedOverride] = useState<boolean>(false);

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
        .from('profiles')
        .select('*')
        .eq('id', sbUser.id)
        .maybeSingle();
      if (!error && data) {
        profileData = data;
      }
    } catch (e) {
      console.warn('Profile fetch notice:', e);
    }

    const fullName =
      profileData?.full_name ||
      profileData?.first_name ||
      sbUser.user_metadata?.full_name ||
      sbUser.email?.split('@')[0] ||
      'Member User';
    const nameParts = fullName.split(' ');

    setUserProfile({
      uid: sbUser.id,
      firstName: nameParts[0] || 'User',
      lastName: nameParts.slice(1).join(' ') || '',
      displayName: fullName,
      email: profileData?.email || sbUser.email || '',
      mobile: profileData?.phone || sbUser.phone || '',
      photoURL: profileData?.avatar_url || sbUser.user_metadata?.avatar_url || '',
      emailVerified: Boolean(sbUser.email_confirmed_at || sbUser.emailVerified || true),
      familyId: '',
      status: 'active',
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
        setUser(null);
        setSentryUser(null);
        setUserProfile(null);
        setMemberships([]);
        setLoading(false);
      }
    });

    // 2. Supabase Auth state listener for all auth events
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session && session.user) {
        await syncUserProfileAndMemberships(session.user);
        setLoading(false);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setSentryUser(null);
        setUserProfile(null);
        setMemberships([]);
        setLoading(false);
      }
    });

    // 3. Mock Auth listener for demo mode switching
    const unsubMock = subscribeMockAuth((mockUser) => {
      if (!user) {
        setUser(mockUser);
        if (mockUser) {
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
      const verified = await checkEmailVerification();
      if (verified) {
        setLocalVerifiedOverride(true);
      }
      return verified;
    } catch (err) {
      console.error("Failed to reload user:", err);
      return false;
    }
  };

  const devSimulateVerify = async (): Promise<void> => {
    if (!user) return;
    setLocalVerifiedOverride(true);
    await devSimulateVerifyEmail(user.uid || user.id);
    if (userProfile) {
      setUserProfile((prev) => (prev ? { ...prev, emailVerified: true } : null));
    }
  };

  const logout = async (): Promise<void> => {
    await logoutUser();
    setUser(null);
    setSentryUser(null);
    setUserProfile(null);
    setLocalVerifiedOverride(false);
  };

  const isEmailVerified = Boolean(
    localVerifiedOverride ||
    (user && (user.email_confirmed_at || user.emailVerified)) ||
    (userProfile && userProfile.emailVerified)
  );

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
