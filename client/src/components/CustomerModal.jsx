import { useState, useEffect } from 'react';

const emptyForm = { name: '', contact_number: '', credit_limit: '0' };

function CustomerModal({ isOpen, onClose, onSave, initialData }) {
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    setForm(initialData ? { ...initialData } : emptyForm);
  }, [initialData, isOpen]);

  if (!isOpen) return null;

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl p-6 w-full max-w-md shadow-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-semibold text-on-surface mb-4">
          {initialData ? 'Edit Customer' : 'Add New Customer'}
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
            <label className="text-sm font-medium text-on-surface-variant">Contact Number</label>
            <input
              name="contact_number" value={form.contact_number || ''} onChange={handleChange}
              placeholder="09XXXXXXXXX"
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
            />
          </div>
          <div>
            <label className="text-sm font-medium text-on-surface-variant">Credit Limit (₱)</label>
            <input
              type="number" step="0.01" name="credit_limit" value={form.credit_limit}
              onChange={handleChange}
              className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
            />
            <p className="text-xs text-on-surface-variant mt-1">
              Maximum utang balance allowed for this customer. Set to 0 for no credit privileges.
            </p>
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
              Save Customer
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default CustomerModal;