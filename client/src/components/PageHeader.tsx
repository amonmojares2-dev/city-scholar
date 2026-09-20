interface PageHeaderProps {
  title: string;
  subtitle?: string;
  breadcrumb?: string[];
  action?: React.ReactNode;
}

export default function PageHeader({ title, subtitle, breadcrumb, action }: PageHeaderProps) {
  return (
    <div className="mb-6 flex items-start justify-between gap-4">
      <div>
        {breadcrumb && (
          <div className="flex items-center gap-1.5 text-xs text-[#6B7280] mb-1">
            {breadcrumb.map((crumb, i) => (
              <span key={i} className="flex items-center gap-1.5">
                {i > 0 && <span>/</span>}
                <span className={i === breadcrumb.length - 1 ? 'text-[#1F2937] font-medium' : 'hover:text-[#163A63] cursor-pointer'}>
                  {crumb}
                </span>
              </span>
            ))}
          </div>
        )}
        <h1 className="text-xl font-700 text-[#1F2937]" style={{ fontWeight: 700 }}>{title}</h1>
        {subtitle && <p className="text-sm text-[#6B7280] mt-0.5">{subtitle}</p>}
      </div>
      {action && <div className="flex-shrink-0">{action}</div>}
    </div>
  );
}
