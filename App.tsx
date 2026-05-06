import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { ToastProvider } from './hooks/useToast';
import { useHashNavigation } from './hooks/useHashNavigation';
import Sidebar from './components/Sidebar';
import LoginPage from './pages/LoginPage';
import SalesPage from './pages/SalesPage';
import ApprovalsPage from './pages/ApprovalsPage';
import InventoryPage from './pages/InventoryPage';
import PurchasesPage from './pages/PurchasesPage';
import MovementsPage from './pages/MovementsPage';
import UploadPage from './pages/UploadPage';
import SettingsPage from './pages/SettingsPage';
import TraceabilityPage from './pages/TraceabilityPage';
import ReportsPage from './pages/ReportsPage';
import { motion, AnimatePresence } from 'motion/react';

const AppContent: React.FC = () => {
  const { isAuthenticated, loading, currentUser } = useApp();
  const { currentHash } = useHashNavigation();

  if (loading) {
    return (
      <div className="min-h-screen bg-canvas flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-12 h-12 mx-auto border-2 border-clay border-t-transparent rounded-full animate-spin" />
          <p className="text-text-secondary text-sm font-medium tracking-wide">
            INICIALIZANDO FACORE
          </p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || !currentUser) {
    return <LoginPage />;
  }

  const renderPage = () => {
    switch (currentHash) {
      case '#/inventory': return <InventoryPage />;
      case '#/sales': return <SalesPage />;
      case '#/approvals': return <ApprovalsPage />;
      case '#/purchases': return <PurchasesPage />;
      case '#/movements': return <MovementsPage />;
      case '#/traceability': return <TraceabilityPage />;
      case '#/reports': return <ReportsPage />;
      case '#/upload': return <UploadPage />;
      case '#/settings': return <SettingsPage />;
      default: return <PlaceholderPage title="Dashboard" />;
    }
  };

  return (
    <div className="flex min-h-screen bg-canvas">
      <Sidebar />
      <main className="flex-1 p-4 pt-16 lg:p-8 lg:pt-8 h-screen overflow-y-auto">
        <div className="max-w-7xl mx-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentHash}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
            >
              {renderPage()}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
};

const PlaceholderPage: React.FC<{ title: string }> = ({ title }) => (
  <div className="page-container animate-fade-in">
    <h2 className="page-title">{title}</h2>
    <p className="page-subtitle">Esta sección será implementada en la fase correspondiente.</p>
    <div className="mt-8 p-12 border-2 border-dashed border-border rounded-xl text-center text-text-muted">
      <p className="text-lg font-medium">{title}</p>
      <p className="text-sm mt-2">Fase de desarrollo pendiente</p>
    </div>
  </div>
);

const App: React.FC = () => {
  return (
    <ToastProvider>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ToastProvider>
  );
};

export default App;
