import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function More() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div>
      <h1 className="text-2xl font-bold text-on-surface mb-1">More</h1>
      <p className="text-on-surface-variant mb-6">{user?.name}</p>

      <div className="bg-surface border border-outline-variant rounded-xl divide-y divide-outline-variant overflow-hidden">
        <Link to="/customers" className="block px-4 py-3 text-on-surface font-medium">
          Customers
        </Link>
        {user?.role === 'owner' && (
          <>
            <Link to="/transactions" className="block px-4 py-3 text-on-surface font-medium">
              Transactions
            </Link>
            <Link to="/shift" className="block px-4 py-3 text-on-surface font-medium">
              Cash Drawer
            </Link>
            <Link to="/reports" className="block px-4 py-3 text-on-surface font-medium">
              Reports
            </Link>
          </>
        )}
        <button onClick={handleLogout} className="w-full text-left px-4 py-3 text-error font-medium">
          Logout
        </button>
      </div>
    </div>
  );
}

export default More;