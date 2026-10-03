/* =========================================================
   SUPABASE CLIENT & AUTH SERVICE WRAPPER (Production-Ready)
   Supports: Email/Password, Google OAuth, GitHub OAuth,
   Auto-provisioning Family Workspaces & Session Persistence.
   ========================================================= */

import { createClient, User as SupabaseUser, Session } from '@supabase/supabase-js';

const metaEnv: Record<string, any> =
  typeof import.meta !== 'undefined' && (import.meta as any).env
    ? (import.meta as any).env
    : typeof process !== 'undefined' && process.env
    ? process.env
    : {};

const SUPABASE_URL =
  metaEnv.VITE_SUPABASE_URL ||
  metaEnv.NEXT_PUBLIC_SUPABASE_URL ||
  'https://fwhyqhgilvbdxppiiirr.supabase.co';

const SUPABASE_ANON_KEY =
  metaEnv.VITE_SUPABASE_PUBLISHABLE_KEY ||
  metaEnv.VITE_SUPABASE_ANON_KEY ||
  metaEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_Uaq6TUPUXJiyTwwvhIvNkw__jFzIsc3';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
});

export interface RegisterUserParams {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  mobile?: string;
}

export const supabaseAuthService = {
  /**
   * Register a new individual user and automatically provision their Family workspace
   * (Section 44: Registration != Role Selection. Every user starts as Family Head of their family)
   */
  async signUp({ firstName, lastName, email, password, mobile }: RegisterUserParams) {
    const fullName = `${firstName} ${lastName}`.trim();
    const cleanEmail = email.trim().toLowerCase();

    try {
      const { data, error } = await supabase.auth.signUp({
        email: cleanEmail,
        password,
        options: {
          data: {
            full_name: fullName,
            first_name: firstName,
            last_name: lastName,
            phone: mobile || '',
          },
        },
      });

      if (error) throw error;
      const user = data.user;

      if (user) {
        // Attempt database workspace auto-provisioning
        await this.ensureUserFamilyWorkspace(user, fullName, mobile);
      }

      return { success: true, user: data.user, session: data.session };
    } catch (err: any) {
      console.error('Supabase Auth SignUp error:', err);
      return { success: false, error: err.message || 'Registration failed' };
    }
  },

  /**
   * Ensure user has a profile and default family workspace using atomic server-side RPC
   */
  async ensureUserFamilyWorkspace(_user: SupabaseUser, fullName: string, _mobile?: string) {
    try {
      const familyName = fullName ? `${fullName}'s Family` : 'My Family Workspace';
      const { data, error } = await supabase.rpc('create_family', {
        p_name: familyName,
        p_description: null,
        p_family_code: null,
      });

      if (error) {
        console.warn('[supabase] Atomic create_family notice:', error.message);
        return null;
      }

      return data?.family_id || null;
    } catch (err: unknown) {
      console.warn('[supabase] Workspace provisioning notice:', err);
      return null;
    }
  },

  async signInWithPassword(email: string, password: string) {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      });
      if (error) throw error;
      return { success: true, user: data.user, session: data.session };
    } catch (err: any) {
      console.error('Supabase Auth SignIn error:', err);
      return { success: false, error: err.message || 'Invalid email or password' };
    }
  },

  async signInWithGoogle() {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
      return { success: true, data };
    } catch (err: any) {
      console.error('Supabase Google OAuth error:', err);
      return { success: false, error: err.message || 'Google sign in failed' };
    }
  },

  async signInWithGitHub() {
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'github',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
      }
      return { success: true, data };
    } catch (err: any) {
      console.error('Supabase GitHub OAuth error:', err);
      return { success: false, error: err.message || 'GitHub sign in failed' };
    }
  },

  async resetPasswordForEmail(email: string) {
    try {
      const { data, error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/forgot-password`,
      });
      if (error) throw error;
      return { success: true, data };
    } catch (err: any) {
      console.error('Supabase Reset Password error:', err);
      return { success: false, error: err.message };
    }
  },

  async signOut() {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      return { success: true };
    } catch (err: any) {
      console.error('Supabase SignOut error:', err);
      return { success: false, error: err.message };
    }
  },

  async getSession(): Promise<Session | null> {
    try {
      const { data } = await supabase.auth.getSession();
      return data.session;
    } catch {
      return null;
    }
  },

  async getCurrentUser(): Promise<SupabaseUser | null> {
    try {
      const { data } = await supabase.auth.getUser();
      return data.user;
    } catch {
      return null;
    }
  },

  onAuthStateChange(callback: (event: string, session: Session | null) => void) {
    return supabase.auth.onAuthStateChange(callback);
  },
};
