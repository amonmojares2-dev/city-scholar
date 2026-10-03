import { useEffect, useState } from 'react';
import Icon from './Icon';
import { PrivateFileLink } from './PrivateFile';
import { api, ApiError } from '../lib/api';
import {
  AcademicRecord,
  SubjectGrade,
  displayName,
  formatGrade,
  formatGwa,
  passedStatus,
  verificationBadge,
} from '../lib/academicRecords';

interface GradeRecordPanelProps {
  record: AcademicRecord;
  onClose: () => void;
  onSaved: (record: AcademicRecord) => void;
}

type EditState = {
  studentName: string;
  school: string;
  gradeLevel: string;
  term: string;
  computedGwa: string;
  passingMark: string;
  subjects: SubjectGrade[];
};

function toEditState(record: AcademicRecord): EditState {
  return {
    studentName: record.studentName || '',
    school: record.school || '',
    gradeLevel: record.gradeLevel || '',
    term: record.term || '',
    computedGwa: record.computedGwa === null ? '' : String(record.computedGwa),
    passingMark: String(record.passingMark ?? 75),
    subjects: (record.subjects || []).map((subject) => ({ ...subject })),
  };
}

// The drill-down view for one student: full subject breakdown, the source
// file, and the reviewer actions. Everything the AI produced is editable,
// because the whole premise is that a human confirms it before City relies
// on it.
export default function GradeRecordPanel({ record, onClose, onSaved }: GradeRecordPanelProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<EditState>(() => toEditState(record));
  const [remarks, setRemarks] = useState(record.editorRemarks || '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    setDraft(toEditState(record));
    setRemarks(record.editorRemarks || '');
    setEditing(false);
    setError('');
    setNotice('');
  }, [record]);

  // One save path for both reviewer actions: corrections go up together with
  // the verified flag, so "fixed it and confirmed it" is a single round trip.
  const save = async (verified: boolean) => {
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const result = await api<{ record: AcademicRecord }>(`/academic-records/${record.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          verified,
          studentName: draft.studentName,
          school: draft.school,
          gradeLevel: draft.gradeLevel,
          term: draft.term,
          computedGwa: draft.computedGwa === '' ? null : Number(draft.computedGwa),
          passingMark: Number(draft.passingMark),
          subjects: draft.subjects,
          remarks,
        }),
      });
      onSaved(result.record);
      setEditing(false);
      setNotice(verified
        ? 'Record verified. It now counts as City-confirmed data.'
        : 'Saved. The record is still awaiting your review.');
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Unable to save this record.');
    } finally {
      setSaving(false);
    }
  };

  const setSubject = (index: number, patch: Partial<SubjectGrade>) => {
    setDraft((current) => ({
      ...current,
      subjects: current.subjects.map((subject, i) => (i === index ? { ...subject, ...patch } : subject)),
    }));
  };

  const addSubject = () => {
    setDraft((current) => ({ ...current, subjects: [...current.subjects, { name: '', grade: 0 }] }));
  };

  const removeSubject = (index: number) => {
    setDraft((current) => ({
      ...current,
      subjects: current.subjects.filter((_, i) => i !== index),
    }));
  };

  const badge = verificationBadge(record);
  const status = passedStatus(record);
  const inputCls = 'w-full px-3 py-2 rounded-lg border border-[#E5E7EB] text-sm bg-white disabled:bg-[#F9FAFB] disabled:text-[#6B7280]';
  const labelCls = 'block text-xs text-[#6B7280] mb-1';

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40" role="dialog" aria-modal="true">
      <div className="w-full max-w-2xl bg-white h-full overflow-y-auto shadow-xl">
        <div className="sticky top-0 bg-white border-b border-[#E5E7EB] px-6 py-4 flex items-start justify-between gap-4 z-10">
          <div>
            <h2 className="text-base text-[#1F2937]" style={{ fontWeight: 700 }}>{displayName(record)}</h2>
            <p className="text-xs text-[#6B7280] mt-0.5">
              {record.school || 'School not recorded'}
              {record.gradeLevel ? ` · ${record.gradeLevel}` : ''}
              {record.term ? ` · ${record.term}` : ''}
            </p>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium mt-2 ${badge.className}`}>
              <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
              {badge.label}
            </span>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-[#F6F7F9] text-[#6B7280]" aria-label="Close panel">
            <Icon name="x" size={18} />
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          {error && <div className="bg-red-50 text-red-700 text-sm rounded-xl p-3">{error}</div>}
          {notice && <div className="bg-green-50 text-green-700 text-sm rounded-xl p-3">{notice}</div>}

          {record.extractionNote && (
            <div className={`rounded-xl p-3 text-sm ${record.extractionStatus === 'extracted' ? 'bg-[#F6F7F9] text-[#6B7280]' : 'bg-amber-50 text-amber-800'}`}>
              <strong style={{ fontWeight: 600 }}>Extraction note: </strong>
              {record.extractionNote}
            </div>
          )}

          {/* Summary figures */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              { label: 'GWA', value: formatGwa(record.computedGwa) },
              { label: 'Average', value: formatGrade(record.averageGrade) },
              { label: 'Highest', value: formatGrade(record.highestGrade) },
              { label: 'Lowest', value: formatGrade(record.lowestGrade) },
            ].map((stat) => (
              <div key={stat.label} className="rounded-xl border border-[#E5E7EB] p-3 text-center">
                <div className="text-lg text-[#1F2937]" style={{ fontWeight: 700 }}>{stat.value}</div>
                <div className="text-xs text-[#6B7280] mt-0.5">{stat.label}</div>
              </div>
            ))}
          </div>

          {/* Status + source file */}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${
              status === 'Passed' ? 'bg-green-50 text-green-700' :
              status === 'Failed' ? 'bg-red-50 text-red-700' : 'bg-gray-100 text-gray-600'
            }`}>
              {status}
            </span>
            {record.subjectsFailed.length > 0 && (
              <span className="text-xs text-red-700">Failed: {record.subjectsFailed.join(', ')}</span>
            )}
            <PrivateFileLink
              documentId={record.documentId}
              className="text-xs text-[#163A63] hover:underline inline-flex items-center gap-1"
            >
              <Icon name="external-link" size={12} />
              {record.documentName || 'View source document'}
            </PrivateFileLink>
          </div>

          {/* Subject breakdown */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>Subject breakdown</h3>
              {editing && (
                <button onClick={addSubject} className="text-xs text-[#163A63] hover:underline inline-flex items-center gap-1">
                  <Icon name="plus" size={12} /> Add subject
                </button>
              )}
            </div>

            {draft.subjects.length === 0 && !editing ? (
              <p className="text-sm text-[#6B7280] py-4 bg-[#F6F7F9] rounded-xl px-4">
                No subject grades were extracted. Use “Edit fields” to enter them manually.
              </p>
            ) : (
              <div className="border border-[#E5E7EB] rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead>
                    <tr className="bg-[#F6F7F9] border-b border-[#E5E7EB]">
                      <th className="px-4 py-2.5 text-left text-xs text-[#6B7280]" style={{ fontWeight: 600 }}>Subject</th>
                      <th className="px-4 py-2.5 text-right text-xs text-[#6B7280]" style={{ fontWeight: 600 }}>Grade</th>
                      {editing && <th className="w-10" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#E5E7EB]">
                    {draft.subjects.map((subject, index) => {
                      const failing = subject.grade < (record.passingMark ?? 75);
                      return (
                        <tr key={index}>
                          <td className="px-4 py-2.5">
                            {editing ? (
                              <input
                                className={inputCls}
                                value={subject.name}
                                onChange={(e) => setSubject(index, { name: e.target.value })}
                                placeholder="Subject name"
                              />
                            ) : (
                              <span className="text-sm text-[#1F2937]">{subject.name}</span>
                            )}
                          </td>
                          <td className="px-4 py-2.5 text-right">
                            {editing ? (
                              <input
                                className={inputCls + ' text-right'}
                                type="number"
                                min={0}
                                max={100}
                                value={subject.grade}
                                onChange={(e) => setSubject(index, { grade: Number(e.target.value) })}
                              />
                            ) : (
                              <span className={`text-sm ${failing ? 'text-red-600' : 'text-[#1F2937]'}`} style={{ fontWeight: 600 }}>
                                {formatGrade(subject.grade)}
                              </span>
                            )}
                          </td>
                          {editing && (
                            <td className="px-2 py-2.5">
                              <button onClick={() => removeSubject(index)} className="text-[#DC2626] hover:text-red-700" aria-label="Remove subject">
                                <Icon name="trash" size={14} />
                              </button>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Editable identity fields */}
          <div className="grid sm:grid-cols-2 gap-3">
            {([
              { key: 'studentName', label: 'Student name on document' },
              { key: 'school', label: 'School' },
              { key: 'gradeLevel', label: 'Grade level' },
              { key: 'term', label: 'Term / Semester' },
            ] as const).map((field) => (
              <div key={field.key}>
                <label className={labelCls}>{field.label}</label>
                <input
                  className={inputCls}
                  value={draft[field.key]}
                  disabled={!editing}
                  onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                />
              </div>
            ))}
            <div>
              <label className={labelCls}>GWA (1.00 – 5.00)</label>
              <input
                className={inputCls}
                type="number"
                min={1}
                max={5}
                step="0.01"
                value={draft.computedGwa}
                disabled={!editing}
                onChange={(e) => setDraft({ ...draft, computedGwa: e.target.value })}
              />
            </div>
            <div>
              <label className={labelCls}>Passing mark (0 – 100)</label>
              <input
                className={inputCls}
                type="number"
                min={0}
                max={100}
                value={draft.passingMark}
                disabled={!editing}
                onChange={(e) => setDraft({ ...draft, passingMark: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label className={labelCls}>Reviewer remarks</label>
            <textarea
              className={inputCls + ' min-h-[70px]'}
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              placeholder="Optional note about what was corrected or confirmed."
            />
          </div>

          {/* Reviewer actions */}
          <div className="flex flex-wrap gap-2 pt-3 border-t border-[#E5E7EB]">
            {!editing ? (
              <button
                onClick={() => setEditing(true)}
                className="px-4 py-2.5 rounded-xl border border-[#E5E7EB] text-sm text-[#1F2937] hover:bg-[#F6F7F9]"
                style={{ fontWeight: 600 }}
              >
                <Icon name="edit" size={14} className="inline mr-1.5 -mt-0.5" /> Edit fields
              </button>
            ) : (
              <button
                onClick={() => { setDraft(toEditState(record)); setEditing(false); }}
                className="px-4 py-2.5 rounded-xl border border-[#E5E7EB] text-sm text-[#6B7280] hover:bg-[#F6F7F9]"
              >
                Cancel
              </button>
            )}

            <button
              onClick={() => save(true)}
              disabled={saving}
              className="px-4 py-2.5 rounded-xl bg-[#163A63] text-white text-sm hover:bg-[#0B1F3A] disabled:opacity-50"
              style={{ fontWeight: 600 }}
            >
              <Icon name="check" size={14} className="inline mr-1.5 -mt-0.5" />
              {record.verifiedByCity ? 'Save & keep verified' : 'Verify record'}
            </button>

            {record.verifiedByCity && (
              <button
                onClick={() => save(false)}
                disabled={saving}
                className="px-4 py-2.5 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 text-sm hover:bg-amber-100 disabled:opacity-50"
              >
                Send back for re-review
              </button>
            )}
          </div>

          <p className="text-xs text-[#9CA3AF]">
            Data extracted by AI on {record.extractedAt ? new Date(record.extractedAt).toLocaleString() : 'an unknown date'}.
            City verification is required before this counts as confirmed academic data.
          </p>
        </div>
      </div>
    </div>
  );
}