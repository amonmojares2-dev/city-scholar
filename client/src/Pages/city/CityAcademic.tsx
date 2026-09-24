import { useEffect, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import Icon from '../../components/Icon';
import PageHeader from '../../components/PageHeader';
import { api } from '../../lib/api';

// Academic monitoring is computed from the verified scholars' real GWA
// values (User.profile.gwa) returned by GET /api/scholars. No scholars with
// GWA records means an honest empty state - never invented numbers.
interface ApprovedScholar {
  id: string;
  name: string;
  email: string;
  scholarId?: string;
  school: string;
  course: string;
  yearLevel: string;
  gwa: string;
  barangayId: string | null;
  barangay: string;
  verifiedAt: string | null;
}

interface GradedScholar extends ApprovedScholar {
  gwaValue: number;
}

interface Bucket { range: string; label: string; count: number }

const BUCKETS: { max: number; range: string; label: string }[] = [
  { max: 1.5, range: '1.00-1.50', label: 'Exceptional' },
  { max: 1.75, range: '1.51-1.75', label: 'Excellent' },
  { max: 2.0, range: '1.76-2.00', label: 'Very Good' },
  { max: 2.25, range: '2.01-2.25', label: 'Good' },
  { max: 5.0, range: 'Above 2.25', label: 'At Risk' },
];

function parseGwa(value: string): number | null {
  const parsed = parseFloat(String(value || ''));
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 5 ? parsed : null;
}

export default function CityAcademic() {
  const [scholars, setScholars] = useState<ApprovedScholar[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    api<{ scholars: ApprovedScholar[] }>('/scholars')
      .then((result) => { if (!cancelled) setScholars(result.scholars || []); })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load scholar records.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const graded: GradedScholar[] = scholars
    .map((scholar) => ({ ...scholar, gwaValue: parseGwa(scholar.gwa) }))
    .filter((scholar): scholar is GradedScholar => scholar.gwaValue !== null);

  const data: Bucket[] = BUCKETS.map((bucket, index) => {
    const lower = index === 0 ? 0 : BUCKETS[index - 1].max;
    return {
      range: bucket.range,
      label: bucket.label,
      count: graded.filter((scholar) => scholar.gwaValue > lower && scholar.gwaValue <= bucket.max).length,
    };
  });

  const average = graded.length
    ? (graded.reduce((sum, scholar) => sum + scholar.gwaValue, 0) / graded.length).toFixed(2)
    : null;
  const exceptional = data[0]?.count ?? 0;
  const atRisk = graded.filter((scholar) => scholar.gwaValue > 2.25);
  const belowThreshold = graded.filter((scholar) => scholar.gwaValue > 2.5);

  if (loading) return <div className="py-16 text-center text-sm text-[#6B7280]">Loading academic data...</div>;

  return (
    <div>
      <PageHeader title="Academic Monitoring" subtitle="GWA distribution of City Office-verified scholars" breadcrumb={['City Office', 'Academic Monitoring']} />
      {error && <div className="mb-4 bg-red-50 rounded-xl p-4 text-sm text-red-700">{error}</div>}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-5">
        {[
          { label: 'Average GWA', value: average === null ? '—' : average, color: 'text-[#22A06B]' },
          { label: 'Exceptional (1.50 or better)', value: String(exceptional), color: 'text-[#0B1F3A]' },
          { label: 'At Risk (above 2.25)', value: String(atRisk.length), color: 'text-[#D97706]' },
          { label: 'Above 2.50', value: String(belowThreshold.length), color: 'text-[#DC2626]' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-[#E5E7EB] p-4 text-center">
            <div className="text-2xl text-[#1F2937]" style={{ fontWeight: 800 }}>{stat.value}</div>
            <div className="text-xs text-[#6B7280] mt-1">{stat.label}</div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 mb-5">
        <h3 className="text-sm text-[#1F2937] mb-4" style={{ fontWeight: 700 }}>GWA Distribution ({graded.length} scholars with GWA records)</h3>
        {graded.length === 0 ? (
          <p className="py-8 text-center text-sm text-[#6B7280]">
            No verified scholars have GWA records yet. Values appear here as scholars are approved and their profile GWA is recorded.
          </p>
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={data}>
              <XAxis dataKey="range" tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#6B7280' }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #E5E7EB', fontSize: 12 }} />
              <Bar dataKey="count" fill="#163A63" radius={[4, 4, 0, 0]} name="Scholars" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[#E5E7EB]">
          <h3 className="text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>Students Requiring Attention (GWA above 2.25)</h3>
          <span className="px-2.5 py-1 bg-red-50 text-red-700 text-xs font-600 rounded-full" style={{ fontWeight: 600 }}>{atRisk.length} scholars</span>
        </div>
        {atRisk.length === 0 ? (
          <div className="p-10 text-center text-sm text-[#6B7280]">
            {graded.length === 0
              ? 'Nothing to show yet - no verified scholar has a recorded GWA.'
              : 'No verified scholar is above the 2.25 monitoring threshold.'}
          </div>
        ) : (
          <div className="divide-y divide-[#E5E7EB]">
            {atRisk
              .slice()
              .sort((a, b) => b.gwaValue - a.gwaValue)
              .slice(0, 10)
              .map((scholar) => (
                <div key={scholar.id} className="flex items-center gap-4 px-5 py-4">
                  <div className="w-9 h-9 rounded-xl bg-red-50 flex items-center justify-center flex-shrink-0">
                    <Icon name="alert-triangle" size={16} className="text-[#DC2626]" />
                  </div>
                  <div className="flex-1">
                    <div className="text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>{scholar.name}</div>
                    <div className="text-xs text-[#6B7280]">
                      {scholar.school || 'School not recorded'} · GWA {scholar.gwaValue.toFixed(2)} is above the 2.25 monitoring threshold
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-[#DC2626]" style={{ fontWeight: 700 }}>GWA {scholar.gwaValue.toFixed(2)}</div>
                  </div>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
}
