import { CheckCircle2 } from 'lucide-react';

function SaleSuccessModal({ isOpen, onClose, onNewSale, sale }) {
  if (!isOpen || !sale) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl w-full max-w-sm shadow-lg overflow-hidden text-center">
        <div className="p-6">
          <div className="w-16 h-16 rounded-full bg-secondary-container flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="text-secondary" size={36} />
          </div>
          <h2 className="text-xl font-bold text-on-surface mb-1">Sale Completed</h2>
          <p className="text-on-surface-variant text-sm mb-4">Transaction #{sale.id}</p>

          <div className="bg-surface-container-low rounded-lg p-4 space-y-2 text-left text-sm mb-4">
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Total</span>
              <span className="text-on-surface font-bold text-lg">₱{Number(sale.total_amount).toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-on-surface-variant">Payment Method</span>
              <span className="text-on-surface font-medium capitalize">{sale.payment_method}</span>
            </div>
            {sale.payment_method === 'cash' && (
              <>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Cash Received</span>
                  <span className="text-on-surface">₱{Number(sale.amount_tendered).toFixed(2)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-on-surface-variant">Change</span>
                  <span className="text-on-surface">₱{Number(sale.change_amount).toFixed(2)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="p-4 border-t border-outline-variant flex gap-2">
          <button
            onClick={() => window.print()}
            className="flex-1 border border-outline-variant text-on-surface font-medium py-2.5 rounded-lg text-sm"
          >
            Print Receipt
          </button>
          <button
            onClick={onNewSale}
            className="flex-1 bg-primary text-on-primary font-medium py-2.5 rounded-lg text-sm"
          >
            New Sale
          </button>
        </div>
      </div>
    </div>
  );
}

export default SaleSuccessModal;