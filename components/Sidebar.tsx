import React from 'react';
import { useApp } from '../context/AppContext';
import { useHashNavigation } from '../hooks/useHashNavigation';
import {
  LayoutDashboard, Package, ShoppingCart, ClipboardCheck,
  Truck, ArrowLeftRight, Search, FileText, Settings, LogOut, ChevronLeft
} from 'lucide-react';
import { APP_NAME } from '../version';

interface NavItem {
  hash: string;
  label: string;
  icon: React.FC<{ size?: number }>;
  roles: string[];
}

const NAV_ITEMS: NavItem[] = [
  { hash: '#/', label: 'Dashboard', icon: LayoutDashboard, roles: ['admin'] },
  { hash: '#/inventory', label: 'Catálogo', icon: Package, roles: ['admin'] },
  { hash: '#/sales', label: 'Vender', icon: ShoppingCart, roles: ['admin', 'vendedora'] },
  { hash: '#/approvals', label: 'Aprobaciones', icon: ClipboardCheck, roles: ['admin'] },
  { hash: '#/purchases', label: 'Compras', icon: Truck, roles: ['admin'] },
  { hash: '#/movements', label: 'Movimientos', icon: ArrowLeftRight, roles: ['admin'] },
  { hash: '#/traceability', label: 'Trazabilidad', icon: Search, roles: ['admin'] },
  { hash: '#/reports', label: 'Reportes', icon: FileText, roles: ['admin'] },
  { hash: '#/settings', label: 'Configuración', icon: Settings, roles: ['admin'] },
];

const Sidebar: React.FC = () => {
  const { currentUser, logout } = useApp();
  const { currentHash, navigateTo } = useHashNavigation();

  const visibleItems = NAV_ITEMS.filter(
    item => currentUser && item.roles.includes(currentUser.role)
  );

  const isActive = (hash: string) => {
    if (hash === '#/') return currentHash === '#/' || currentHash === '#/dashboard';
    return currentHash === hash;
  };

  return (
    <aside className="w-56 min-h-screen bg-sidebar flex flex-col shrink-0">
      {/* Header */}
      <div className="p-5 border-b border-white/5">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-clay/20 flex items-center justify-center">
            <span className="text-clay-light text-sm font-semibold">F</span>
          </div>
          <div>
            <p className="text-white text-sm font-semibold tracking-tight">{APP_NAME}</p>
            <p className="text-white/30 text-[10px] font-medium uppercase tracking-wider">
              {currentUser?.role === 'admin' ? 'Admin' : 'Vendedora'}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 px-2 space-y-0.5 overflow-y-auto">
        {visibleItems.map(item => (
          <button
            key={item.hash}
            onClick={() => navigateTo(item.hash)}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm
                       transition-all duration-150 group
                       ${isActive(item.hash)
                         ? 'bg-sidebar-active text-white font-medium'
                         : 'text-white/50 hover:text-white/80 hover:bg-sidebar-hover'
                       }`}
          >
            <item.icon size={18} />
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
            className="p-2 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/5
                       transition-all duration-150"
            title="Cerrar sesión"
          >
            <LogOut size={16} />
          </button>
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
