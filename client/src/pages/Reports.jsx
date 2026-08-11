import { apiFetch } from '../api';
import { useState, useEffect } from 'react';

const REPORTS_API = '/reports';
const EXPENSES_API = '/expenses';

function firstOfMonth() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
function today() {
  return new Date().toISOString().slice(0, 10);
}

function Reports() {
  const [start, setStart] = useState(firstOfMonth());
  const [end, setEnd] = useState(today());
  const [report, setReport] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [expenseForm, setExpenseForm] = useState({ category: 'Store Supplies', amount: '', description: '' });

  const loadReport = () => {
    apiFetch(`${REPORTS_API}?start=${start}&end=${end}`)
      .then((res) => res.json())
      .then(setReport);
  };
  const loadExpenses = () => {
    apiFetch(EXPENSES_API).then((res) => res.json()).then(setExpenses);
  };

  useEffect(() => {
    loadReport();
    loadExpenses();
  }, [start, end]);

  const addExpense = async (e) => {
    e.preventDefault();
    if (!expenseForm.amount) return;
    await apiFetch(EXPENSES_API, {
      method: 'POST',
      body: JSON.stringify(expenseForm),
    });
    setExpenseForm({ category: 'Store Supplies', amount: '', description: '' });
    loadExpenses();
    loadReport(); // expenses affect the report totals too
  };

  const maxTrend = report ? Math.max(...report.trend.map((t) => Number(t.total)), 1) : 1;

  return (
    <div>
      <div className="flex justify-between items-start mb-6">
        <div>
          <h1 className="text-2xl font-bold text-on-surface">Business Performance</h1>
          <p className="text-on-surface-variant">{start} to {end}</p>
        </div>
        <div className="flex gap-2 items-center">
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)}
            className="border border-outline-variant rounded-lg px-2 py-1 text-sm" />
          <span className="text-on-surface-variant">to</span>
          <input type="date" value={end} onChange={(e) => setEnd(e.target.value)}
            className="border border-outline-variant rounded-lg px-2 py-1 text-sm" />
        </div>
      </div>

      {report && (
        <>
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="bg-surface border border-outline-variant rounded-xl p-4">
              <p className="text-on-surface-variant text-sm">Total Sales</p>
              <p className="text-2xl font-bold text-on-surface">₱{report.total_sales.toFixed(2)}</p>
            </div>
            <div className="bg-surface border border-outline-variant rounded-xl p-4">
              <p className="text-on-surface-variant text-sm">Gross Profit</p>
              <p className="text-2xl font-bold text-on-surface">₱{report.gross_profit.toFixed(2)}</p>
            </div>
            <div className="bg-surface border border-outline-variant rounded-xl p-4">
              <p className="text-on-surface-variant text-sm">Total Expenses</p>
              <p className="text-2xl font-bold text-error">₱{report.total_expenses.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            {/* Sales trend bar chart, hand-built with divs */}
            <div className="col-span-2 bg-surface border border-outline-variant rounded-xl p-4">
              <h2 className="font-semibold text-on-surface mb-4">Sales Trend</h2>
              <div className="flex items-end gap-2 h-40">
                {report.trend.map((t) => (
                  <div key={t.day} className="flex-1 flex flex-col items-center gap-1">
                    <div
                      className="w-full bg-primary rounded-t"
                      style={{ height: `${(Number(t.total) / maxTrend) * 100}%` }}
                    />
                    <span className="text-on-surface-variant text-xs">
                      {new Date(t.day).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                    </span>
                  </div>
                ))}
                {report.trend.length === 0 && (
                  <p className="text-on-surface-variant text-sm">No sales in this range.</p>
                )}
              </div>
            </div>

            <div className="bg-surface border border-outline-variant rounded-xl p-4">
              <h2 className="font-semibold text-on-surface mb-3">Top Categories</h2>
              {report.categories.map((c) => (
                <div key={c.category} className="flex justify-between text-sm py-2 border-t border-outline-variant">
                  <span className="text-on-surface">{c.category}</span>
                  <span className="text-on-surface-variant">₱{Number(c.revenue).toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div className="bg-surface border border-outline-variant rounded-xl p-4">
        <h2 className="font-semibold text-on-surface mb-3">Expense Log</h2>
        <div className="grid grid-cols-2 gap-4">
          <form onSubmit={addExpense} className="space-y-2">
            <select
              value={expenseForm.category}
              onChange={(e) => setExpenseForm((f) => ({ ...f, category: e.target.value }))}
              className="w-full border border-outline-variant rounded-lg px-3 py-2"
            >
              <option>Store Supplies</option>
              <option>Utilities</option>
              <option>Rent</option>
              <option>Transportation</option>
              <option>Other</option>
            </select>
            <input
              type="number" step="0.01" placeholder="Amount (₱)" value={expenseForm.amount}
              onChange={(e) => setExpenseForm((f) => ({ ...f, amount: e.target.value }))}
              className="w-full border border-outline-variant rounded-lg px-3 py-2"
            />
            <input
              type="text" placeholder="Description (optional)" value={expenseForm.description}
              onChange={(e) => setExpenseForm((f) => ({ ...f, description: e.target.value }))}
              className="w-full border border-outline-variant rounded-lg px-3 py-2"
            />
            <button type="submit" className="w-full bg-primary text-on-primary py-2 rounded-lg font-medium">
              Add Expense
            </button>
          </form>

          <div className="space-y-2 max-h-60 overflow-y-auto">
            {expenses.map((e) => (
              <div key={e.id} className="flex justify-between text-sm border-b border-outline-variant pb-2">
                <div>
                  <p className="text-on-surface">{e.category}</p>
                  <p className="text-on-surface-variant text-xs">{e.description}</p>
                </div>
                <span className="text-error font-medium">-₱{Number(e.amount).toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default Reports;