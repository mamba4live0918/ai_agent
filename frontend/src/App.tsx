import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import KnowledgeBase from './pages/KnowledgeBase';
import CustomerAnalysis from './pages/CustomerAnalysis';
import Products from './pages/Products';
import Training from './pages/Training';

export default function App() {
  return (
    <BrowserRouter>
      <Layout>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/knowledge" element={<KnowledgeBase />} />
          <Route path="/customers" element={<CustomerAnalysis />} />
          <Route path="/products" element={<Products />} />
          <Route path="/training" element={<Training />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
