import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import KnowledgeBase from './pages/KnowledgeBase';
import CustomerAnalysis from './pages/CustomerAnalysis';
import Products from './pages/Products';
import Training from './pages/Training';
import SalesAssistance from './pages/SalesAssistance';
import InstructorDashboard from './pages/InstructorDashboard';
import Login from './pages/Login';
import Register from './pages/Register';

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public routes */}
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />

          {/* Protected routes */}
          <Route
            path="/*"
            element={
              <ProtectedRoute>
                <Layout>
                  <Routes>
                    <Route path="/" element={<Dashboard />} />
                    <Route path="/knowledge" element={<KnowledgeBase />} />
                    <Route path="/customers" element={<CustomerAnalysis />} />
                    <Route path="/products" element={<Products />} />
                    <Route path="/training" element={<Training />} />
                    <Route path="/sales-assistance" element={<SalesAssistance />} />
                    <Route path="/instructor" element={<InstructorDashboard />} />
                    <Route path="*" element={<Navigate to="/" replace />} />
                  </Routes>
                </Layout>
              </ProtectedRoute>
            }
          />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
