import { apiFetch } from '../api';
import { useState, useEffect } from 'react';
import CustomerModal from '../components/CustomerModal';

const PRODUCTS_API = '/products';
const CUSTOMERS_API = '/customers';
const SALES_API = '/sales';


function SalesPOS() {
  const [products, setProducts] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [cart, setCart] = useState([]); // [{ product_id, name, unit_price, quantity, stock_quantity }]
  const [paymentMethod, setPaymentMethod] = useState('cash');
  const [customerId, setCustomerId] = useState('');
  const [amountTendered, setAmountTendered] = useState('');
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [mobileCartOpen, setMobileCartOpen] = useState(false);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);

  const loadProducts = () => {
    apiFetch(PRODUCTS_API).then((res) => res.json()).then(setProducts);
  };

  useEffect(() => {
    loadProducts();
    apiFetch(CUSTOMERS_API).then((res) => res.json()).then(setCustomers);
  }, []);

  const addToCart = (product) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product_id === product.id);
      if (existing) {
        // Don't let the cart quantity exceed what's actually in stock
        if (existing.quantity >= product.stock_quantity) return prev;
        return prev.map((item) =>
          item.product_id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [
        ...prev,
        {
          product_id: product.id,
          name: product.name,
          unit_price: Number(product.selling_price),
          quantity: 1,
          stock_quantity: product.stock_quantity,
        },
      ];
    });
  };

  const changeQty = (product_id, delta) => {
    setCart((prev) =>
      prev
        .map((item) => {
          if (item.product_id !== product_id) return item;
          const newQty = item.quantity + delta;
          if (newQty > item.stock_quantity) return item; // block over-adding
          return { ...item, quantity: newQty };
        })
        .filter((item) => item.quantity > 0) // auto-remove if decremented to 0
    );
  };

  const removeFromCart = (product_id) => {
    setCart((prev) => prev.filter((item) => item.product_id !== product_id));
  };

  const total = cart.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  const selectedCustomerInfo = customerId
  ? (() => {
      const c = customers.find((c) => c.id === Number(customerId));
      if (!c) return null;
      return { available: Number(c.credit_limit) - Number(c.balance) };
    })()
  : null;
  const change =
    paymentMethod === 'cash' && amountTendered ? Number(amountTendered) - total : null;

  const resetSale = () => {
    setCart([]);
    setAmountTendered('');
    setPaymentMethod('cash');
    setCustomerId('');
    setError(null);
  };

  const handleCompleteSale = async () => {
    setError(null);

    if (cart.length === 0) {
      setError('Cart is empty.');
      return;
    }
    if (paymentMethod === 'utang' && !customerId) {
      setError('Select a customer for utang sales.');
      return;
    }
    if (paymentMethod === 'cash' && (!amountTendered || Number(amountTendered) < total)) {
      setError('Cash received must be at least the total amount.');
      return;
    }
    if (paymentMethod === 'utang' && selectedCustomerInfo && total > selectedCustomerInfo.available) {
      setError(`Exceeds available credit (₱${selectedCustomerInfo.available.toFixed(2)})`);
      return;
    }

    setSubmitting(true);
    try {
      const res = await apiFetch(SALES_API, {
        method: 'POST',
        body: JSON.stringify({
          customer_id: paymentMethod === 'utang' ? Number(customerId) : null,
          items: cart.map(({ product_id, quantity, unit_price }) => ({
            product_id,
            quantity,
            unit_price,
          })),
          payment_method: paymentMethod,
          amount_tendered: paymentMethod === 'cash' ? Number(amountTendered) : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sale failed');

      resetSale();
      loadProducts(); // refresh stock counts from the server
      alert('Sale completed!');
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveCustomer = async (formData) => {
  try {
    const res = await apiFetch('/customers', {
      method: 'POST',
      body: JSON.stringify(formData),
    });
    const newCustomer = await res.json();
    if (!res.ok) throw new Error(newCustomer.error || 'Failed to add customer');

    setCustomers((prev) => [...prev, newCustomer]); // add to the dropdown list
    setCustomerId(String(newCustomer.id));           // auto-select them immediately
    setCustomerModalOpen(false);
  } catch (err) {
    alert(err.message);
  }
};

  return (
    <>
    <div className="lg:flex lg:gap-6 h-full">
      {/* Product grid */}
      <div className="flex-1">
        <h1 className="text-2xl font-bold text-on-surface mb-4">Sales / POS</h1>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
          {products.map((product) => {
            const outOfStock = product.stock_quantity <= 0;
            return (
              <div
                key={product.id}
                className="bg-surface border border-outline-variant rounded-xl p-3"
              >
                <p className="font-medium text-on-surface text-sm lg:text-base">{product.name}</p>
                <p className="text-primary font-semibold">₱{product.selling_price}</p>
                <p className="text-on-surface-variant text-sm mb-2">
                  {product.stock_quantity} in stock
                </p>
                <button
                  disabled={outOfStock}
                  onClick={() => addToCart(product)}
                  className={`w-full py-2 rounded-lg font-medium text-sm ${
                    outOfStock
                      ? 'bg-surface-container text-on-surface-variant cursor-not-allowed'
                      : 'bg-primary text-on-primary'
                  }`}
                >
                  {outOfStock ? 'Sold Out' : '+ Add'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Cart panel: always visible on desktop (lg+), an overlay on mobile */}
      <div
        className={`
          bg-surface border border-outline-variant p-4 flex flex-col
          lg:static lg:w-80 lg:rounded-xl lg:flex
          fixed inset-x-0 bottom-0 top-16 z-50 rounded-t-2xl
          ${mobileCartOpen ? 'flex' : 'hidden'}
        `}
      >
        <div className="flex justify-between items-center mb-3 lg:hidden">
          <h2 className="font-semibold text-on-surface">Current Sale</h2>
          <button onClick={() => setMobileCartOpen(false)} className="text-on-surface-variant text-xl">
            ✕
          </button>
        </div>
        <h2 className="hidden lg:block font-semibold text-on-surface mb-3">Current Sale</h2>

        <div className="flex-1 overflow-y-auto space-y-3">
          {cart.length === 0 && (
            <p className="text-on-surface-variant text-sm">No items yet.</p>
          )}
          {cart.map((item) => (
            <div key={item.product_id} className="border-b border-outline-variant pb-2">
              <div className="flex justify-between">
                <span className="text-on-surface text-sm font-medium">{item.name}</span>
                <button
                  onClick={() => removeFromCart(item.product_id)}
                  className="text-error text-xs"
                >
                  ✕
                </button>
              </div>
              <div className="flex justify-between items-center mt-1">
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => changeQty(item.product_id, -1)}
                    className="w-6 h-6 rounded-full bg-surface-container-high"
                  >
                    −
                  </button>
                  <span className="text-sm">{item.quantity}</span>
                  <button
                    onClick={() => changeQty(item.product_id, 1)}
                    className="w-6 h-6 rounded-full bg-surface-container-high"
                  >
                    +
                  </button>
                </div>
                <span className="text-on-surface font-medium text-sm">
                  ₱{(item.quantity * item.unit_price).toFixed(2)}
                </span>
              </div>
            </div>
          ))}
        </div>

        <div className="border-t border-outline-variant mt-3 pt-3">
          <div className="flex justify-between font-bold text-on-surface text-lg mb-3">
            <span>Total</span>
            <span>₱{total.toFixed(2)}</span>
          </div>

          <div className="flex gap-2 mb-3">
            {['cash', 'gcash', 'utang'].map((method) => (
              <button
                key={method}
                onClick={() => setPaymentMethod(method)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium capitalize ${
                  paymentMethod === method
                    ? 'bg-primary text-on-primary'
                    : 'bg-surface-container-low text-on-surface-variant'
                }`}
              >
                {method}
              </button>
            ))}
          </div>

          {paymentMethod === 'utang' && (
            <>
              <div className="flex gap-2 mb-2">
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  className="flex-1 border border-outline-variant rounded-lg px-3 py-2"
                >
                  <option value="">Select customer...</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setCustomerModalOpen(true)}
                  className="px-3 py-2 rounded-lg border border-outline-variant text-primary text-sm font-medium whitespace-nowrap"
                >
                  + New
                </button>
              </div>
              {selectedCustomerInfo && (
                <p className={`text-sm mb-3 ${
                  total > selectedCustomerInfo.available ? 'text-error' : 'text-on-surface-variant'
                }`}>
                  Available credit: ₱{selectedCustomerInfo.available.toFixed(2)}
                </p>
              )}
            </>
          )}

          {paymentMethod === 'cash' && (
            <div className="mb-3">
              <label className="text-sm text-on-surface-variant">Cash Received</label>
              <input
                type="number"
                value={amountTendered}
                onChange={(e) => setAmountTendered(e.target.value)}
                className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
              />
              {change !== null && (
                <p className="text-sm text-on-surface-variant mt-1">
                  Change: ₱{change.toFixed(2)}
                </p>
              )}
            </div>
          )}

          {error && <p className="text-error text-sm mb-2">{error}</p>}

          <button
            onClick={async () => {
              await handleCompleteSale();
              setMobileCartOpen(false);
            }}
            disabled={submitting}
            className="w-full bg-primary text-on-primary font-semibold py-3 rounded-lg"
          >
            {submitting ? 'Processing...' : 'Complete Sale'}
          </button>
        </div>
      </div>

      {/* Mobile-only "View Cart" bar, sits above the bottom tab nav */}
      {cart.length > 0 && !mobileCartOpen && (
        <button
          onClick={() => setMobileCartOpen(true)}
          className="lg:hidden fixed bottom-16 inset-x-4 bg-primary text-on-primary font-semibold py-3 rounded-xl flex justify-between px-4 z-40"
        >
          <span>{cart.reduce((n, i) => n + i.quantity, 0)} items — View Cart</span>
          <span>₱{total.toFixed(2)}</span>
        </button>
      )}
    </div>
    <CustomerModal
      isOpen={customerModalOpen}
      onClose={() => setCustomerModalOpen(false)}
      onSave={handleSaveCustomer}
      initialData={null}
    />
    </>
  );
}

export default SalesPOS;