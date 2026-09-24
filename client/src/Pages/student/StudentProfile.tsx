import { useEffect, useRef, useState } from 'react';
import Icon from '../../components/Icon';
import PageHeader from '../../components/PageHeader';
import StatusBadge from '../../components/StatusBadge';
import { api, validateImageFile } from '../../lib/api';
import { updateSessionUser, type SessionUser } from '../../lib/auth';
import DeleteAccountSection from '../../components/DeleteAccountSection';
import SessionAvatar from '../../components/SessionAvatar';

type Application = { program?: string; school?: string; applicant?: Record<string, string> };
type User = SessionUser & { profile?: Record<string, string>; barangay?: { name: string } };
const fields = [
  ['dateOfBirth', 'Date of Birth'], ['sex', 'Sex'], ['civilStatus', 'Civil Status'], ['nationality', 'Nationality'],
  ['mobileNumber', 'Mobile Number'], ['address', 'Home Address'], ['city', 'City'], ['zipCode', 'ZIP Code'],
  ['studentId', 'Student ID'], ['course', 'Course'], ['yearLevel', 'Year Level'], ['academicTerm', 'Academic Term'],
  ['gwa', 'Current GWA'], ['unitsEnrolled', 'Units Enrolled'], ['schoolName', 'School Name'],
  ['schoolType', 'School Type'], ['schoolYear', 'School Year'],
] as const;

export default function StudentProfile() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoMessage, setPhotoMessage] = useState('');
  const [photoError, setPhotoError] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [application, setApplication] = useState<Application | null>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { api<{ user: User; latestApplication?: Application }>('/auth/me').then(result => { setUser(result.user); setApplication(result.latestApplication || null); setProfile({ ...(result.latestApplication?.applicant || {}), ...(result.user.profile || {}) }); }).catch(requestError => setError(requestError instanceof Error ? requestError.message : 'Unable to load profile.')).finally(() => setLoading(false)); }, []);
  useEffect(() => () => {
    if (photoPreview) URL.revokeObjectURL(photoPreview);
  }, [photoPreview]);
  const save = async () => { setSaving(true); setError(''); try { const result = await api<{ user: User }>('/auth/me', { method: 'PATCH', body: JSON.stringify({ profile }) }); setUser(result.user); setProfile(result.user.profile || {}); setEditing(false); setMessage('Profile saved successfully.'); } catch (requestError) { setError(requestError instanceof Error ? requestError.message : 'Unable to save profile.'); } finally { setSaving(false); } };
  const uploadPhoto = async (file: File) => {
    setPhotoMessage('');
    setPhotoError('');
    const validationError = validateImageFile(file);
    if (validationError) {
      setPhotoError(validationError);
      return;
    }

    const preview = URL.createObjectURL(file);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(preview);
    setUploadingPhoto(true);
    try {
      const body = new FormData();
      body.append('file', file);
      const result = await api<{
        message: string;
        user: Pick<User, 'hasProfilePhoto' | 'profilePhotoUrl' | 'profilePhotoUpdatedAt'>;
      }>('/users/me/photo', {
        method: 'POST',
        body,
      });
      setUser(current => current ? { ...current, ...result.user } : current);
      updateSessionUser(result.user);
      if (photoPreview) URL.revokeObjectURL(photoPreview);
      setPhotoPreview(null);
      setPhotoMessage(result.message);
    } catch (requestError) {
      URL.revokeObjectURL(preview);
      setPhotoPreview(null);
      setPhotoError(requestError instanceof Error ? requestError.message : 'Unable to upload profile photo.');
    } finally {
      setUploadingPhoto(false);
    }
  };

  if (loading) return <div className="py-16 text-center text-sm text-[#6B7280]">Loading your profile...</div>;
  if (!user) return <div className="bg-red-50 rounded-xl p-4 text-sm text-red-700">{error || 'Profile not found.'}</div>;
  const Section = ({ title, keys }: { title: string; keys: string[] }) => {
    const displayValue = (key: string, value: string) => key === 'yearLevel' && /^(grade 11|grade 12)$/i.test(value.trim()) ? '' : value;
    return <div className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden mb-4"><div className="px-5 py-4 border-b border-[#E5E7EB] font-600 text-[#1F2937] text-sm">{title}</div><div className="p-5 grid sm:grid-cols-2 gap-x-8 gap-y-4">{fields.filter(([key]) => keys.includes(key)).map(([key, label]) => <label key={key} className="text-xs text-[#6B7280]">{label}{editing && key !== 'schoolName' ? <input value={profile[key] || ''} onChange={event => setProfile(current => ({ ...current, [key]: event.target.value }))} className="mt-1 w-full px-3 py-2 rounded-lg border border-[#E5E7EB] text-sm text-[#1F2937]" /> : <div className="text-sm font-500 text-[#1F2937] mt-1">{displayValue(key, profile[key] || '') || 'Not provided'}{key === 'schoolName' && <span className="block text-[10px] text-[#9CA3AF] mt-0.5">Selected during account registration</span>}</div>}</label>)}</div></div>;
  };

  return <div><PageHeader title="Scholar Profile" subtitle="Manage your personal and academic information" breadcrumb={['Student Portal', 'Scholar Profile']} action={<button onClick={editing ? save : () => setEditing(true)} disabled={saving} className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-600 bg-[#0B1F3A] text-white disabled:opacity-50"><Icon name={editing ? 'check' : 'edit'} size={14} />{saving ? 'Saving...' : editing ? 'Save Changes' : 'Edit Profile'}</button>} />
    {error && <div className="mb-4 bg-red-50 border border-red-100 rounded-xl px-4 py-3 text-sm text-red-700">{error}</div>}{message && <div className="mb-4 bg-green-50 border border-green-100 rounded-xl px-4 py-3 text-sm text-green-700">{message}</div>}
    <div className="bg-[#0B1F3A] rounded-2xl p-5 mb-6 flex flex-col sm:flex-row sm:items-center gap-5 text-white">
      <div className="w-16 h-16 rounded-full bg-[#163A63] flex items-center justify-center text-2xl font-800 overflow-hidden flex-shrink-0" style={{ fontWeight: 800 }}>
        {photoPreview
          ? <img src={photoPreview} alt="Selected profile preview" className="w-full h-full object-cover" />
          : <SessionAvatar
            name={user.name}
            hasProfilePhoto={user.hasProfilePhoto}
            savedUrl={user.profilePhotoUrl}
            updatedAt={user.profilePhotoUpdatedAt}
            className="w-full h-full"
          />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="font-700 text-lg" style={{ fontWeight: 700 }}>{user.name}</div>
        <div className="text-white/60 text-sm">{user.email}</div>
        <div className="mt-2 flex items-center gap-2"><StatusBadge status="student" /><span className="text-xs text-white/70">{user.barangay?.name || 'Barangay not assigned'}</span></div>
      </div>
      <div className="sm:text-right">
        <button
          type="button"
          onClick={() => photoInputRef.current?.click()}
          disabled={uploadingPhoto}
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl border border-white/20 text-sm text-white hover:bg-white/10 disabled:opacity-60 disabled:cursor-not-allowed ${uploadingPhoto ? 'pointer-events-none' : ''}`}
        >
          <Icon name="upload" size={15} />{uploadingPhoto ? 'Uploading…' : 'Change Photo'}
        </button>
          <input
            id="scholar-profile-photo"
            ref={photoInputRef}
            type="file"
            accept="image/png,image/jpeg,.png,.jpg,.jpeg"
            className="sr-only"
            disabled={uploadingPhoto}
            aria-label="Choose a new profile photo"
            onChange={event => {
              const file = event.target.files?.[0];
              event.target.value = '';
              if (file) uploadPhoto(file);
            }}
          />
        <p className="text-xs text-white/60 mt-1">PNG or JPEG, max 5 MB</p>
      </div>
    </div>
    {uploadingPhoto && <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-700" role="status">Uploading profile photo…</div>}
    {photoMessage && !uploadingPhoto && <div className="mb-4 rounded-xl border border-green-100 bg-green-50 px-4 py-3 text-sm text-green-700" role="status">{photoMessage}</div>}
    {photoError && !uploadingPhoto && <div className="mb-4 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700" role="alert">{photoError}</div>}
    <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5 mb-4 flex items-center gap-3"><div className="w-10 h-10 rounded-xl bg-[#F6F7F9] text-[#163A63] flex items-center justify-center"><Icon name="map-pin" size={18} /></div><div><div className="text-xs text-[#6B7280]">Assigned Barangay</div><div className="font-700 text-sm text-[#1F2937]">{user.barangay?.name || 'Not assigned'}</div></div></div>
    <Section title="Personal and Contact Information" keys={['dateOfBirth', 'sex', 'civilStatus', 'nationality', 'mobileNumber', 'address', 'city', 'zipCode']} />
    <Section title="Academic Information" keys={['studentId', 'course', 'yearLevel', 'academicTerm', 'gwa', 'unitsEnrolled']} />
    <Section title="School Information" keys={['schoolName', 'schoolType', 'schoolYear']} />
    <div className="bg-white rounded-2xl border border-[#E5E7EB] p-5"><div className="text-xs text-[#6B7280]">Current application</div><div className="font-700 text-sm text-[#1F2937] mt-1">{application ? `${application.program || 'Scholarship'} · ${application.school || 'School not provided'}` : 'No application submitted yet'}</div></div>
    <DeleteAccountSection />
  </div>;
}
