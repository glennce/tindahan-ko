import { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import UserModal from '../components/UserModal';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/ConfirmModal';
import { useAuth } from '../context/AuthContext';
import { Shield, User as UserIcon } from 'lucide-react';

const API = '/users';

function Users() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [pendingDeleteId, setPendingDeleteId] = useState(null);
  const { showToast } = useToast();
  const { user: me } = useAuth();

  const fetchUsers = () => {
    setLoading(true);
    apiFetch(API)
      .then((res) => res.json())
      .then((data) => {
        setUsers(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const openAddModal = () => {
    setEditingUser(null);
    setModalOpen(true);
  };

  const openEditModal = (u) => {
    setEditingUser(u);
    setModalOpen(true);
  };

  const handleSave = async (formData) => {
    const isEditing = Boolean(editingUser);
    const url = isEditing ? `${API}/${editingUser.id}` : API;
    const method = isEditing ? 'PUT' : 'POST';

    try {
      const res = await apiFetch(url, { method, body: JSON.stringify(formData) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setModalOpen(false);
      fetchUsers();
      showToast(isEditing ? 'User updated' : 'User created');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const confirmDelete = async () => {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    try {
      const res = await apiFetch(`${API}/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      fetchUsers();
      showToast('User deleted');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  if (loading) return <p className="text-on-surface-variant">Loading users...</p>;
  if (error) return <p className="text-error">Error: {error}</p>;

  const RoleBadge = ({ role }) => (
    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium capitalize ${
      role === 'owner' ? 'bg-primary-container text-on-primary' : 'bg-secondary-container text-secondary'
    }`}>
      {role === 'owner' ? <Shield size={12} /> : <UserIcon size={12} />}
      {role}
    </span>
  );

  return (
    <div>
      <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-on-surface">Users</h1>
          <p className="text-on-surface-variant">Create accounts and manage who has access to what.</p>
        </div>
        <button
          onClick={openAddModal}
          className="bg-primary text-on-primary font-medium px-4 py-2 rounded-lg"
        >
          + Add User
        </button>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-3">
        {users.map((u) => (
          <div key={u.id} className="bg-surface border border-outline-variant rounded-xl p-4">
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0">
                <p className="font-medium text-on-surface">
                  {u.name}{me?.id === u.id && <span className="text-on-surface-variant text-xs"> (You)</span>}
                </p>
                <p className="text-on-surface-variant text-sm truncate">{u.email}</p>
              </div>
              <RoleBadge role={u.role} />
            </div>
            <div className="flex justify-end items-center gap-1 mt-3">
              <button onClick={() => openEditModal(u)} className="text-primary text-sm font-medium px-2 py-1.5 rounded hover:bg-surface-container-low">Edit</button>
              {me?.id !== u.id && (
                <button onClick={() => setPendingDeleteId(u.id)} className="text-error text-sm font-medium px-2 py-1.5 rounded hover:bg-error-container">Delete</button>
              )}
            </div>
          </div>
        ))}
        {users.length === 0 && <p className="text-on-surface-variant text-center py-6">No users found.</p>}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block bg-surface border border-outline-variant rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-surface-container-low text-on-surface-variant text-sm">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Joined</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-outline-variant">
                <td className="px-4 py-3 font-medium text-on-surface">
                  {u.name}{me?.id === u.id && <span className="text-on-surface-variant text-xs font-normal"> (You)</span>}
                </td>
                <td className="px-4 py-3 text-on-surface-variant">{u.email}</td>
                <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                <td className="px-4 py-3 text-on-surface-variant">
                  {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                </td>
                <td className="px-4 py-3 space-x-1">
                  <button onClick={() => openEditModal(u)} className="text-primary text-sm font-medium px-2 py-1.5 rounded hover:bg-surface-container-low">Edit</button>
                  {me?.id !== u.id && (
                    <button onClick={() => setPendingDeleteId(u.id)} className="text-error text-sm font-medium px-2 py-1.5 rounded hover:bg-error-container">Delete</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <UserModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        initialData={editingUser}
      />

      <ConfirmModal
        isOpen={!!pendingDeleteId}
        title="Delete this user?"
        message="They will no longer be able to log in. This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}

export default Users;
