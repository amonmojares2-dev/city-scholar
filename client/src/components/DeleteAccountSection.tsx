import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router';
import Icon from './Icon';
import ConfirmDialog from './ConfirmDialog';
import { api } from '../lib/api';
import { clearSession } from '../lib/auth';

export default function DeleteAccountSection() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  const close = useCallback(() => {
    if (deleting || success) return;
    setOpen(false);
    setConfirmation('');
    setError('');
  }, [deleting, success]);

  const deleteAccount = async () => {
    if (!confirmation.trim() || deleting) return;
    setDeleting(true);
    setError('');
    try {
      await api<{ message: string }>('/users/me', {
        method: 'DELETE',
        body: JSON.stringify({ confirmation: confirmation.trim() }),
      });
      clearSession();
      setSuccess(true);
      window.setTimeout(() => navigate('/login', { replace: true }), 1200);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : 'Unable to delete your account.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <>
      <section className="mt-8 border border-red-200 rounded-2xl bg-red-50/50 p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h3 className="font-700 text-red-800" style={{ fontWeight: 700 }}>Danger Zone</h3>
            <p className="text-sm text-red-700 mt-1">Permanently delete your account and all related data.</p>
          </div>
          <button
            type="button"
            onClick={() => { setOpen(true); setError(''); setConfirmation(''); }}
            className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-600 hover:bg-red-700 text-white text-sm font-700 disabled:opacity-50"
            style={{ fontWeight: 700 }}
          >
            <Icon name="alert-circle" size={16 } />Delete Account
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={open}
        title="Delete your account?"
        message="This will permanently delete your account and all your data. This cannot be undone."
        confirmLabel="Delete Account"
        cancelLabel="Cancel"
        danger
        loading={deleting}
        confirmDisabled={!confirmation.trim() || success}
        onCancel={close}
        onConfirm={deleteAccount}
      >
        {success ? (
          <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3 text-sm text-green-700">
            Your account was deleted. Redirecting to login…
          </div>
        ) : (
          <div>
            <label htmlFor="delete-account-confirmation" className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>
              Enter your password, or type DELETE
            </label>
            <input
              id="delete-account-confirmation"
              type="text"
              value={confirmation}
              onChange={event => { setConfirmation(event.target.value); setError(''); }}
              autoComplete="off"
              disabled={deleting}
              className="w-full px-3 py-2.5 rounded-xl border border-[#E5E7EB] text-sm text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-red-500/20 focus:border-red-500 disabled:opacity-50"
              placeholder="Password or DELETE"
            />
            {error && <p className="mt-2 text-sm text-red-600" role="alert">{error}</p>}
          </div>
        )}
      </ConfirmDialog>
    </>
  );
}