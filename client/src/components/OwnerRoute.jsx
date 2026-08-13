import { Navigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

function OwnerRoute({ children }) {
  const { user } = useAuth();
  if (user?.role !== 'owner') return <Navigate to="/pos" replace />;
  return children;
}

export default OwnerRoute;