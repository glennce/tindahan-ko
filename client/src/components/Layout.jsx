import { NavLink, Outlet } from 'react-router-dom';

const navItems = [
  { to: '/', label: 'Dashboard', end: true },
  { to: '/pos', label: 'Sales/POS' },
  { to: '/inventory', label: 'Inventory' },
  { to: '/utang', label: 'Utang' },
  { to: '/transactions', label: 'Transactions' },
  { to: '/reports', label: 'Reports' },
];

function Layout() {
  return (
    <div className="flex min-h-screen bg-background">
      <aside className="w-60 bg-surface border-r border-outline-variant flex flex-col p-4">
        <div className="mb-8">
          <h1 className="text-primary text-xl font-bold">Tindahan Ko</h1>
          <p className="text-on-surface-variant text-sm">Admin Terminal</p>
        </div>
        <nav className="flex flex-col gap-1">
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
      </aside>
      <main className="flex-1 p-8">
        <Outlet />
      </main>
    </div>
  );
}

export default Layout;