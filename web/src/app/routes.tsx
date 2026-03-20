import { createBrowserRouter, Navigate } from "react-router";
import { MainLayout } from "./components/layout/MainLayout";
import { Login } from "./pages/Login";
import { Dashboard } from "./pages/Dashboard";
import { BotDetail } from "./pages/BotDetail";
import { Settings } from "./pages/Settings";
import { PluginManager } from "./pages/PluginManager";
import { useAuthStore } from "./stores/authStore";

// Auth Guard Wrapper
const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }
  return <>{children}</>;
};

export const router = createBrowserRouter([
  {
    path: "/login",
    Component: Login,
  },
  {
    path: "/",
    Component: MainLayout,
    children: [
      { 
        index: true, 
        element: (
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        ) 
      },
      { 
        path: "bot/:selfId?", 
        element: (
          <ProtectedRoute>
            <BotDetail />
          </ProtectedRoute>
        ) 
      },
      { 
        path: "settings", 
        element: (
          <ProtectedRoute>
            <Settings />
          </ProtectedRoute>
        ) 
      },
      // Shortcuts for other items in sidebar to redirect to Dashboard or placeholders
      { 
        path: "plugins", 
        element: (
          <ProtectedRoute>
            <PluginManager />
          </ProtectedRoute>
        )
      },
      { 
        path: "debug", 
        element: <Navigate to="/bot" replace /> 
      },
      { 
        path: "logs", 
        element: <Navigate to="/bot" replace /> 
      },
      { path: "*", Component: () => <div className="p-10">Page Not Found</div> },
    ],
  },
]);
