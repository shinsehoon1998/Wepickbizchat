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

  const { data: user, isLoading: isUserLoading, isError, error, refetch } = useQuery<User>({
    queryKey: ["/api/auth/user"],
    retry: 2,
    retryDelay: 1000,
    enabled: !!session,
  });

  useEffect(() => {
    if (isError && error) {
      console.error('Failed to fetch user:', error);
    }
  }, [isError, error]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    window.location.href = "/auth";
  }, []);

  const isLoading = isAuthLoading || (!!session && isUserLoading && !isError);

  return {
    user: session ? user : undefined,
    session,
    isLoading,
    isError,
    isAuthenticated: !!session && !!user,
    refetchUser: refetch,
    signOut,
  };
}
