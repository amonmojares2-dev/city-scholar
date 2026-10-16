import type { TermsPrivacyDocuments as TermsPrivacyDocumentsData } from '../lib/termsPrivacyDefaults';

function formatUpdatedAt(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

export default function TermsPrivacyDocuments({ documents }: { documents: TermsPrivacyDocumentsData }) {
  const items = [documents.terms, documents.privacy];

  return (
    <section className="mt-12" aria-label="Terms and privacy documents">
      <nav className="mb-5 flex flex-wrap gap-3 text-sm" aria-label="Terms and privacy">
        <a className="text-[#163A63] hover:underline" href="#terms">Terms and Conditions</a>
        <a className="text-[#163A63] hover:underline" href="#privacy">Data Privacy Policy</a>
      </nav>
      <div className="space-y-5">
        {items.map(document => {
          const lines = document.content.split(/\r?\n/);
          const body = lines[0]?.trim().toLocaleLowerCase() === document.title.toLocaleLowerCase()
            ? lines.slice(1).join('\n').trimStart()
            : document.content;
          const updatedAt = formatUpdatedAt(document.updatedAt);
          return (
            <article key={document.key} id={document.key} className="scroll-mt-24 rounded-2xl border border-[#E5E7EB] bg-white p-6">
              <h2 className="mb-4 text-xl font-700 text-[#0B1F3A]" style={{ fontWeight: 700 }}>{document.title}</h2>
              <p className="mb-4 text-xs text-[#9CA3AF]">Last updated: {updatedAt || 'Not yet updated'}</p>
              <div className="whitespace-pre-wrap break-words text-sm leading-relaxed text-[#4B5563]">{body}</div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
