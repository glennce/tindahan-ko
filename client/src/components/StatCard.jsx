function StatCard({ label, value, change, icon: Icon, goodDown = false }) {
  const good = goodDown ? change < 0 : change >= 0;
  return (
    <div className="bg-surface border border-outline-variant rounded-xl p-4">
      <div className="flex justify-between items-start">
        <p className="text-on-surface-variant text-sm">{label}</p>
        {Icon && <div className="bg-primary-container/20 text-primary p-1.5 rounded-md"><Icon size={16} /></div>}
      </div>
      <p className="text-2xl font-bold text-on-surface mt-2">{value}</p>
      {change !== undefined && (
        <p className={`text-xs mt-1 ${good ? 'text-secondary' : 'text-error'}`}>
          {change >= 0 ? '↑' : '↓'} {Math.abs(change).toFixed(1)}% vs previous period
        </p>
      )}
    </div>
  );
}

export default StatCard;
