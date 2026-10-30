import { useState, useEffect } from 'react';

const emptyForm = { name: '', email: '', password: '', role: 'cashier' };

function UserModal({ isOpen, onClose, onSave, initialData }) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    // When editing, pre-fill name/email/role but leave the password blank
    // (it only changes when a new one is typed). Adding requires a password.
    setForm(initialData
      ? { name: initialData.name || '', email: initialData.email || '', password: '', role: initialData.role || 'cashier' }
      : emptyForm
    );
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const { name, email, role } = form;
    const payload = { name, email, role };
    // Only send a password if the field has one — blank means "keep current".
    if (form.password) payload.password = form.password;
    onSave(payload);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl p-4 sm:p-6 w-full max-w-md shadow-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold text-on-surface mb-4">
          {initialData ? 'Edit User' : 'Add New User'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div>
            <label className="text-sm font-medium text-on-surface-variant">Full Name *</label>
            <input
              name="name" value={form.name} onChange={handleChange} required
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-on-surface-variant">Email *</label>
            <input
              type="email" name="email" value={form.email} onChange={handleChange} required
              placeholder="user@example.com"
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-on-surface-variant">
              {initialData ? 'New Password' : 'Password *'}
            </label>
            <input
              type="password" name="password" value={form.password}
              onChange={handleChange}
              required={!initialData}
              minLength={6}
              autoComplete="new-password"
              placeholder={initialData ? 'Leave blank to keep current password' : 'At least 6 characters'}
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-on-surface-variant">Role</label>
            <select
              name="role" value={form.role} onChange={handleChange}
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
            >
              <option value="cashier">Cashier — POS, customers, utang, drawer</option>
              <option value="owner">Owner — full access incl. reports & inventory</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button" onClick={onClose}
              className="px-4 py-2 rounded-lg border border-outline-variant text-on-surface-variant"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-primary text-on-primary font-medium"
            >
              Save User
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default UserModal;
