import StaffMessages from '../../components/StaffMessages';

// Barangay inbox: student threads (existing behaviour) PLUS City Office
// threads, and a compose picker limited to City Office accounts. The
// role-pair rules are enforced by the API; this page only displays them.
export default function BarangayMessages() {
  return (
    <StaffMessages
      title="Messages"
      subtitle="Reply to your students and coordinate with the City Office"
      breadcrumb={['Barangay', 'Messages']}
      threadHint="Student threads and City Office threads."
      emptyThreadsTitle="No messages yet"
      emptyThreadsHint="Student inquiries appear here. Use New Message to reach the City Office."
    />
  );
}
