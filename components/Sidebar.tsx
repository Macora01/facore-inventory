import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import { useHashNavigation } from '../hooks/useHashNavigation';
import {
  LayoutDashboard, Package, ShoppingCart, ClipboardCheck,
  Truck, ArrowLeftRight, Search, FileText, Settings, LogOut, Menu, X, Upload
} from 'lucide-react';
import { APP_NAME } from '../version';

interface NavItem {
  hash: string;
  label: string;
  icon: React.FC<{ size?: number }>;
  roles: string[];
}

const NAV_ITEMS: NavItem[] = [
  { hash: '#/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin', 'operador', 'visita'] },
  { hash: '#/inventory', label: 'Catálogo', icon: Package, roles: ['admin', 'operador', 'visita'] },
  { hash: '#/sales', label: 'Vender', icon: ShoppingCart, roles: ['admin', 'operador', 'vendedora'] },
  { hash: '#/approvals', label: 'Aprobaciones', icon: ClipboardCheck, roles: ['admin', 'operador'] },
  { hash: '#/purchases', label: 'Compras', icon: Truck, roles: ['admin', 'operador'] },
  { hash: '#/movements', label: 'Movimientos', icon: ArrowLeftRight, roles: ['admin', 'operador', 'visita'] },
  { hash: '#/traceability', label: 'Trazabilidad', icon: Search, roles: ['admin', 'operador', 'visita'] },
  { hash: '#/reports', label: 'Reportes', icon: FileText, roles: ['admin', 'operador', 'visita'] },
  { hash: '#/upload', label: 'Carga Masiva', icon: Upload, roles: ['admin', 'operador'] },
  { hash: '#/settings', label: 'Configuración', icon: Settings, roles: ['admin'] },
];

const Sidebar: React.FC = () => {
  const { currentUser, logout } = useApp();
  const { currentHash, navigateTo } = useHashNavigation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Cerrar sidebar al navegar en móvil
  const handleNav = (hash: string) => {
    navigateTo(hash);
    setMobileOpen(false);
  };

  // Cerrar sidebar al hacer clic fuera
  useEffect(() => {
    if (!mobileOpen) return;
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (!target.closest('.sidebar-panel') && !target.closest('.sidebar-toggle')) {
        setMobileOpen(false);
      }
    };
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [mobileOpen]);

  // Bloquear scroll cuando sidebar móvil está abierto
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [mobileOpen]);

  const visibleItems = NAV_ITEMS.filter(
    item => currentUser && item.roles.includes(currentUser.role)
  );

  const isActive = (hash: string) => {
    if (hash === '#/') return currentHash === '#/' || currentHash === '#/dashboard';
    return currentHash === hash;
  };

  const sidebarContent = (
    <>
      {/* Header */}
      <div className="p-5 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-clay/20 flex items-center justify-center shrink-0">
            <span className="text-clay-light text-sm font-semibold">F</span>
          </div>
          <div className="min-w-0">
            <p className="text-white text-sm font-semibold tracking-tight truncate">{APP_NAME}</p>
            <p className="text-white/30 text-[10px] font-medium uppercase tracking-wider">
              {currentUser?.role === 'admin' ? 'Admin' : currentUser?.role === 'operador' ? 'Operador' : currentUser?.role === 'visita' ? 'Visita' : 'Vendedora'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {visibleItems.map(item => (
          <button
            key={item.hash}
            onClick={() => handleNav(item.hash)}
            className={`sidebar-nav-item w-full flex items-center gap-3 px-3 py-3 rounded-lg text-sm
                       transition-all duration-150 group
                       ${isActive(item.hash)
                         ? 'bg-sidebar-active text-white font-medium'
                         : 'text-white/50 hover:text-white/80 hover:bg-sidebar-hover'
                       }`}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </button>
        ))}
      </nav>

      {/* User & Logout */}
      <div className="p-3 border-t border-white/5">
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0">
            <p className="text-white/70 text-xs font-medium truncate">
              {currentUser?.displayName || currentUser?.username}
            </p>
          </div>
          <button
            onClick={logout}
            className="sidebar-logout p-2.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5
                       transition-all duration-150"
            title="Cerrar sesión"
          >
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile hamburger */}
      <button
        className="sidebar-toggle lg:hidden fixed top-3 left-3 z-30 p-2.5 rounded-lg
                   bg-sidebar text-white shadow-lg"
        onClick={() => setMobileOpen(!mobileOpen)}
        aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
      >
        {mobileOpen ? <X size={22} /> : <Menu size={22} />}
      </button>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 bg-black/50 z-40 transition-opacity" />
      )}

      {/* Desktop sidebar (siempre visible) */}
      <aside className="hidden lg:flex w-56 min-h-screen bg-sidebar flex-col shrink-0">
        {sidebarContent}
      </aside>

      {/* Mobile sidebar (overlay) */}
      <aside
        className={`sidebar-panel lg:hidden fixed inset-y-0 left-0 z-50 w-64 bg-sidebar flex flex-col
                   transform transition-transform duration-250 ease-out
                   ${mobileOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        {/* Close button en panel */}
        <div className="absolute top-3 right-3">
          <button
            onClick={() => setMobileOpen(false)}
            className="p-2 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/5"
          >
            <X size={20} />
          </button>
        </div>
        {sidebarContent}
      </aside>
    </>
  );
};

export default Sidebar;
