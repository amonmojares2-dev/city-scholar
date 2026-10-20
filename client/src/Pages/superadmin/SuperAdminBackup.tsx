import { useCallback, useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import PageHeader from '../../components/PageHeader';
import { api } from '../../lib/api';

type BackupStatus = 'success' | 'failed' | 'in-progress';

interface BackupRecord {
  id: string;
  name: string;
  type: 'full' | 'incremental';
  size: string;
  sizeBytes: number;
  createdAt: string;
  createdBy: string;
  status: BackupStatus;
  notes: string;
}

const STATUS_MAP: Record<BackupStatus, { label: string; bg: string; text: string; dot: string }> = {
  success:     { label: 'Success',     bg: 'bg-green-50',  text: 'text-green-700',  dot: 'bg-green-500' },
  failed:      { label: 'Failed',      bg: 'bg-red-50',    text: 'text-red-700',    dot: 'bg-red-500' },
  'in-progress': { label: 'In Progress', bg: 'bg-blue-50', text: 'text-blue-700',  dot: 'bg-blue-400' },
};

function StatusPill({ status }: { status: BackupStatus }) {
  const s = STATUS_MAP[status];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-600 ${s.bg} ${s.text}`} style={{ fontWeight: 600 }}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

type ModalMode = 'create' | 'restore' | 'delete' | null;

interface BackupListResponse {
  success: boolean;
  backups: BackupRecord[];
}

function formatDate(value: string) {
  return new Date(value).toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatSize(bytes: number) {
  if (!bytes) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function SuperAdminBackup() {
  const [backups, setBackups] = useState<BackupRecord[]>([]);
  const [modal, setModal] = useState<ModalMode>(null);
  const [target, setTarget] = useState<BackupRecord | null>(null);
  const [creating, setCreating] = useState(false);
  const [working, setWorking] = useState(false);
  const [loading, setLoading] = useState(true);
  const [backupType, setBackupType] = useState<'full' | 'incremental'>('full');
  const [backupNote, setBackupNote] = useState('');
  const [restoreConfirm, setRestoreConfirm] = useState('');
  const [toast, setToast] = useState('');
  const [error, setError] = useState('');

  const loadBackups = useCallback(async () => {
    setLoading(true);
    try {
      const response = await api<BackupListResponse>('/super-admin/backups');
      setBackups(response.backups);
      setError('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load backups.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadBackups(); }, [loadBackups]);

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(''), 3500);
  }

  function closeModal() {
    setModal(null);
    setTarget(null);
    setRestoreConfirm('');
    setBackupNote('');
    setBackupType('full');
  }

  async function handleCreate() {
    setError('');
    setCreating(true);
    setWorking(true);
    try {
      await api<{ success: boolean; backup: BackupRecord }>('/super-admin/backups', {
        method: 'POST',
        body: JSON.stringify({ type: backupType, notes: backupNote.trim() }),
      });
      closeModal();
      await loadBackups();
      setCreating(false);
      showToast('Backup completed successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to create the backup.');
    } finally {
      setCreating(false);
      setWorking(false);
    }
  }

  async function handleDelete() {
    if (!target) return;
    setError('');
    setWorking(true);
    try {
      await api<{ success: boolean }>(`/super-admin/backups/${target.id}`, { method: 'DELETE' });
      closeModal();
      await loadBackups();
      showToast('Backup deleted.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to delete the backup.');
    } finally {
      setWorking(false);
    }
  }

  async function handleRestore() {
    if (!target || restoreConfirm !== 'RESTORE') return;
    setError('');
    setWorking(true);
    try {
      await api<{ success: boolean }>(`/super-admin/backups/${target.id}/restore`, {
        method: 'POST',
        body: JSON.stringify({ confirmation: restoreConfirm }),
      });
      closeModal();
      await loadBackups();
      showToast(`System restored from "${target.name}". A safety backup was created.`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unable to restore the backup.';
      await loadBackups();
      setError(message);
    } finally {
      setWorking(false);
    }
  }

  const lastSuccess = backups.find(b => b.status === 'success');
  const hasFullBackup = backups.some(b => b.type === 'full');
  const totalSize = formatSize(backups.reduce((size, backup) => size + backup.sizeBytes, 0));

  return (
    <div>
      <PageHeader
        title="Backup & Recovery"
        subtitle="Manage system backups and restore points for data protection"
        breadcrumb={['Super Admin', 'Backup & Recovery']}
        action={
          <button
            onClick={() => { setError(''); setModal('create'); }}
            disabled={working}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#0B1F3A] text-white text-sm font-700 rounded-xl hover:bg-[#163A63] transition-colors disabled:opacity-50"
            style={{ fontWeight: 700 }}
          >
            <Icon name="save" size={15} />
            Create Backup
          </button>
        }
      />

      {error && !modal && (
        <div className="mb-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
          <Icon name="alert-circle" size={16} />
          {error}
        </div>
      )}

      {/* Summary tiles */}
      <div className="grid sm:grid-cols-4 gap-4 mb-6">
        {[
          { label: 'Total Backups', value: String(backups.length), icon: 'database', color: 'text-[#163A63]', bg: 'bg-blue-50' },
          { label: 'Last Backup', value: lastSuccess ? formatDate(lastSuccess.createdAt) : '—', icon: 'clock', color: 'text-[#22A06B]', bg: 'bg-green-50' },
          { label: 'Storage Used', value: totalSize, icon: 'hard-drive', color: 'text-[#D97706]', bg: 'bg-amber-50' },
          { label: 'Failed', value: String(backups.filter(b => b.status === 'failed').length), icon: 'alert-triangle', color: 'text-red-600', bg: 'bg-red-50' },
        ].map(t => (
          <div key={t.label} className="bg-white rounded-2xl border border-[#E5E7EB] p-5 flex items-center gap-4">
            <div className={`w-10 h-10 rounded-xl ${t.bg} flex items-center justify-center flex-shrink-0`}>
              <Icon name={t.icon} size={18} className={t.color} />
            </div>
            <div>
              <div className="text-xs text-[#6B7280] mb-0.5">{t.label}</div>
              <div className="font-700 text-[#0B1F3A] text-sm" style={{ fontWeight: 700 }}>{t.value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Schedule info */}
      <div className="bg-[#EFF6FF] border border-blue-200 rounded-2xl p-4 mb-6 flex items-start gap-3">
        <Icon name="info" size={16} className="text-[#2563EB] flex-shrink-0 mt-0.5" />
        <div className="text-sm text-[#1E40AF]">
          <span className="font-600" style={{ fontWeight: 600 }}>Backup schedule: </span>
          No automated schedule is configured. Backups are retained until deleted; restores create an automatic safety backup. Incremental backups require a full backup and depend on its restore chain.
        </div>
      </div>

      {/* Backup list */}
      <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden">
        <div className="px-5 py-4 border-b border-[#E5E7EB] flex items-center justify-between">
          <h2 className="font-700 text-[#1F2937] text-sm" style={{ fontWeight: 700 }}>Backup History</h2>
          <span className="text-xs text-[#6B7280]">{backups.length} records</span>
        </div>

        <div className="divide-y divide-[#E5E7EB]">
          {loading ? (
            <div className="px-5 py-8 text-center text-sm text-[#6B7280]">Loading backups…</div>
          ) : backups.length === 0 ? (
            <div className="px-5 py-8 text-center text-sm text-[#6B7280]">No backups have been created yet.</div>
          ) : backups.map(b => (
            <div key={b.id} className="flex items-center gap-4 px-5 py-4">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${b.type === 'full' ? 'bg-[#0B1F3A]' : 'bg-[#F6F7F9]'}`}>
                <Icon name={b.type === 'full' ? 'database' : 'git-commit'} size={15} className={b.type === 'full' ? 'text-white' : 'text-[#6B7280]'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="font-600 text-sm text-[#1F2937] truncate" style={{ fontWeight: 600 }}>{b.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-500 ${b.type === 'full' ? 'bg-[#0B1F3A]/10 text-[#0B1F3A]' : 'bg-[#F6F7F9] text-[#6B7280]'}`} style={{ fontWeight: 500 }}>
                    {b.type === 'full' ? 'Full' : 'Incremental'}
                  </span>
                </div>
                <div className="flex items-center gap-3 text-xs text-[#9CA3AF]">
                  <span>{formatDate(b.createdAt)}</span>
                  <span>·</span>
                  <span>{b.createdBy}</span>
                  <span>·</span>
                  <span>{b.size}</span>
                  {b.notes && <><span>·</span><span className="text-[#6B7280] italic truncate max-w-[180px]">{b.notes}</span></>}
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <StatusPill status={b.status} />
                {b.status === 'success' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { setError(''); setTarget(b); setModal('restore'); }}
                      disabled={working}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#E5E7EB] text-xs font-600 text-[#163A63] hover:bg-[#F6F7F9] transition-colors"
                      style={{ fontWeight: 600 }}
                    >
                      <Icon name="rotate-ccw" size={12} /> Restore
                    </button>
                    <button
                      onClick={() => { setError(''); setTarget(b); setModal('delete'); }}
                      disabled={working}
                      className="p-1.5 rounded-lg hover:bg-red-50 text-[#9CA3AF] hover:text-red-500 transition-colors"
                    >
                      <Icon name="trash-2" size={14} />
                    </button>
                  </div>
                )}
                {b.status === 'failed' && (
                  <button
                    onClick={() => { setError(''); setBackupType('full'); setModal('create'); }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 text-xs font-600 text-red-600 hover:bg-red-50 transition-colors"
                    style={{ fontWeight: 600 }}
                  >
                    <Icon name="refresh-cw" size={12} /> Retry
                  </button>
                )}
                {b.status === 'in-progress' && (
                  <span className="flex items-center gap-1.5 text-xs text-[#2563EB]">
                    <span className="w-3 h-3 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
                    Running…
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Create Backup Modal */}
      {modal === 'create' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
              <h2 className="font-700 text-[#1F2937]" style={{ fontWeight: 700 }}>Create New Backup</h2>
              <button onClick={closeModal} disabled={working} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#F6F7F9] text-[#6B7280] disabled:opacity-50">
                <Icon name="x" size={15} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              <div>
                <label className="block text-xs font-600 text-[#1F2937] mb-2" style={{ fontWeight: 600 }}>Backup Type</label>
                <div className="grid grid-cols-2 gap-3">
                  {(['full', 'incremental'] as const).map(t => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setBackupType(t)}
                      disabled={t === 'incremental' && !hasFullBackup}
                      className={`flex flex-col items-start p-4 rounded-xl border-2 text-left transition-all disabled:opacity-50 disabled:cursor-not-allowed ${backupType === t ? 'border-[#163A63] bg-[#163A63]/5' : 'border-[#E5E7EB] hover:border-[#163A63]/40'}`}
                    >
                      <Icon name={t === 'full' ? 'database' : 'git-commit'} size={18} className={backupType === t ? 'text-[#163A63]' : 'text-[#9CA3AF]'} />
                      <div className="font-600 text-sm text-[#1F2937] mt-2 capitalize" style={{ fontWeight: 600 }}>{t}</div>
                      <div className="text-xs text-[#9CA3AF] mt-0.5">
                        {t === 'full' ? 'Complete snapshot of all data' : hasFullBackup ? 'Changes since last backup' : 'Create a full backup first'}
                      </div>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>Notes <span className="font-400 text-[#9CA3AF]">(optional)</span></label>
                <input
                  value={backupNote}
                  onChange={e => setBackupNote(e.target.value)}
                  maxLength={500}
                  placeholder="e.g. Pre-deployment snapshot"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]"
                />
              </div>
              <div className="bg-[#F6F7F9] rounded-xl p-3 text-xs text-[#6B7280]">
                <Icon name="info" size={12} className="inline mr-1.5 text-[#9CA3AF]" />
                Backup time depends on the amount of stored data. The system remains available during the process.
              </div>
              <div className="flex gap-3 pt-1">
                <button onClick={closeModal} disabled={working} className="flex-1 py-2.5 border border-[#E5E7EB] rounded-xl text-sm text-[#6B7280] font-600 hover:bg-[#F6F7F9] disabled:opacity-50" style={{ fontWeight: 600 }}>Cancel</button>
                <button onClick={handleCreate} disabled={working} className="flex-1 py-2.5 bg-[#0B1F3A] text-white rounded-xl text-sm font-700 hover:bg-[#163A63] disabled:opacity-50" style={{ fontWeight: 700 }}>{creating ? 'Creating Backup…' : 'Start Backup'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Restore Modal */}
      {modal === 'restore' && target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[#E5E7EB]">
              <h2 className="font-700 text-[#1F2937]" style={{ fontWeight: 700 }}>Restore System</h2>
              <button onClick={closeModal} disabled={working} className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-[#F6F7F9] text-[#6B7280] disabled:opacity-50">
                <Icon name="x" size={15} />
              </button>
            </div>
            <div className="p-6 space-y-4">
              {error && <div role="alert" className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3">
                <Icon name="alert-triangle" size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  Restoring will overwrite the current system state with the selected backup. All data changes made after this backup will be lost. This action cannot be undone.
                </p>
              </div>
              <div className="bg-[#F6F7F9] rounded-xl p-4">
                <div className="text-xs text-[#6B7280] mb-1">Restoring from</div>
                <div className="font-600 text-sm text-[#1F2937]" style={{ fontWeight: 600 }}>{target.name}</div>
                <div className="text-xs text-[#9CA3AF] mt-0.5">{formatDate(target.createdAt)} · {target.size}</div>
              </div>
              <div>
                <label className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>
                  Type <span className="font-mono bg-gray-100 px-1.5 py-0.5 rounded text-xs">RESTORE</span> to confirm
                </label>
                <input
                  value={restoreConfirm}
                  onChange={e => setRestoreConfirm(e.target.value)}
                  placeholder="RESTORE"
                  className="w-full px-3.5 py-2.5 rounded-xl border border-amber-300 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-amber-300/40"
                />
              </div>
              <div className="flex gap-3">
                <button onClick={closeModal} disabled={working} className="flex-1 py-2.5 border border-[#E5E7EB] rounded-xl text-sm text-[#6B7280] font-600 hover:bg-[#F6F7F9] disabled:opacity-50" style={{ fontWeight: 600 }}>Cancel</button>
                <button
                  onClick={handleRestore}
                  disabled={restoreConfirm !== 'RESTORE' || working}
                  className="flex-1 py-2.5 rounded-xl text-sm font-700 text-white transition-opacity disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#D97706', fontWeight: 700 }}
                >
                  {working ? 'Restoring…' : 'Restore Now'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Modal */}
      {modal === 'delete' && target && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm">
            <div className="p-6 text-center">
              {error && <div role="alert" className="mb-4 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>}
              <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Icon name="trash-2" size={22} className="text-red-500" />
              </div>
              <h2 className="font-700 text-[#1F2937] mb-2" style={{ fontWeight: 700 }}>Delete Backup?</h2>
              <p className="text-sm text-[#6B7280] mb-1">You are about to permanently delete:</p>
              <p className="text-sm font-600 text-[#1F2937] mb-5" style={{ fontWeight: 600 }}>{target.name}</p>
              <div className="flex gap-3">
                <button onClick={closeModal} disabled={working} className="flex-1 py-2.5 border border-[#E5E7EB] rounded-xl text-sm text-[#6B7280] font-600 hover:bg-[#F6F7F9] disabled:opacity-50" style={{ fontWeight: 600 }}>Cancel</button>
                <button onClick={handleDelete} disabled={working} className="flex-1 py-2.5 bg-red-600 text-white rounded-xl text-sm font-700 hover:bg-red-700 disabled:opacity-50" style={{ fontWeight: 700 }}>{working ? 'Deleting…' : 'Delete'}</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-3 bg-[#0B1F3A] text-white text-sm px-5 py-3.5 rounded-2xl shadow-xl">
          <Icon name="check-circle" size={16} className="text-[#D4A72C]" />
          {toast}
        </div>
      )}
    </div>
  );
}
