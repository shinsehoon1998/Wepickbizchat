import { supabase } from './supabase';

export async function apiRequest(
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE',
  url: string,
  data?: unknown
): Promise<Response> {
  const { data: { session } } = await supabase.auth.getSession();
  const accessToken = session?.access_token;

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const options: RequestInit = {
    method,
    headers,
    credentials: 'include',
  };

  if (data && method !== 'GET') {
    options.body = JSON.stringify(data);
  }

  const response = await fetch(url, options);

  if (!response.ok) {
    if (response.status === 401) {
      await supabase.auth.signOut();
      window.location.href = '/auth';
    }
    throw new Error(`API Error: ${response.status}`);
  }

  return response;
}

export async function getWithAuth(url: string): Promise<Response> {
  return apiRequest('GET', url);
}
