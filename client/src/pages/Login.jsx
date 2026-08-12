import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { apiFetch } from '../api';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      login(data.token, data.user);
      navigate('/');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <form onSubmit={handleSubmit} className="bg-surface border border-outline-variant rounded-xl p-8 w-full max-w-sm">
        <h1 className="text-primary text-2xl font-bold mb-1">Tindahan Ko</h1>
        <p className="text-on-surface-variant text-sm mb-6">Sign in to your admin terminal.</p>

        <label className="text-sm font-medium text-on-surface-variant">Email</label>
        <input
          type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
          className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1 mb-4"
        />

        <label className="text-sm font-medium text-on-surface-variant">Password</label>
        <input
          type="password" value={password} onChange={(e) => setPassword(e.target.value)} required
          className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1 mb-4"
        />

        {error && <p className="text-error text-sm mb-3">{error}</p>}

        <button
          type="submit" disabled={loading}
          className="w-full bg-primary text-on-primary font-semibold py-3 rounded-lg"
        >
          {loading ? 'Signing in...' : 'Sign In'}
        </button>
      </form>
    </div>
  );
}

export default Login;