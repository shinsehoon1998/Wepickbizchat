import { useState, useEffect, useCallback } from 'react';
import { useQuery } from "@tanstack/react-query";
import { supabase } from '@/lib/supabase';
import type { User } from "@shared/schema";
import type { Session } from '@supabase/supabase-js';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [isAuthLoading, setIsAuthLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setIsAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setIsAuthLoading(false);
      }
    );

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const { data: user, isLoading: isUserLoading, refetch } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: false,
    enabled: !!session,
  });

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }, []);

  return {
    user: session ? user : undefined,
    session,
    isLoading: isAuthLoading || (!!session && isUserLoading),
    isAuthenticated: !!session && !!user,
    refetchUser: refetch,
    signOut,
  };
}
