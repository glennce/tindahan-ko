import { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import CustomerModal from '../components/CustomerModal';
import { useToast } from '../context/ToastContext';
import ConfirmModal from '../components/ConfirmModal';

const API = '/customers';

function Customers() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState(null);
  const { showToast } = useToast();
  const [pendingDeleteId, setPendingDeleteId] = useState(null);

  const fetchCustomers = () => {
    setLoading(true);
    apiFetch(API)
      .then((res) => res.json())
      .then((data) => {
        setCustomers(data);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchCustomers();
  }, []);

  const openAddModal = () => {
    setEditingCustomer(null);
    setModalOpen(true);
  };

  const openEditModal = (customer) => {
    setEditingCustomer(customer);
    setModalOpen(true);
  };

  const handleSave = async (formData) => {
    const isEditing = Boolean(editingCustomer);
    const url = isEditing ? `${API}/${editingCustomer.id}` : API;
    const method = isEditing ? 'PUT' : 'POST';

    try {
      const res = await apiFetch(url, { method, body: JSON.stringify(formData) });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Save failed');
      setModalOpen(false);
      fetchCustomers();
      showToast(isEditing ? 'Customer updated' : 'Customer added');
    } catch (err) {
      showToast(err.message, 'error');
    }
  };

  const requestDelete = (id) => {
    setPendingDeleteId(id);
  };

  const confirmDelete = async () => {
    const id = pendingDeleteId;
    setPendingDeleteId(null);
    try {
      const res = await apiFetch(`${API}/${id}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Delete failed');
      fetchCustomers();
      showToast('Customer deleted');
    } catch (err) {
      showToast(err.message, 'error'); // catches the "has existing sales/utang" message too
    }
  };

  if (loading) return <p className="text-on-surface-variant">Loading customers...</p>;
  if (error) return <p className="text-error">Error: {error}</p>;

  return (
    <div>
      <div className="flex flex-col lg:flex-row justify-between lg:items-center gap-3 mb-6">
        <div>
          <h1 className="text-2xl lg:text-3xl font-bold text-on-surface">Customers</h1>
          <p className="text-on-surface-variant">Manage your regulars and their credit limits.</p>
        </div>
        <button
          onClick={openAddModal}
          className="bg-primary text-on-primary font-medium px-4 py-2 rounded-lg"
        >
          + Add Customer
        </button>
      </div>

      {/* Mobile cards */}
      <div className="lg:hidden space-y-3">
        {customers.map((c) => (
          <div key={c.id} className="bg-surface border border-outline-variant rounded-xl p-4">
            <div className="flex justify-between items-start">
              <div>
                <p className="font-medium text-on-surface">{c.name}</p>
                <p className="text-on-surface-variant text-sm">{c.contact_number || 'No contact'}</p>
              </div>
              <span className={Number(c.balance) > 0 ? 'text-error font-medium text-sm' : 'text-on-surface-variant text-sm'}>
                ₱{Number(c.balance).toFixed(2)} owed
              </span>
            </div>
              <p className="text-on-surface-variant text-xs mt-1">
                Available: ₱{(Number(c.credit_limit) - Number(c.balance)).toFixed(2)}
              </p>
            <div className="flex justify-between items-center mt-3">
              <span className="text-on-surface-variant text-sm">Limit: ₱{Number(c.credit_limit).toFixed(2)}</span>
              <div className="space-x-3">
                <button onClick={() => openEditModal(c)} className="text-primary text-sm font-medium">Edit</button>
                <button onClick={() => requestDelete(c.id)} className="text-error text-sm font-medium">Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Desktop table */}
      <div className="hidden lg:block bg-surface border border-outline-variant rounded-xl overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-surface-container-low text-on-surface-variant text-sm">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Contact</th>
              <th className="px-4 py-3">Credit Limit</th>
              <th className="px-4 py-3">Current Balance</th>
              <th className="px-4 py-3">Available Credit</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {customers.map((c) => (
              <tr key={c.id} className="border-t border-outline-variant">
                <td className="px-4 py-3 font-medium text-on-surface">{c.name}</td>
                <td className="px-4 py-3 text-on-surface-variant">{c.contact_number || '—'}</td>
                <td className="px-4 py-3 text-on-surface-variant">₱{Number(c.credit_limit).toFixed(2)}</td>
                <td className="px-4 py-3">
                  <span className={Number(c.balance) > 0 ? 'text-error font-medium' : 'text-on-surface-variant'}>
                    ₱{Number(c.balance).toFixed(2)}
                  </span>
                </td>
                <td className="px-4 py-3 text-on-surface-variant">
                  ₱{(Number(c.credit_limit) - Number(c.balance)).toFixed(2)}
                </td>
                <td className="px-4 py-3 space-x-3">
                  <button onClick={() => openEditModal(c)} className="text-primary text-sm font-medium">Edit</button>
                  <button onClick={() => requestDelete(c.id)} className="text-error text-sm font-medium">Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <CustomerModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        initialData={editingCustomer}
      />

      <ConfirmModal
        isOpen={!!pendingDeleteId}
        title="Delete this customer?"
        message="This cannot be undone."
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDeleteId(null)}
      />
    </div>
  );
}

export default Customers;