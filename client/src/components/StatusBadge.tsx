interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

const statusConfig: Record<string, { label: string; bg: string; text: string; dot: string }> = {
  // Application statuses
  draft: { label: 'Draft', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  submitted: { label: 'Submitted', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  'barangay-approved': { label: 'Approved by Barangay', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  'barangay-rejected': { label: 'Rejected', bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  'under-review': { label: 'Under Review', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  'additional-requirements': { label: 'Additional Req.', bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  approved: { label: 'Approved', bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  rejected: { label: 'Rejected', bg: 'bg-red-50', text: 'text-red-700', dot: 'bg-red-500' },
  // Document statuses
  'not-uploaded': { label: 'Not Uploaded', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  uploaded: { label: 'Uploaded', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  verified: { label: 'Verified', bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  'needs-replacement': { label: 'Needs Replacement', bg: 'bg-orange-50', text: 'text-orange-700', dot: 'bg-orange-500' },
  // Renewal statuses
  'not-started': { label: 'Not Started', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  renewal: { label: 'Renewal', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  // User roles
  student: { label: 'Student', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  'barangay-official': { label: 'Barangay Official', bg: 'bg-purple-50', text: 'text-purple-700', dot: 'bg-purple-500' },
  'city-staff': { label: 'City Staff', bg: 'bg-navy text-white', text: 'text-white', dot: 'bg-white' },
  'city-admin': { label: 'City Admin', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
  // Program status
  active: { label: 'Active', bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  closed: { label: 'Closed', bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' },
  upcoming: { label: 'Upcoming', bg: 'bg-blue-50', text: 'text-blue-700', dot: 'bg-blue-500' },
  // Scholar status
  scholar: { label: 'Active Scholar', bg: 'bg-green-50', text: 'text-green-700', dot: 'bg-green-500' },
  'renewal-required': { label: 'Renewal Required', bg: 'bg-amber-50', text: 'text-amber-700', dot: 'bg-amber-500' },
};

export default function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const cfg = statusConfig[status] || { label: status, bg: 'bg-gray-100', text: 'text-gray-600', dot: 'bg-gray-400' };
  const px = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs font-medium';
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full ${cfg.bg} ${cfg.text} ${px} font-medium`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot} flex-shrink-0`} />
      {cfg.label}
    </span>
  );
}
