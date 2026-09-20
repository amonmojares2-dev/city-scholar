import { useCallback, useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import PageHeader from '../../components/PageHeader';
import EmptyState from '../../components/EmptyState';
import { api } from '../../lib/api';

interface School {
  id: string;
  name: string;
  address: string;
  type: string;
  contactPerson: string;
  contactEmail: string;
  status: 'active' | 'inactive';
  applications: number;
}

interface Barangay {
  id: string;
  name: string;
  city: string;
  province: string;
  status: 'active' | 'inactive';
  students: number;
  assignedOfficial: string | null;
  assignedOfficialEmail: string | null;
}

interface DataResponse {
  success: boolean;
  schools: School[];
  barangays: Barangay[];
}

interface SaveSchoolResponse {
  success: boolean;
  message: string;
  school: School;
}

interface SaveBarangayResponse {
  success: boolean;
  message: string;
  barangay: Barangay;
}

//__STATE__

export default function SuperAdminDataManagement() {
  const [activeTab, setActiveTab] = useState<'schools' | 'barangays'>('schools');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [schools, setSchools] = useState<School[]>([]);
  const [barangays, setBarangays] = useState<Barangay[]>([]);
  const [barangaySearch, setBarangaySearch] = useState('');

  // Add School modal
  const [showAddSchool, setShowAddSchool] = useState(false);
  const [newSchoolName, setNewSchoolName] = useState('');
  const [newSchoolType, setNewSchoolType] = useState('Private HEI');
  const [newSchoolAddress, setNewSchoolAddress] = useState('');

  // Edit School modal
  const [editSchool, setEditSchool] = useState<School | null>(null);
  const [editSchoolName, setEditSchoolName] = useState('');
  const [editSchoolType, setEditSchoolType] = useState('Private HEI');
  const [editSchoolAddress, setEditSchoolAddress] = useState('');

  // Edit Official modal
  const [editBarangay, setEditBarangay] = useState<Barangay | null>(null);
  const [officialName, setOfficialName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api<DataResponse>('/super-admin/data');
      setSchools(data.schools || []);
      setBarangays(data.barangays || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load schools and barangays.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const totalApplications = schools.filter(s => s.status === 'active').reduce((sum, s) => sum + s.applications, 0);
  const activeSchools = schools.filter(s => s.status === 'active').length;

  const assignedCount = barangays.filter(b => b.assignedOfficial !== null).length;
  const filteredBarangays = barangays.filter(b =>
    b.name.toLowerCase().includes(barangaySearch.toLowerCase()) ||
    (b.assignedOfficial || '').toLowerCase().includes(barangaySearch.toLowerCase())
  );

  async function handleAddSchool() {
    if (!newSchoolName.trim() || saving) return;
    setSaving(true);
    try {
      const data = await api<SaveSchoolResponse>('/super-admin/schools', {
        method: 'POST',
        body: JSON.stringify({ name: newSchoolName.trim(), type: newSchoolType, address: newSchoolAddress.trim() }),
      });
      setSchools(prev => [...prev, data.school]);
      setNewSchoolName('');
      setNewSchoolAddress('');
      setNewSchoolType('Private HEI');
      setShowAddSchool(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unable to save this school.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDeactivate(id: string) {
    const school = schools.find(s => s.id === id);
    if (!school) return;
    try {
      const data = await api<SaveSchoolResponse>(`/super-admin/schools/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ ...school, status: school.status === 'active' ? 'inactive' : 'active' }),
      });
      setSchools(prev => prev.map(s => s.id === id ? data.school : s));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unable to update this school.');
    }
  }

  function openEditSchool(school: School) {
    setEditSchool(school);
    setEditSchoolName(school.name);
    setEditSchoolType(school.type || 'Private HEI');
    setEditSchoolAddress(school.address || '');
  }

  async function handleSaveEditSchool() {
    if (!editSchool || !editSchoolName.trim() || saving) return;
    setSaving(true);
    try {
      const data = await api<SaveSchoolResponse>(`/super-admin/schools/${editSchool.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editSchoolName.trim(), type: editSchoolType, address: editSchoolAddress.trim(), status: editSchool.status }),
      });
      setSchools(prev => prev.map(s => s.id === editSchool.id ? data.school : s));
      setEditSchool(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unable to update this school.');
    } finally {
      setSaving(false);
    }
  }

  function openEditOfficial(barangay: Barangay) {
    setEditBarangay(barangay);
    setOfficialName(barangay.assignedOfficialEmail || '');
  }

  async function handleSaveOfficial() {
    if (!editBarangay || saving) return;
    setSaving(true);
    try {
      const data = await api<SaveBarangayResponse>(`/super-admin/barangays/${editBarangay.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: editBarangay.name, assignedOfficialEmail: officialName.trim() }),
      });
      setBarangays(prev => prev.map(b => b.id === editBarangay.id ? { ...b, ...data.barangay } : b));
      setEditBarangay(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Unable to update this barangay.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-6 bg-[#F6F7F9] min-h-screen">
      <PageHeader
        title="Data Management"
        subtitle="Manage accredited schools and barangay records for the scholarship program."
        breadcrumb={['Super Admin', 'Data Management']}
        action={
          activeTab === 'schools' ? (
            <button
              onClick={() => setShowAddSchool(true)}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white"
              style={{ backgroundColor: '#163A63' }}
            >
              <Icon name="plus" size={15} />
              Add School
            </button>
          ) : undefined
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-white border border-[#E5E7EB] rounded-lg p-1 w-fit">
        {(['schools', 'barangays'] as const).map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className="px-5 py-2 rounded-md text-sm font-medium transition-all"
            style={activeTab === tab
              ? { backgroundColor: '#0B1F3A', color: '#fff' }
              : { color: '#6B7280' }}
          >
            {tab === 'schools' ? 'Accredited Schools' : 'Barangays'}
          </button>
        ))}
      </div>

      {/* SCHOOLS TAB */}
      {activeTab === 'schools' && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 mb-6 max-w-sm">
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
              <p className="text-xs text-[#6B7280] mb-1">Active Schools</p>
              <p className="text-2xl font-bold" style={{ color: '#0B1F3A' }}>{activeSchools}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
              <p className="text-xs text-[#6B7280] mb-1">Total Applications</p>
              <p className="text-2xl font-bold" style={{ color: '#0B1F3A' }}>{totalApplications.toLocaleString()}</p>
            </div>
          </div>

          {error && (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 flex items-center gap-2">
              <Icon name="alert-circle" size={16} />
              {error}
            </div>
          )}

          <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
            {loading ? (
              <div className="py-12 flex flex-col items-center gap-2 text-[#6B7280]">
                <Icon name="refresh" size={20} className="animate-spin" />
                <span className="text-sm">Loading schools…</span>
              </div>
            ) : schools.length === 0 ? (
              <EmptyState
                icon="book"
                title="No schools yet"
                description="Add your first accredited school using the Add School button."
              />
            ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#F6F7F9' }}>
                  <th className="text-left px-5 py-3 font-semibold text-[#374151]">School Name</th>
                  <th className="text-left px-5 py-3 font-semibold text-[#374151]">Type</th>
                  <th className="text-left px-5 py-3 font-semibold text-[#374151]">Status</th>
                  <th className="text-right px-5 py-3 font-semibold text-[#374151]">Applications</th>
                  <th className="text-center px-5 py-3 font-semibold text-[#374151]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {schools.map((school, idx) => (
                  <tr key={school.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'}>
                    <td className="px-5 py-3.5 font-medium text-[#1F2937]">{school.name}</td>
                    <td className="px-5 py-3.5 text-[#6B7280]">{school.type}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        school.status === 'active'
                          ? 'bg-green-50 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}>
                        {school.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-[#0B1F3A]">{school.applications.toLocaleString()}</td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEditSchool(school)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#E5E7EB] text-[#163A63] hover:bg-[#F0F4FA] transition-colors"
                        >
                          <Icon name="edit" size={13} />
                          Edit
                        </button>
                        <button
                          onClick={() => handleDeactivate(school.id)}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            school.status === 'active'
                              ? 'border-red-200 text-red-600 hover:bg-red-50'
                              : 'border-green-200 text-green-600 hover:bg-green-50'
                          }`}
                        >
                          <Icon name={school.status === 'active' ? 'x-circle' : 'check-circle'} size={13} />
                          {school.status === 'active' ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            )}
          </div>
        </>
      )}

      {/* BARANGAYS TAB */}
      {activeTab === 'barangays' && (
        <>
          {/* Summary cards */}
          <div className="grid grid-cols-2 gap-4 mb-6 max-w-sm">
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
              <p className="text-xs text-[#6B7280] mb-1">Total Barangays</p>
              <p className="text-2xl font-bold" style={{ color: '#0B1F3A' }}>{barangays.length}</p>
            </div>
            <div className="bg-white rounded-xl border border-[#E5E7EB] p-4">
              <p className="text-xs text-[#6B7280] mb-1">With Assigned Officials</p>
              <p className="text-2xl font-bold" style={{ color: '#0B1F3A' }}>{assignedCount}</p>
            </div>
          </div>

          {/* Search */}
          <div className="relative mb-4 max-w-xs">
            <Icon name="search" size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#9CA3AF]" />
            <input
              value={barangaySearch}
              onChange={e => setBarangaySearch(e.target.value)}
              placeholder="Search barangays or officials…"
              className="w-full pl-9 pr-4 py-2 rounded-lg border border-[#E5E7EB] text-sm bg-white outline-none focus:ring-2 focus:ring-[#163A63]/20"
            />
          </div>

          <div className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
            {loading ? (
              <div className="py-12 flex flex-col items-center gap-2 text-[#6B7280]">
                <Icon name="refresh" size={20} className="animate-spin" />
                <span className="text-sm">Loading barangays…</span>
              </div>
            ) : (
            <table className="w-full text-sm">
              <thead>
                <tr style={{ backgroundColor: '#F6F7F9' }}>
                  <th className="text-left px-5 py-3 font-semibold text-[#374151]">Barangay Name</th>
                  <th className="text-left px-5 py-3 font-semibold text-[#374151]">Assigned Official</th>
                  <th className="text-right px-5 py-3 font-semibold text-[#374151]">Registered Students</th>
                  <th className="text-left px-5 py-3 font-semibold text-[#374151]">Status</th>
                  <th className="text-center px-5 py-3 font-semibold text-[#374151]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredBarangays.map((brgy, idx) => (
                  <tr key={brgy.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-[#FAFAFA]'}>
                    <td className="px-5 py-3.5 font-medium text-[#1F2937]">{brgy.name}</td>
                    <td className="px-5 py-3.5">
                      {brgy.assignedOfficial
                        ? <span className="text-[#374151]">{brgy.assignedOfficial}</span>
                        : <span className="text-[#9CA3AF] italic">Unassigned</span>
                      }
                    </td>
                    <td className="px-5 py-3.5 text-right font-semibold text-[#0B1F3A]">{brgy.students.toLocaleString()}</td>
                    <td className="px-5 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        brgy.status === 'active' ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                      }`}>
                        {brgy.status === 'active' ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-center gap-2">
                        <button
                          onClick={() => openEditOfficial(brgy)}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#E5E7EB] text-[#163A63] hover:bg-[#F0F4FA] transition-colors"
                        >
                          <Icon name="edit" size={13} />
                          Edit Official
                        </button>
                        <button
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border border-[#E5E7EB] text-[#6B7280] hover:bg-gray-50 transition-colors"
                        >
                          <Icon name="users" size={13} />
                          View Students
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredBarangays.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-[#9CA3AF] text-sm">No barangays found.</td>
                  </tr>
                )}
              </tbody>
            </table>
            )}
          </div>
        </>
      )}

      {/* ADD SCHOOL MODAL */}
      {showAddSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-[#0B1F3A]">Add New School</h2>
              <button onClick={() => setShowAddSchool(false)} className="text-[#9CA3AF] hover:text-[#374151]">
                <Icon name="x" size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1.5">School Name</label>
                <input
                  value={newSchoolName}
                  onChange={e => setNewSchoolName(e.target.value)}
                  placeholder="Enter school name"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5E7EB] text-sm outline-none focus:ring-2 focus:ring-[#163A63]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1.5">Address</label>
                <input
                  value={newSchoolAddress}
                  onChange={e => setNewSchoolAddress(e.target.value)}
                  placeholder="Enter school address"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5E7EB] text-sm outline-none focus:ring-2 focus:ring-[#163A63]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1.5">Type</label>
                <select
                  value={newSchoolType}
                  onChange={e => setNewSchoolType(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5E7EB] text-sm outline-none focus:ring-2 focus:ring-[#163A63]/20 bg-white"
                >
                  <option value="Private HEI">Private HEI</option>
                  <option value="State University">State University</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAddSchool(false)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-[#E5E7EB] text-sm font-medium text-[#374151] hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleAddSchool}
                disabled={!newSchoolName.trim()}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#163A63' }}
              >
                Save School
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT SCHOOL MODAL */}
      {editSchool && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-[#0B1F3A]">Edit School</h2>
              <button onClick={() => setEditSchool(null)} className="text-[#9CA3AF] hover:text-[#374151]">
                <Icon name="x" size={20} />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1.5">School Name</label>
                <input
                  value={editSchoolName}
                  onChange={e => setEditSchoolName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5E7EB] text-sm outline-none focus:ring-2 focus:ring-[#163A63]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1.5">Address</label>
                <input
                  value={editSchoolAddress}
                  onChange={e => setEditSchoolAddress(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5E7EB] text-sm outline-none focus:ring-2 focus:ring-[#163A63]/20"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#374151] mb-1.5">Type</label>
                <select
                  value={editSchoolType}
                  onChange={e => setEditSchoolType(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5E7EB] text-sm outline-none focus:ring-2 focus:ring-[#163A63]/20 bg-white"
                >
                  <option value="Private HEI">Private HEI</option>
                  <option value="State University">State University</option>
                </select>
              </div>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditSchool(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-[#E5E7EB] text-sm font-medium text-[#374151] hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveEditSchool}
                disabled={!editSchoolName.trim()}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors disabled:opacity-50"
                style={{ backgroundColor: '#163A63' }}
              >
                Save Changes
              </button>
            </div>
          </div>
        </div>
      )}

      {/* EDIT OFFICIAL MODAL */}
      {editBarangay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md mx-4 p-6">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-lg font-bold text-[#0B1F3A]">Edit Assigned Official</h2>
                <p className="text-sm text-[#6B7280] mt-0.5">{editBarangay.name}</p>
              </div>
              <button onClick={() => setEditBarangay(null)} className="text-[#9CA3AF] hover:text-[#374151]">
                <Icon name="x" size={20} />
              </button>
            </div>
            <div>
              <label className="block text-sm font-medium text-[#374151] mb-1.5">Official's Account Email</label>
              <input
                value={officialName}
                onChange={e => setOfficialName(e.target.value)}
                placeholder="official@citygov.ph"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#E5E7EB] text-sm outline-none focus:ring-2 focus:ring-[#163A63]/20"
              />
              <p className="text-xs text-[#9CA3AF] mt-1.5">
                Must be the email of an existing barangay staff account. Leave blank to mark as Unassigned.
              </p>
            </div>
            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setEditBarangay(null)}
                className="flex-1 px-4 py-2.5 rounded-lg border border-[#E5E7EB] text-sm font-medium text-[#374151] hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveOfficial}
                className="flex-1 px-4 py-2.5 rounded-lg text-sm font-semibold text-white transition-colors"
                style={{ backgroundColor: '#163A63' }}
              >
                Save Official
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
