import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import SalesPOS from './pages/SalesPOS';
import Inventory from './pages/Inventory';
import Utang from './pages/Utang';
import Transactions from './pages/Transactions';
import Reports from './pages/Reports';
import More from './pages/More';
import Customers from './pages/Customers';
import OwnerRoute from './components/OwnerRoute';
import Shift from './pages/Shift';

function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<OwnerRoute><Dashboard /></OwnerRoute>} />
        <Route path="pos" element={<SalesPOS />} />
        <Route path="inventory" element={<OwnerRoute><Inventory /></OwnerRoute>} />
        <Route path="customers" element={<Customers />} />
        <Route path="utang" element={<Utang />} />
        <Route path="transactions" element={<OwnerRoute><Transactions /></OwnerRoute>} />
        <Route path="reports" element={<OwnerRoute><Reports /></OwnerRoute>} />
        <Route path="more" element={<More />} />
        <Route path="customers" element={<Customers />} />
        <Route path="shift" element={<Shift />} />
      </Route>
    </Routes>
  );
}

export default App;