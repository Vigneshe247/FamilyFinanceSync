/* =========================================================
   SUPABASE CLIENT & AUTH SERVICE WRAPPER (Production-Ready)
   Supports: Email/Password, Google OAuth, GitHub OAuth,
   Auto-provisioning Family Workspaces & Session Persistence.
   ========================================================= */

import { createClient, User as SupabaseUser, Session } from '@supabase/supabase-js';

const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_URL ||
  'https://fwhyqhgilvbdxppiiirr.supabase.co';

const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
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
   * Ensure user has a profile, default family workspace, and is assigned as Family Head
   */
  async ensureUserFamilyWorkspace(user: SupabaseUser, fullName: string, phone?: string) {
    try {
      // 1. Upsert profile
      await supabase.from('profiles').upsert({
        id: user.id,
        full_name: fullName || user.email?.split('@')[0] || 'Family Head',
        email: user.email,
        phone: phone || '',
        updated_at: new Date().toISOString(),
      });

      // 2. Check if user already belongs to a family
      const { data: existingMembership } = await supabase
        .from('family_members')
        .select('family_id')
        .eq('user_id', user.id)
        .limit(1);

      if (!existingMembership || existingMembership.length === 0) {
        // 3. Create default family
        const familyName = fullName ? `${fullName}'s Family` : 'My Family Workspace';
        const { data: newFamily, error: familyErr } = await supabase
          .from('families')
          .insert({
            name: familyName,
            owner_id: user.id,
            currency: 'INR',
            timezone: 'Asia/Kolkata',
          })
          .select()
          .single();

        if (familyErr) {
          console.warn('Could not auto-create family table record:', familyErr.message);
          return null;
        }

        if (newFamily) {
          // 4. Add user as Family Head in family_members
          await supabase.from('family_members').insert({
            family_id: newFamily.id,
            user_id: user.id,
            role_id: 'FAMILY_HEAD',
            status: 'active',
            monthly_allowance: 0,
            monthly_spending_limit: 0,
          });

          // 5. Create default starter accounts
          await supabase.from('accounts').insert([
            {
              family_id: newFamily.id,
              name: 'Main Bank Account',
              type: 'bank',
              balance: 5000000, // ₹50,000 in paise
              currency: 'INR',
              is_shared: true,
            },
            {
              family_id: newFamily.id,
              name: 'Cash In Hand',
              type: 'cash',
              balance: 1000000, // ₹10,000 in paise
              currency: 'INR',
              is_shared: true,
            },
          ]);

          // 6. Create default starter categories
          await supabase.from('categories').insert([
            { family_id: newFamily.id, name: 'Salary', type: 'income', color: '#16A34A', is_default: true },
            { family_id: newFamily.id, name: 'Food & Dining', type: 'expense', color: '#E5A11E', is_default: true },
            { family_id: newFamily.id, name: 'Groceries', type: 'expense', color: '#3E8BF5', is_default: true },
            { family_id: newFamily.id, name: 'Utilities & Bills', type: 'expense', color: '#9B51E0', is_default: true },
            { family_id: newFamily.id, name: 'Transportation', type: 'expense', color: '#EC4899', is_default: true },
            { family_id: newFamily.id, name: 'Education', type: 'expense', color: '#06B6D4', is_default: true },
          ]);

          return newFamily.id;
        }
      } else {
        return existingMembership[0].family_id;
      }
    } catch (err) {
      console.warn('Workspace provisioning deferred or offline:', err);
    }
    return null;
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
