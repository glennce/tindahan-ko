import { Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import SalesPOS from './pages/SalesPOS';
import Inventory from './pages/Inventory';
import Utang from './pages/Utang';
import Transactions from './pages/Transactions';
import Reports from './pages/Reports';

function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="pos" element={<SalesPOS />} />
        <Route path="inventory" element={<Inventory />} />
        <Route path="utang" element={<Utang />} />
        <Route path="transactions" element={<Transactions />} />
        <Route path="reports" element={<Reports />} />
      </Route>
    </Routes>
  );
}

export default App;