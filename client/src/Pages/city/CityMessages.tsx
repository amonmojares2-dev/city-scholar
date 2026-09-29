import StaffMessages from '../../components/StaffMessages';

// City Office staff inbox: threads with Barangay Offices and Super Admin
// accounts, and a compose picker limited to exactly those contacts.
// The role-pair rules are enforced by the API; this page only displays them.
export default function CityMessages() {
  return (
    <StaffMessages
      title="Messages"
      subtitle="Coordinate with Barangay Offices and Super Admin accounts"
      breadcrumb={['City Office', 'Messages']}
      threadHint="Threads with Barangay Offices and Super Admin accounts."
      emptyThreadsTitle="No conversations yet"
      emptyThreadsHint="Start a thread with a Barangay Office or a Super Admin account."
    />
  );
}

