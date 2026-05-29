import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import ProtectedRoute from './components/ProtectedRoute';
import Layout from './components/Layout';
import TauriTitlebar from './components/TauriTitlebar';
import Dashboard from './pages/Dashboard';
import KnowledgeBase from './pages/KnowledgeBase';
import CustomerAnalysis from './pages/CustomerAnalysis';
import Products from './pages/Products';
import Training from './pages/Training';
import RealTimeVoice from './pages/RealTimeVoice';
import PostSalesAnalysis from './pages/PostSalesAnalysis';
import FeedbackPage from './pages/Feedback';
import InstructorDashboard from './pages/InstructorDashboard';
import AdminUsers from './pages/AdminUsers';
import AdminFeedback from './pages/AdminFeedback';
import Login from './pages/Login';
import Register from './pages/Register';

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <div className="flex flex-col h-screen overflow-hidden">
          <TauriTitlebar />
          <div className="flex-1 min-h-0">
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
                        <Route path="/post-sales" element={<PostSalesAnalysis />} />
                        <Route path="/realtime" element={<RealTimeVoice />} />
                        <Route path="/feedback" element={<FeedbackPage />} />
                        <Route path="/instructor" element={<InstructorDashboard />} />
                        <Route path="/admin/users" element={<AdminUsers />} />
                        <Route path="/admin/feedback" element={<AdminFeedback />} />
                        <Route path="*" element={<Navigate to="/" replace />} />
                      </Routes>
                    </Layout>
                  </ProtectedRoute>
                }
              />
            </Routes>
          </div>
        </div>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}
