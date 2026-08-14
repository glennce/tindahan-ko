import { apiFetch } from '../api';
import { useState, useEffect } from 'react';
import CustomerModal from '../components/CustomerModal';
import { useToast } from '../context/ToastContext';
import SaleSuccessModal from '../components/SaleSuccessModal';
import { formatStock } from '../utils';

const PRODUCTS_API = '/products';
const CUSTOMERS_API = '/customers';
const SALES_API = '/sales';
const UTANG_MARKUP_PER_UNIT = 2; // Keep in sync with the same constant in server/index.js

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
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [discount, setDiscount] = useState('');
  const { showToast } = useToast();
  const [completedSale, setCompletedSale] = useState(null);
  const [page, setPage] = useState(1);
  const PER_PAGE = 12;

  const loadProducts = () => {
    apiFetch(PRODUCTS_API).then((res) => res.json()).then(setProducts);
  };

  const categories = ['All', ...new Set(products.map((p) => p.category).filter(Boolean))];
  const QUICK_COUNT = 6;
  const quickCategories = categories.slice(0, QUICK_COUNT);
  const moreCategories = categories.slice(QUICK_COUNT);
  const activeInMore = moreCategories.includes(activeCategory);

  const filteredProducts = products.filter((p) => {
    const matchesSearch = p.name.toLowerCase().includes(search.toLowerCase());
    const matchesCategory = activeCategory === 'All' || p.category === activeCategory;
    return matchesSearch && matchesCategory;
  });

  
    const totalPages = Math.max(Math.ceil(filteredProducts.length / PER_PAGE), 1);
    const paginatedProducts = filteredProducts.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  useEffect(() => {
    loadProducts();
    apiFetch(CUSTOMERS_API).then((res) => res.json()).then(setCustomers);
  }, []);

  useEffect(() => {
    setPage(1);
  }, [search, activeCategory]);

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

  const subtotal = cart.reduce((sum, item) => {
    const markupApplies = paymentMethod === 'utang' || paymentMethod === 'split';
    const price = markupApplies ? item.unit_price + UTANG_MARKUP_PER_UNIT : item.unit_price;
    return sum + item.quantity * price;
  }, 0);
  const discountAmount = Number(discount) || 0;
  const total = Math.max(subtotal - discountAmount, 0);
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
    setDiscount('');
    setError(null);
  };

  const handleCompleteSale = async () => {
    if (cart.length === 0) {
      showToast('Cart is empty.', 'error');
      return;
    }
    if (paymentMethod === 'utang' && !customerId) {
      showToast('Select a customer for utang sales.', 'error');
      return;
    }
    if (paymentMethod === 'cash' && (!amountTendered || Number(amountTendered) < total)) {
      showToast('Cash received must be at least the total amount.', 'error');
      return;
    }
    if (paymentMethod === 'utang' && selectedCustomerInfo && total > selectedCustomerInfo.available) {
      showToast(`Exceeds available credit (₱${selectedCustomerInfo.available.toFixed(2)})`, 'error');
      return;
    }
    if (paymentMethod === 'split') {
      if (!customerId) {
        showToast('Select a customer for split payment.', 'error');
        return;
      }
      if (!amountTendered || Number(amountTendered) <= 0 || Number(amountTendered) >= total) {
        showToast('Cash amount must be greater than ₱0 and less than the total.', 'error');
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await apiFetch(SALES_API, {
        method: 'POST',
        body: JSON.stringify({
          customer_id: (paymentMethod === 'utang' || paymentMethod === 'split') ? Number(customerId) : null,
          items: cart.map(({ product_id, quantity, unit_price }) => ({
            product_id,
            quantity,
            unit_price,
          })),
          payment_method: paymentMethod,
          amount_tendered: (paymentMethod === 'cash' || paymentMethod === 'split') ? Number(amountTendered) : null,
          discount_amount: discountAmount,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sale failed');

      resetSale();
      loadProducts();
      setCompletedSale(data);
    } catch (err) {
      showToast(err.message, 'error');
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
      showToast(err.message, 'error');
    }
  };

  return (
    <>
    <div className="lg:flex lg:gap-6 h-full">
      {/* Product grid */}
      <div className="flex-1 pb-24 lg:pb-0">
        <h1 className="text-2xl font-bold text-on-surface mb-4">Sales / POS</h1>
        <input
          type="text"
          placeholder="Search product or scan barcode..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full border border-outline-variant rounded-lg px-4 py-2 mb-3"
        />
        <div className="flex gap-2 flex-wrap items-center mb-4">
          {quickCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium whitespace-nowrap ${
                activeCategory === cat
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-low text-on-surface-variant'
              }`}
            >
              {cat}
            </button>
          ))}
          {moreCategories.length > 0 && (
            <select
              value={activeInMore ? activeCategory : ''}
              onChange={(e) => setActiveCategory(e.target.value)}
              className={`px-3 py-1.5 rounded-full text-sm font-medium border-none cursor-pointer ${
                activeInMore
                  ? 'bg-primary text-on-primary'
                  : 'bg-surface-container-low text-on-surface-variant'
              }`}
            >
              <option value="" disabled>{activeInMore ? activeCategory : 'More'}</option>
              {moreCategories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          )}
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 lg:gap-4">
          {paginatedProducts.map((product) => {
            const outOfStock = product.stock_quantity <= 0;
            return (
              <div
                key={product.id}
                className="bg-surface border border-outline-variant rounded-xl p-3"
              >
                <p className="font-medium text-on-surface text-sm lg:text-base">{product.name}</p>
                <p className="text-primary font-semibold">₱{product.selling_price}</p>
                <p className="text-on-surface-variant text-sm mb-2">
                  {formatStock(product)}
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

      <div className="flex justify-between items-center mt-4 text-sm text-on-surface-variant">
      <span>{page} / {totalPages}</span>
      <div className="flex gap-1">
        <button
          disabled={page <= 1}
          onClick={() => setPage((p) => p - 1)}
          className="px-3 py-1 border border-outline-variant rounded disabled:opacity-40"
        >
          Previous
        </button>
        <button
          disabled={page >= totalPages}
          onClick={() => setPage((p) => p + 1)}
          className="px-3 py-1 border border-outline-variant rounded disabled:opacity-40"
        >
          Next
        </button>
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
          <div className="space-y-1 mb-3">
            <div className="flex justify-between text-sm text-on-surface-variant">
              <span>Subtotal</span>
              <span>₱{subtotal.toFixed(2)}</span>
            </div>
            <div className="flex justify-between items-center text-sm text-error">
              <span>Discount</span>
              <input
                type="number"
                min="0"
                value={discount}
                onChange={(e) => setDiscount(e.target.value)}
                placeholder="0.00"
                className="w-24 text-right border border-outline-variant rounded-lg px-2 py-1 text-on-surface"
              />
            </div>
            <div className="flex justify-between font-bold text-on-surface text-lg pt-1 border-t border-outline-variant">
              <span>Total</span>
              <span>₱{total.toFixed(2)}</span>
            </div>
          </div>

          <div className="flex gap-2 mb-3">
            {['cash', 'gcash', 'utang', 'split'].map((method) => (
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
          
          {paymentMethod === 'utang' && (
            <p className="text-xs text-on-surface-variant mb-2">
              +₱{UTANG_MARKUP_PER_UNIT.toFixed(2)}/item utang markup included
            </p>
          )}
          
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

          {paymentMethod === 'split' && (
            <div className="mb-3 space-y-2">
              <select
                value={customerId}
                onChange={(e) => setCustomerId(e.target.value)}
                className="w-full border border-outline-variant rounded-lg px-3 py-2"
              >
                <option value="">Select customer...</option>
                {customers.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <div>
                <label className="text-sm text-on-surface-variant">Cash Received (partial)</label>
                <input
                  type="number"
                  value={amountTendered}
                  onChange={(e) => setAmountTendered(e.target.value)}
                  className="w-full border border-outline-variant rounded-lg px-3 py-2 mt-1"
                />
              </div>
              {amountTendered && Number(amountTendered) > 0 && Number(amountTendered) < total && (
                <p className="text-sm text-error">
                  Remaining on utang: ₱{(total - Number(amountTendered)).toFixed(2)}
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
    <SaleSuccessModal
      isOpen={!!completedSale}
      sale={completedSale}
      onClose={() => setCompletedSale(null)}
      onNewSale={() => setCompletedSale(null)}
    />
    </>
  );
}

export default SalesPOS;