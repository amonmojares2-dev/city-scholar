import Icon from './Icon';

interface StatCardProps {
  label: string;
  value: string | number;
  icon: string;
  change?: string;
  changeType?: 'up' | 'down' | 'neutral';
  accent?: boolean;
}

export default function StatCard({ label, value, icon, change, changeType = 'neutral', accent = false }: StatCardProps) {
  return (
    <div className={`rounded-xl border border-[#E5E7EB] p-5 ${accent ? 'bg-[#0B1F3A] text-white' : 'bg-white'}`}>
      <div className="flex items-start justify-between mb-3">
        <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${accent ? 'bg-white/10' : 'bg-[#F6F7F9]'}`}>
          <Icon name={icon} size={18} className={accent ? 'text-[#D4A72C]' : 'text-[#163A63]'} />
        </div>
        {change && (
          <span className={`text-xs font-medium ${
            changeType === 'up' ? 'text-[#22A06B]' :
            changeType === 'down' ? 'text-[#DC2626]' :
            accent ? 'text-white/60' : 'text-[#6B7280]'
          }`}>
            {change}
          </span>
        )}
      </div>
      <div className={`text-2xl font-700 mb-1 ${accent ? 'text-white' : 'text-[#1F2937]'}`} style={{ fontWeight: 700 }}>
        {value}
      </div>
      <div className={`text-sm ${accent ? 'text-white/70' : 'text-[#6B7280]'}`}>{label}</div>
    </div>
  );
}
