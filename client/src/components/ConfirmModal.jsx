import { AlertTriangle } from 'lucide-react';

function ConfirmModal({ isOpen, title, message, confirmLabel = 'Confirm', danger = true, onConfirm, onCancel }) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-surface rounded-xl w-full max-w-sm shadow-lg overflow-hidden">
        <div className="p-6 text-center">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-3 ${
            danger ? 'bg-error-container text-error' : 'bg-primary-container/20 text-primary'
          }`}>
            <AlertTriangle size={24} />
          </div>
          <h2 className="text-lg font-semibold text-on-surface mb-1">{title}</h2>
          <p className="text-on-surface-variant text-sm">{message}</p>
        </div>
        <div className="p-4 border-t border-outline-variant flex gap-2">
          <button
            onClick={onCancel}
            className="flex-1 border border-outline-variant text-on-surface font-medium py-2.5 rounded-lg text-sm"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`flex-1 font-medium py-2.5 rounded-lg text-sm ${
              danger ? 'bg-error text-white' : 'bg-primary text-on-primary'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmModal;