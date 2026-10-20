import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '../../components/Icon';
import { usePublicContent, type GuidelinesSection } from '../../lib/publicContent';
import type { TermsPrivacyDocument } from '../../lib/termsPrivacyDefaults';

// Shipped copy, overridable from City Office > Program Settings > Public Pages.
const sections = [
  {
    id: 'general',
    title: 'General Provisions',
    content: [
      { heading: '1.1 Purpose', text: 'This guideline governs the implementation, administration, and management of the City Scholarship Program as mandated by City Ordinance No. 2019-045.' },
      { heading: '1.2 Coverage', text: 'These guidelines cover all scholarship grants administered by the City Scholarship Office (CSO), including the Academic Excellence Scholarship, Deserving Student Program, Technical-Vocational Scholarship, Graduate Studies Scholarship, and Special Programs.' },
      { heading: '1.3 Implementing Body', text: 'The City Scholarship Office, under the Office of the Mayor, shall be responsible for the implementation, monitoring, and evaluation of all scholarship programs covered by these guidelines.' },
    ],
  },
  {
    id: 'obligations',
    title: "Scholar's Obligations",
    content: [
      { heading: '2.1 Academic Performance', text: 'All scholars must maintain the required minimum GWA per scholarship program per academic term. Failure to maintain the required GWA shall result in suspension of the scholarship grant pending evaluation.' },
      { heading: '2.2 Residency', text: 'Scholars must remain residents of the city throughout the duration of the scholarship. Transfer of residency must be immediately reported to the CSO.' },
      { heading: '2.3 Event Attendance', text: 'Scholars are required to attend city-organized scholarship events, orientations, recognition ceremonies, and at least two (2) community service activities per year. Proof of attendance must be submitted through the portal.' },
      { heading: '2.4 Renewal', text: 'Scholarship grants are not automatic. Scholars must complete the renewal process within the prescribed period. Renewal requirements include updated academic records, proof of enrollment, and updated personal information.' },
    ],
  },
  {
    id: 'benefits',
    title: 'Benefits and Allowances',
    content: [
      { heading: '3.1 Tuition Assistance', text: 'Scholarship grants cover tuition and miscellaneous fees up to the amount specified per program. Fees exceeding the scholarship grant shall be shouldered by the scholar.' },
      { heading: '3.2 Monthly Allowance', text: 'All active scholars receive a monthly living allowance as specified in their grant certificate. Allowance is disbursed monthly through the city\'s designated disbursement channels.' },
      { heading: '3.3 Book Allowance', text: 'A book and supplies allowance is provided at the beginning of each academic term. Receipts or proof of purchase may be required.' },
      { heading: '3.4 Non-transferability', text: 'Scholarship benefits are personal and non-transferable. Any attempt to transfer or share scholarship benefits shall result in immediate cancellation.' },
    ],
  },
  {
    id: 'grounds',
    title: 'Grounds for Cancellation',
    content: [
      { heading: '4.1 Academic Failure', text: 'Failure to maintain the required GWA for two consecutive terms, or any failing grade in a major subject, without valid reason, constitutes grounds for scholarship cancellation.' },
      { heading: '4.2 Misconduct', text: 'Any act of dishonesty, misconduct, or violation of school policies, including academic dishonesty, shall result in immediate scholarship suspension and investigation.' },
      { heading: '4.3 Duplicate Grants', text: 'Receiving scholarship benefits from two or more government-funded scholarship programs simultaneously is strictly prohibited and shall result in immediate cancellation and recovery of improperly received grants.' },
      { heading: '4.4 Misrepresentation', text: 'Submission of fraudulent documents, false information, or misrepresentation in any part of the application or renewal process shall result in permanent disqualification from all city scholarship programs.' },
    ],
  },
  {
    id: 'appeals',
    title: 'Appeals and Complaints',
    content: [
      { heading: '5.1 Right to Appeal', text: 'Any applicant or scholar who disagrees with a decision by the CSO has the right to file a formal appeal within fifteen (15) calendar days from the date of notification.' },
      { heading: '5.2 Appeal Process', text: 'Appeals must be filed in writing through the scholarship portal or in person at the CSO. The appeal must state the grounds for appeal and attach supporting documents.' },
      { heading: '5.3 Resolution', text: 'The CSO shall resolve all appeals within thirty (30) calendar days. The decision of the CSO Review Committee shall be final and executory unless elevated to the City Mayor\'s Office.' },
    ],
  },
];

// Terms and privacy content is stored as plain text with a fixed layout:
//  - line 1 is the document title ("TERMS AND CONDITIONS")
//  - line 2 is the document section title ("1. Registration & Account Security")
//  - remaining lines are numbered clauses ("1.1 Certification of Truthfulness: ...")
// We re-parse the stored text on every render so City's edits keep rendering
// correctly instead of relying on structured rows.
interface ParsedClause {
  number: string;
  label: string;
  body: string;
}

interface ParsedDocument {
  title: string;
  sectionTitle: string;
  clauses: ParsedClause[];
}

function parseDocumentText(content: string): ParsedDocument | null {
  const lines = content.split(/\r?\n/);
  const nonEmpty: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length > 0) {
      nonEmpty.push(trimmed);
    }
  }

  if (nonEmpty.length < 2) return null;

  const title = nonEmpty[0];
  const sectionTitle = nonEmpty[1];

  const clauses: ParsedClause[] = nonEmpty.slice(2).map((line) => {
    const match = line.match(/^(\d+(?:\.\d+)*)\s+(.*)$/);
    if (!match) {
      return { number: '', label: '', body: line };
    }
    const number = match[1];
    const afterNumber = match[2];
    const colonIndex = afterNumber.indexOf(':');
    if (colonIndex === -1) {
      return { number, label: afterNumber, body: '' };
    }
    const label = afterNumber.slice(0, colonIndex).trim();
    const body = afterNumber.slice(colonIndex + 1).trimStart();
    return { number, label, body };
  });

  return { title, sectionTitle, clauses };
}

function TermsClause({ clause }: { clause: ParsedClause }) {
  return (
    <p
      className="text-sm text-[#6B7280] leading-relaxed"
      style={{
        margin: 0,
        paddingLeft: '1.75rem',
        textIndent: '-1.25rem',
        lineHeight: '1.6',
      }}
    >
      {clause.number && clause.label ? (
        <>
          <span className="font-semibold">{clause.number} {clause.label}:</span>{' '}
          {clause.body}
        </>
      ) : clause.label ? (
        <>
          <span className="font-semibold">{clause.label}:</span>{' '}
          {clause.body}
        </>
      ) : (
        clause.body || clause.number
      )}
    </p>
  );
}

// Shared accordion card used by every section on this page so the card style,
// header typography, padding, and chevron stay identical everywhere.
function AccordionSection({
  id,
  title,
  isOpen,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  isOpen: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  const panelId = `${id}-panel`;
  return (
    <section id={id} className="bg-white rounded-2xl border border-[#E5E7EB] overflow-hidden scroll-mt-24">
      <h2 className="m-0">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={isOpen}
          aria-controls={panelId}
          className="w-full flex items-center justify-between gap-4 px-6 py-4 text-left hover:bg-[#F6F7F9] transition-colors"
        >
          <span className="font-700 text-[#1F2937]" style={{ fontWeight: 700 }}>{title}</span>
          <Icon
            name="chevron-down"
            size={16}
            className={`flex-shrink-0 text-[#6B7280] transition-transform ${isOpen ? 'rotate-180' : ''}`}
          />
        </button>
      </h2>
      {isOpen && (
        <div id={panelId} className="px-6 pb-6 border-t border-[#E5E7EB] space-y-5">
          {children}
        </div>
      )}
    </section>
  );
}

function formatUpdatedAt(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function TermsAndPrivacySection({
  document,
  anchorId,
  isOpen,
  onToggle,
}: {
  document: TermsPrivacyDocument;
  anchorId: string;
  isOpen: boolean;
  onToggle: () => void;
}) {
  const parsed = useMemo(() => parseDocumentText(document.content), [document.content]);
  const updatedAt = formatUpdatedAt(document.updatedAt);

  return (
    <AccordionSection
      id={anchorId}
      title={document.title}
      isOpen={isOpen}
      onToggle={onToggle}
    >
      {parsed ? (
        <div className="pt-5">
          <h3 className="font-600 text-sm text-[#0B1F3A] mb-2" style={{ fontWeight: 600 }}>{parsed.sectionTitle}</h3>
          <p className="mb-4 text-xs text-[#9CA3AF]">Last updated: {updatedAt || 'Not yet updated'}</p>
          <div className="space-y-5">
            {parsed.clauses.map((clause, index) => (
              <TermsClause
                key={clause.label || clause.number || `clause-${index}`}
                clause={clause}
              />
            ))}
          </div>
        </div>
      ) : null}
    </AccordionSection>
  );
}

export default function GuidelinesPage() {
  const { pages, termsPrivacy, loading } = usePublicContent();
  const content = pages.guidelines || {};
  const visibleSections: GuidelinesSection[] = content.sections?.length ? content.sections : sections;

  const tocEntries: { id: string; title: string }[] = [
    ...visibleSections.map(section => ({ id: section.id, title: section.title })),
    { id: 'terms', title: termsPrivacy.terms.title },
    { id: 'privacy', title: termsPrivacy.privacy.title },
  ];

  const [activeSection, setActiveSection] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      return window.location.hash.replace('#', '');
    }
    return sections[0].id;
  });
  const initialHashRef = useRef('');
  useEffect(() => {
    initialHashRef.current = typeof window !== 'undefined' ? window.location.hash : '';
  }, []);
  // Open state lives ONLY here. It must not be derived from the active section:
  // the active section is just what the Contents box highlights, and coupling
  // the two made section headers unable to close their own section.
  const [expanded, setExpanded] = useState<string[]>(() => {
    if (typeof window !== 'undefined' && window.location.hash) {
      return [window.location.hash.replace('#', '')];
    }
    return [sections[0].id];
  });

  // City Office can rename or reorder sections, so fall back to the first one
  // when the section that was open on load no longer exists.
  const active =
    tocEntries.some(entry => entry.id === activeSection)
      ? activeSection
      : visibleSections[0]?.id || '';

  const toggleExpand = (id: string) => {
    setExpanded(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  // Open a section (if it is closed) without ever closing others, so the
  // current open/close model — any number of sections open at once — holds.
  const openSection = (id: string) => {
    setExpanded(prev => prev.includes(id) ? prev : [...prev, id]);
  };

  // The public nav is sticky (h-16 = 64px); leave extra breathing room so the
  // section header lands fully below it.
  const SCROLL_OFFSET = 88;
  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - SCROLL_OFFSET;
    window.scrollTo({ top: Math.max(top, 0), behavior: 'smooth' });
  };

  // Open the section referenced by the URL hash once the public content has
  // finished rendering, then scroll to it so the page does not keep re-flowing
  // under the anchor.
  useEffect(() => {
    if (loading) return;
    const id = initialHashRef.current.replace(/^#/, '');
    if (id && tocEntries.some(entry => entry.id === id)) {
      openSection(id);
      // Wait a frame so the opened panel is in the DOM before scrolling.
      requestAnimationFrame(() => scrollToSection(id));
    } else if (!tocEntries.some(entry => expanded.includes(entry.id))) {
      // The City Office can rename or reorder sections; if the section list
      // that shipped on load no longer exists, open the active one instead.
      openSection(active);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  return (
    <div className="py-12">
      <div className="max-w-[1100px] mx-auto px-6">
        <div className="text-center mb-10">
          <div className="text-xs font-600 text-[#D4A72C] uppercase tracking-widest mb-2" style={{ fontWeight: 600 }}>{content.eyebrow || 'Official Document'}</div>
          <h1 className="text-3xl font-800 text-[#0B1F3A] mb-3" style={{ fontWeight: 800 }}>{content.title || 'Scholarship Guidelines'}</h1>
          <p className="text-[#6B7280] max-w-lg mx-auto text-sm">{content.subtitle || 'City Scholarship Program Implementing Guidelines | AY 2025–2026'}</p>
        </div>

        <div className="flex gap-6">
          {/* TOC */}
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <div className="sticky top-20 bg-white rounded-2xl border border-[#E5E7EB] p-4">
              <div className="text-xs font-700 text-[#6B7280] uppercase tracking-wide mb-3" style={{ fontWeight: 700 }}>Contents</div>
              <ul className="space-y-1">
                {tocEntries.map(entry => (
                  <li key={entry.id}>
                    <a
                      href={`#${entry.id}`}
                      onClick={(event) => {
                        event.preventDefault();
                        setActiveSection(entry.id);
                        openSection(entry.id);
                        scrollToSection(entry.id);
                      }}
                      className={`block w-full text-left text-sm leading-6 px-3 py-2 rounded-lg transition-colors ${
                        active === entry.id
                          ? 'bg-[#0B1F3A] text-white font-600'
                          : 'text-[#6B7280] hover:text-[#1F2937] hover:bg-[#F6F7F9]'
                      }`}
                      style={{ fontWeight: active === entry.id ? 600 : 400 }}
                    >
                      {entry.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </aside>

          {/* Content */}
          <div className="flex-1 space-y-4">
            {visibleSections.map(section => (
              <AccordionSection
                key={section.id}
                id={section.id}
                title={section.title}
                isOpen={expanded.includes(section.id)}
                onToggle={() => { setActiveSection(section.id); toggleExpand(section.id); }}
              >
                {(section.content || []).map(item => (
                  <div key={item.heading} className="pt-5">
                    <h3 className="font-600 text-sm text-[#0B1F3A] mb-2" style={{ fontWeight: 600 }}>{item.heading}</h3>
                    <p className="text-sm text-[#6B7280] leading-relaxed">{item.text}</p>
                  </div>
                ))}
              </AccordionSection>
            ))}

            <TermsAndPrivacySection
              document={termsPrivacy.terms}
              anchorId="terms"
              isOpen={expanded.includes('terms')}
              onToggle={() => { setActiveSection('terms'); toggleExpand('terms'); }}
            />
            <TermsAndPrivacySection
              document={termsPrivacy.privacy}
              anchorId="privacy"
              isOpen={expanded.includes('privacy')}
              onToggle={() => { setActiveSection('privacy'); toggleExpand('privacy'); }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
