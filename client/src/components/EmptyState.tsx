import Icon from './Icon';

interface EmptyStateProps {
  icon?: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export default function EmptyState({ icon = 'file-text', title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-14 h-14 rounded-full bg-[#F6F7F9] flex items-center justify-center mb-4">
        <Icon name={icon} size={24} className="text-[#6B7280]" />
      </div>
      <h3 className="font-600 text-[#1F2937] mb-1" style={{ fontWeight: 600 }}>{title}</h3>
      {description && <p className="text-sm text-[#6B7280] max-w-xs mb-4">{description}</p>}
      {action}
    </div>
  );
}
