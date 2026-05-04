import React, { createContext, useState, useContext, useCallback, useEffect } from 'react';
import type { User, Product, Stock, Movement, Location, PurchaseOrder, PendingSale } from '../types';
import { APP_VERSION } from '../version';

const API = '/api';

interface AppContextType {
  // Auth
  currentUser: User | null;
  isAuthenticated: boolean;
  loading: boolean;
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;

  // Data
  products: Product[];
  stock: Stock[];
  movements: Movement[];
  locations: Location[];
  users: User[];
  purchaseOrders: PurchaseOrder[];
  pendingSales: PendingSale[];

  // Fetch
  fetchData: (entity: string) => Promise<any>;
  fetchAll: () => Promise<void>;
  
  // Mutations
  createEntity: (entity: string, data: any) => Promise<any>;
  updateEntity: (entity: string, id: string, data: any) => Promise<any>;
  deleteEntity: (entity: string, id: string) => Promise<any>;
  
  // Sales
  approveSale: (saleId: string) => Promise<void>;
  rejectSale: (saleId: string, notes?: string) => Promise<void>;

  // Status
  dbStatus: string;
  error: string | null;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [dbStatus, setDbStatus] = useState<string>('checking');

  // Data
  const [products, setProducts] = useState<Product[]>([]);
  const [stock, setStock] = useState<Stock[]>([]);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>([]);
  const [pendingSales, setPendingSales] = useState<PendingSale[]>([]);

  const isAuthenticated = !!currentUser;

  // ── Auth Check on Mount ──
  useEffect(() => {
    checkSession();
  }, []);

  async function checkSession() {
    try {
      const res = await fetch(`${API}/auth/me`, { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        fetchAll();
      }
    } catch {
      // No hay sesión activa
    } finally {
      setLoading(false);
    }
  }

  async function login(username: string, password: string): Promise<boolean> {
    try {
      const res = await fetch(`${API}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      if (res.ok) {
        const data = await res.json();
        setCurrentUser(data.user);
        fetchAll();
        return true;
      }
      return false;
    } catch {
      return false;
    }
  }

  async function logout() {
    await fetch(`${API}/auth/logout`, { method: 'POST', credentials: 'include' });
    setCurrentUser(null);
  }

  // ── Data Fetching ──
  async function fetchData(entity: string): Promise<any> {
    try {
      const res = await fetch(`${API}/${entity}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Error fetching ${entity}`);
      const data = await res.json();
      
      // Store in state
      const setters: Record<string, Function> = {
        products: setProducts,
        stock: setStock,
        movements: setMovements,
        locations: setLocations,
        users: setUsers,
        'purchases': setPurchaseOrders,
        'sales/pending': setPendingSales,
      };
      if (setters[entity]) setters[entity](data);
      return data;
    } catch (err: any) {
      setError(err.message);
      return null;
    }
  }

  async function fetchAll() {
    await Promise.allSettled([
      fetchData('products'),
      fetchData('stock'),
      fetchData('movements'),
      fetchData('locations'),
      fetchData('purchases'),
      fetchData('sales/pending'),
    ]);
  }

  // ── CRUD Mutations ──
  async function createEntity(entity: string, data: any) {
    const res = await fetch(`${API}/${entity}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (res.ok) fetchData(entity);
    return res.json();
  }

  async function updateEntity(entity: string, id: string, data: any) {
    const res = await fetch(`${API}/${entity}/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(data),
    });
    if (res.ok) fetchData(entity);
    return res.json();
  }

  async function deleteEntity(entity: string, id: string) {
    const res = await fetch(`${API}/${entity}/${id}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    if (res.ok) fetchData(entity);
    return res.json();
  }

  // ── Sales Approval ──
  async function approveSale(saleId: string) {
    await fetch(`${API}/sales/${saleId}/approve`, {
      method: 'POST',
      credentials: 'include',
    });
    fetchData('sales/pending');
    fetchData('stock');
    fetchData('movements');
  }

  async function rejectSale(saleId: string, notes?: string) {
    await fetch(`${API}/sales/${saleId}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ notes }),
    });
    fetchData('sales/pending');
  }

  const value: AppContextType = {
    currentUser, isAuthenticated, loading, login, logout,
    products, stock, movements, locations, users, purchaseOrders, pendingSales,
    fetchData, fetchAll,
    createEntity, updateEntity, deleteEntity,
    approveSale, rejectSale,
    dbStatus, error,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp debe usarse dentro de AppProvider');
  return ctx;
}
