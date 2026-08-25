import { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { Receipt, Download } from 'lucide-react';

function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}
function pctChange(current, previous) {
  if (previous === 0) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}
function downloadCsv(filename, rows) {
  const csv = rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
function StatCard({ label, value, change, icon: Icon }) {
  return (
    <div className="bg-surface border border-outline-variant rounded-xl p-4">
      <div className="flex justify-between items-start">
        <p className="text-on-surface-variant text-sm">{label}</p>
        {Icon && <div className="bg-primary-container/20 text-primary p-1.5 rounded-md"><Icon size={16} /></div>}
      </div>
      <p className="text-2xl font-bold text-on-surface mt-2">{value}</p>
      {change !== undefined && (
        <p className={`text-xs mt-1 ${change >= 0 ? 'text-secondary' : 'text-error'}`}>
          {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}% vs previous period
        </p>
      )}
    </div>
  );
}
const expenseIcon = {
  'Store Supplies': '🛍️', 'Utilities': '⚡', 'Rent': '🏠', 'Transportation': '🚗', 'Other': '📦',
};

export default function Expenses() {
  const [start, setStart] = useState(firstOfMonth());
  const [end, setEnd] = useState(today());
  const [data, setData] = useState(null);
  const [form, setForm] = useState({ category: 'Store Supplies', amount: '', description: '', payment_method: 'cash' });

  const load = () => {
    setData(null);
    apiFetch(`/reports/expenses?start=${start}&end=${end}`).then((res) => res.json()).then(setData);
  };
  useEffect(() => { load(); }, [start, end]);

  const onAdd = async (e) => {
    e.preventDefault();
    if (!form.amount) return;
    await apiFetch('/expenses', { method: 'POST', body: JSON.stringify(form) });
    setForm({ category: 'Store Supplies', amount: '', description: '', payment_method: 'cash' });
    load();
  };

  const handleExport = () => {
    if (!data) return;
    const rows = [['Date', 'Category', 'Amount', 'Payment Method', 'Description'], ...data.recent.map((ex) => [new Date(ex.created_at).toLocaleString(), ex.category, ex.amount, ex.payment_method || 'cash', ex.description || ''])];
    downloadCsv(`expenses-report-${start}-to-${end}.csv`, rows);
  };

  return (
    <div>
      <div className="flex flex-col lg:flex-row lg:justify-between lg:items-start gap-3 mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Expenses</h1>
          <p className="text-on-surface-variant">{start} to {end} — Cash & GCash tracked separately</p>
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="border border-outline-variant rounded-lg px-2 py-1 text-sm" />
          <span className="text-on-surface-variant">to</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="border border-outline-variant rounded-lg px-2 py-1 text-sm" />
          <button onClick={handleExport} className="border border-outline-variant text-primary text-sm font-medium px-3 py-1.5 rounded-lg flex items-center gap-1">
            <Download size={16} /> Export CSV
          </button>
        </div>
      </div>

      {!data ? (
        <p className="text-on-surface-variant text-sm">Loading...</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <StatCard label="Total Expenses" value={`₱${data.total_expenses.toFixed(2)}`} change={pctChange(data.total_expenses, data.prev_total_expenses)} icon={Receipt} />
            <StatCard label="Cash Expenses" value={`₱${Number(data.cash_total ?? 0).toFixed(2)}`} change={data.prev_cash_total !== undefined ? pctChange(data.cash_total, data.prev_cash_total) : undefined} icon={Receipt} />
            <StatCard label="GCash Expenses" value={`₱${Number(data.gcash_total ?? 0).toFixed(2)}`} change={data.prev_gcash_total !== undefined ? pctChange(data.gcash_total, data.prev_gcash_total) : undefined} icon={Receipt} />
          </div>

          <div className="bg-surface border border-outline-variant rounded-xl p-4">
            <h2 className="font-semibold text-on-surface mb-3">By Category</h2>
            {data.by_category.length === 0 ? <p className="text-on-surface-variant text-sm">No expenses in this period.</p> : data.by_category.map((c) => (
              <div key={c.category} className="flex justify-between text-sm py-2 border-t border-outline-variant">
                <span className="text-on-surface">{c.category}</span>
                <span className="text-error font-medium">₱{Number(c.total).toFixed(2)}</span>
              </div>
            ))}
            {data.by_payment && data.by_payment.length > 0 && (
              <div className="pt-3 mt-3 border-t border-outline-variant">
                <h3 className="font-medium text-on-surface text-sm mb-2">By Payment Method</h3>
                {data.by_payment.map((p) => (
                  <div key={p.payment_method} className="flex justify-between text-sm py-1">
                    <span className="capitalize text-on-surface-variant">{p.payment_method}</span>
                    <span className="text-error font-medium">₱{Number(p.total).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-surface border border-outline-variant rounded-xl p-4">
            <h2 className="font-semibold text-on-surface mb-3">Record Expense</h2>
            <form onSubmit={onAdd} className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              <select value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} className="w-full border border-outline-variant rounded-lg px-3 py-2">
                <option>Store Supplies</option><option>Utilities</option><option>Rent</option><option>Transportation</option><option>Other</option>
              </select>
              <input type="number" step="0.01" placeholder="Amount (₱)" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} className="w-full border border-outline-variant rounded-lg px-3 py-2" />
              <div className="flex gap-2">
                {['cash','gcash'].map((m)=>(
                  <button key={m} type="button" onClick={()=>setForm((f)=>({...f, payment_method:m}))} className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize border ${form.payment_method===m ? 'bg-primary text-on-primary border-primary' : 'bg-surface-container-low text-on-surface-variant border-outline-variant'}`}>{m}</button>
                ))}
              </div>
              <input type="text" placeholder="Description (optional)" value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} className="w-full border border-outline-variant rounded-lg px-3 py-2" />
              <button type="submit" className="lg:col-span-2 w-full bg-primary text-on-primary py-2 rounded-lg font-medium">Add Expense — Deduct from {form.payment_method === 'gcash' ? 'GCash' : 'Cash'}</button>
            </form>
          </div>

          <div className="bg-surface border border-outline-variant rounded-xl overflow-hidden">
            <div className="p-4 border-b border-outline-variant flex justify-between items-center">
              <h2 className="font-semibold text-on-surface">Detailed Expense Report — All Columns</h2>
              <span className="text-xs text-on-surface-variant">{data.recent.length} records (period)</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm min-w-[700px]">
                <thead className="bg-surface-container-low text-on-surface-variant">
                  <tr>
                    <th className="px-4 py-3">Date & Time</th>
                    <th className="px-4 py-3">Category</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Payment Method</th>
                    <th className="px-4 py-3">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {data.recent.map((ex)=>(
                    <tr key={ex.id} className="border-t border-outline-variant">
                      <td className="px-4 py-3 text-on-surface-variant whitespace-nowrap">{new Date(ex.created_at).toLocaleString()}</td>
                      <td className="px-4 py-3 text-on-surface"><span className="flex items-center gap-1"><span>{expenseIcon[ex.category]||'📦'}</span>{ex.category}</span></td>
                      <td className="px-4 py-3 text-error font-medium">₱{Number(ex.amount).toFixed(2)}</td>
                      <td className="px-4 py-3"><span className={`px-2 py-1 rounded-full text-xs font-medium capitalize ${ex.payment_method==='gcash' ? 'bg-secondary-container text-secondary' : 'bg-primary-container text-on-primary'}`}>{ex.payment_method || 'cash'}</span></td>
                      <td className="px-4 py-3 text-on-surface-variant">{ex.description || '—'}</td>
                    </tr>
                  ))}
                  {data.recent.length===0 && <tr><td colSpan={5} className="px-4 py-6 text-center text-on-surface-variant">No expenses in this period.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
