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
import { DEMO_MEMBERS } from "../data/seedData";

import { getUserMemberships, UserFamilyMembership } from "../services/familyService";

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
  loginAsDemoMember: (memberId?: string) => Promise<void>;
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
  loginAsDemoMember: async () => {},
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

  useEffect(() => {
    // 1. Check Supabase session first
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session && session.user) {
        const sbUser = session.user;
        setUser(sbUser);
        const nameParts = (sbUser.user_metadata?.full_name || sbUser.email?.split('@')[0] || "Member User").split(" ");
        setUserProfile({
          uid: sbUser.id,
          firstName: nameParts[0] || "User",
          lastName: nameParts.slice(1).join(" ") || "",
          displayName: sbUser.user_metadata?.full_name || nameParts[0] || "Member User",
          email: sbUser.email || "",
          mobile: sbUser.phone || "",
          photoURL: sbUser.user_metadata?.avatar_url || "",
          emailVerified: true,
          familyId: "",
          status: "active",
          createdAt: sbUser.created_at,
          updatedAt: new Date().toISOString(),
        });
        const mems = await getUserMemberships(sbUser.id);
        setMemberships(mems);
        setLoading(false);
      } else {
        setUser(null);
        setUserProfile(null);
        setMemberships([]);
        setLoading(false);
      }
    });

    // 2. Supabase Auth state listener
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session && session.user) {
        const sbUser = session.user;
        setUser(sbUser);
        const fullName = sbUser.user_metadata?.full_name || sbUser.user_metadata?.name || sbUser.email?.split('@')[0] || "Member User";
        const nameParts = fullName.split(" ");

        setUserProfile({
          uid: sbUser.id,
          firstName: nameParts[0] || "User",
          lastName: nameParts.slice(1).join(" ") || "",
          displayName: fullName,
          email: sbUser.email || "",
          mobile: sbUser.phone || "",
          photoURL: sbUser.user_metadata?.avatar_url || "",
          emailVerified: true,
          familyId: "",
          status: "active",
          createdAt: sbUser.created_at,
          updatedAt: new Date().toISOString(),
        });
        const mems = await getUserMemberships(sbUser.id);
        setMemberships(mems);
      } else if (event === 'SIGNED_OUT') {
        setUser(null);
        setUserProfile(null);
        setMemberships([]);
      }
    });

    // 3. Mock Auth listener for demo mode switching
    const unsubMock = subscribeMockAuth((mockUser) => {
      if (!user) {
        setUser(mockUser);
        if (mockUser) {
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
    setUserProfile(null);
    setLocalVerifiedOverride(false);
  };

  const loginAsDemoMember = async (memberId: string = 'mem-raj'): Promise<void> => {
    const member = DEMO_MEMBERS.find(m => m.id === memberId) || DEMO_MEMBERS[0];
    const demoUser = {
      uid: member.user_id,
      email: member.user.email,
      displayName: member.user.name,
      emailVerified: true,
      phoneNumber: "+91 98765 43210",
      photoURL: member.user.avatar_url || "",
      role: member.role,
      reload: async () => {},
    };

    localStorage.setItem("ffs_current_mock_user", JSON.stringify(demoUser));
    localStorage.setItem("ffs_demo_v2_active_member_id", JSON.stringify(member.id));
    localStorage.setItem("ffs_demo_v2_is_demo_mode", JSON.stringify(true));

    setUser(demoUser);
    const nameParts = member.user.name.split(" ");
    setUserProfile({
      uid: member.user_id,
      firstName: nameParts[0] || "User",
      lastName: nameParts.slice(1).join(" ") || "",
      displayName: member.user.name,
      email: member.user.email,
      mobile: "+91 98765 43210",
      photoURL: member.user.avatar_url || "",
      emailVerified: true,
      familyId: "fam-demo-001",
      status: "active",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setLocalVerifiedOverride(true);
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
        loginAsDemoMember,
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
