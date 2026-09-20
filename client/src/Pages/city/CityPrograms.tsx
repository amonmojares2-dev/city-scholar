import { useEffect, useMemo, useState } from 'react';
import Icon from '../../components/Icon';
import StatusBadge from '../../components/StatusBadge';
import PageHeader from '../../components/PageHeader';
import { api } from '../../lib/api';

// Programs come from the ProgramConfig collection (GET /api/programs, the
// same data the Super Admin maintains in Program Config). Applicant counts
// are computed from live /applications records. Program creation/edition is
// owned by the Super Admin, so this page is intentionally read-only.
interface Program {
  id: string;
  programName: string;
  description: string;
  academicYear: string;
  semester: string;
  minGwa: number;
  requiredUnits: number;
  grantAmount: number;
  slotsAvailable: number;
  applicationOpenAt: string | null;
  applicationCloseAt: string | null;
  active: boolean;
}

interface Application { _id: string; program: string }

const fmt = (value: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
};

const period = (program: Program) => {
  const open = fmt(program.applicationOpenAt);
  const close = fmt(program.applicationCloseAt);
  if (open && close) return open + ' - ' + close;
  if (open) return 'Opens ' + open;
  if (close) return 'Closes ' + close;
  return 'Rolling applications';
};

const programStatus = (program: Program) => {
  if (program.active) return 'active';
  const close = program.applicationCloseAt ? new Date(program.applicationCloseAt).getTime() : 0;
  return close && close < Date.now() ? 'closed' : 'upcoming';
};

export default function CityPrograms() {
  const [programs, setPrograms] = useState<Program[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    Promise.all([api<{ programs: Program[] }>('/programs'), api<{ applications: Application[] }>('/applications')])
      .then(([programResult, applicationResult]) => {
        if (cancelled) return;
        setPrograms(programResult.programs || []);
        setApplications(applicationResult.applications || []);
      })
      .catch((err) => { if (!cancelled) setError(err instanceof Error ? err.message : 'Unable to load programs.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const applicantCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const application of applications) {
      const key = (application.program || '').trim().toLowerCase();
      if (key) counts.set(key, (counts.get(key) || 0) + 1);
    }
    return counts;
  }, [applications]);

  if (loading) return <div className="py-16 text-center text-sm text-[#6B7280]">Loading scholarship programs...</div>;

  return (
    <div>
      <PageHeader title="Scholarship Programs" subtitle="Program configuration maintained by the Super Admin in Program Config" breadcrumb={['City Office', 'Scholarship Programs']} />
      {error && <div className="mb-4 bg-red-50 rounded-xl p-4 text-sm text-red-700">{error}</div>}

      {programs.length === 0 ? (
        <div className="bg-white rounded-2xl border border-[#E5E7EB] p-10 text-center text-sm text-[#6B7280]">
          No scholarship programs configured yet. Programs are created by the Super Admin under Program Config.
        </div>
      ) : (
        <div className="space-y-4">
          {programs.map((program) => {
            const applicants = applicantCounts.get(program.programName.trim().toLowerCase()) || 0;
            return (
              <div key={program.id} className="bg-white rounded-2xl border border-[#E5E7EB] p-5 flex items-center gap-5">
                <div className="w-10 h-10 rounded-xl bg-[#F6F7F9] flex items-center justify-center flex-shrink-0">
                  <Icon name="award" size={18} className="text-[#163A63]" />
                </div>
                <div className="flex-1">
                  <div className="text-sm text-[#1F2937]" style={{ fontWeight: 700 }}>{program.programName}</div>
                  {program.description && <div className="text-xs text-[#6B7280] mt-0.5">{program.description}</div>}
                  <div className="flex items-center gap-3 text-xs text-[#6B7280] mt-1 flex-wrap">
                    <span>{period(program)}</span>
                    <span>·</span>
                    <span>{program.academicYear} · {program.semester}</span>
                    {program.slotsAvailable > 0 && <span>· {program.slotsAvailable} slots</span>}
                    {program.grantAmount > 0 && <span>· P{program.grantAmount.toLocaleString()} grant</span>}
                    {applicants > 0 && <span>· {applicants} applicants</span>}
                  </div>
                </div>
                <StatusBadge status={programStatus(program)} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
