import { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { api, setToken } from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);

  useEffect(() => {
    AsyncStorage.getItem('loanlens.session').then((raw) => {
      if (!raw) return;
      const { token, user: savedUser } = JSON.parse(raw);
      setToken(token);
      setUser(savedUser);
    });
  }, []);

  async function login(email, password) {
    const { token, user: u } = await api.login(email, password);
    setToken(token);
    setUser(u);
    await AsyncStorage.setItem('loanlens.session', JSON.stringify({ token, user: u }));
  }

  async function register(payload) {
    const { token, user: u } = await api.register(payload);
    setToken(token);
    setUser(u);
    await AsyncStorage.setItem('loanlens.session', JSON.stringify({ token, user: u }));
  }

  async function logout() {
    setToken(null);
    setUser(null);
    await AsyncStorage.removeItem('loanlens.session');
  }

  return <AuthContext.Provider value={{ user, login, register, logout }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
