import StaffMessages from '../../components/StaffMessages';

// Super Admin inbox: threads with City Office accounts only. The recipient
// picker, the policy text and the allowed role pairs all come from the API
// (utils/messaging.js), so this page only supplies presentation copy.
export default function SuperAdminMessages() {
  return (
    <StaffMessages
      title="City Office Messages"
      subtitle="Coordinate with City Office accounts"
      breadcrumb={['Super Admin', 'Messages']}
      threadHint="Threads with City Office accounts only."
      emptyThreadsTitle="No conversations yet"
      emptyThreadsHint="Start a thread with a City Office account."
    />
  );
}
