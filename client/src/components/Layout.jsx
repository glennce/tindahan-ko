import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { LayoutGrid, ShoppingCart, Package, CreditCard, Menu } from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/pos', label: 'Sales/POS' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/customers', label: 'Customers' },
  { to: '/utang', label: 'Utang' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/reports', label: 'Reports' },
];

const mobileNavItems = [
  { to: '/', label: 'Home', icon: LayoutGrid, end: true },
  { to: '/pos', label: 'POS', icon: ShoppingCart },
  { to: '/inventory', label: 'Inventory', icon: Package },
  { to: '/utang', label: 'Utang', icon: CreditCard },
  { to: '/more', label: 'More', icon: Menu },
];

function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Desktop sidebar — completely hidden below the lg breakpoint */}
      <aside className="hidden lg:flex w-60 bg-surface border-r border-outline-variant flex-col p-4">
        <div className="mb-8">
          <h1 className="text-primary text-xl font-bold">Tindahan Ko</h1>
          <p className="text-on-surface-variant text-sm">Admin Terminal</p>
        </div>
        <nav className="flex flex-col gap-1 flex-1">
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-primary-container text-on-primary'
                    : 'text-on-surface-variant hover:bg-surface-container'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-outline-variant pt-3">
          <p className="text-on-surface text-sm font-medium px-3">{user?.name}</p>
          <button
            onClick={handleLogout}
            className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-error hover:bg-error-container"
          >
            Logout
          </button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col">
        {/* Mobile top bar — shown only below lg */}
        <header className="lg:hidden flex items-center bg-surface border-b border-outline-variant px-4 py-3">
          <h1 className="text-primary text-lg font-bold">Tindahan Ko</h1>
        </header>

        {/* pb-20 on mobile reserves space so content doesn't hide behind the fixed bottom nav */}
        <main className="flex-1 p-4 lg:p-8 pb-24 lg:pb-8">
          <Outlet />
        </main>
      </div>

      {/* Mobile bottom tab bar — shown only below lg */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 bg-surface border-t border-outline-variant flex justify-around py-2 z-40">
        {mobileNavItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-0.5 px-2 py-1 text-xs font-medium ${
                isActive ? 'text-primary' : 'text-on-surface-variant'
              }`
            }
          >
            <item.icon size={20} />
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

export default Layout;