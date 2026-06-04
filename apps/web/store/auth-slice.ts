import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
  workspace_id: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
}

const TOKEN_KEY = 'vencore_token';

function loadToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(TOKEN_KEY);
}

const initialState: AuthState = {
  token: loadToken(),
  user: null,
};

export const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setAuth(state, action: PayloadAction<{ token: string; user: AuthUser }>) {
      state.token = action.payload.token;
      state.user = action.payload.user;
      if (typeof window !== 'undefined') {
        localStorage.setItem(TOKEN_KEY, action.payload.token);
      }
    },
    setUser(state, action: PayloadAction<AuthUser>) {
      state.user = action.payload;
    },
    clearAuth(state) {
      state.token = null;
      state.user = null;
      if (typeof window !== 'undefined') {
        localStorage.removeItem(TOKEN_KEY);
      }
    },
  },
});

export const { setAuth, setUser, clearAuth } = authSlice.actions;
export default authSlice.reducer;
