import { useEffect, useState } from 'react';
import { API_URL } from './api';

// Public content comes from the City Office: the editable page copy lives in
// MongoDB (utils/publicPageContent.js) and the document slots / application
// windows live in the city program settings (utils/cityProgramSettings.js).
// GET /api/public/content serves both without a sign-in, and every field is
// optional, so each page keeps its shipped copy as the fallback when the
// request fails or a section was never edited.

export interface DocumentSlot {
  key: string;
  label: string;
  note?: string;
  required?: boolean;
}

export interface PeriodInfo {
  enabled?: boolean;
  openDate?: string | null;
  closeDate?: string | null;
  academicYear?: string;
}

export interface PeriodState extends PeriodInfo {
  open: boolean;
  reason: 'disabled' | 'not-open-yet' | 'closed' | 'within-window' | 'always';
}

export interface ProgramView {
  applicationDocuments: DocumentSlot[];
  renewalDocuments: DocumentSlot[];
  applicationPeriod?: PeriodInfo;
  renewalPeriod?: PeriodInfo;
  applicationWindow?: PeriodState;
  renewalWindow?: PeriodState;
}

export interface EligibilityContent {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  noticeTitle?: string;
  noticeText?: string;
  ctaTitle?: string;
  ctaText?: string;
  ctaLabel?: string;
  categories?: { id?: string; title: string; items: string[] }[];
}

export interface HowToApplyStep {
  num?: string;
  title: string;
  /** Server shape uses `description`; the shipped copy used `desc`. */
  description?: string;
  desc?: string;
  tips?: string[];
  link?: string | null;
  linkLabel?: string | null;
}

export interface HowToApplyContent {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  helpTitle?: string;
  helpText?: string;
  helpLinkLabel?: string;
  readyTitle?: string;
  readyText?: string;
  steps?: HowToApplyStep[];
}

export interface GuidelinesSection {
  id: string;
  title: string;
  content: { heading: string; text: string }[];
}

export interface GuidelinesContent {
  eyebrow?: string;
  title?: string;
  subtitle?: string;
  sections?: GuidelinesSection[];
}

export interface PublicPages {
  eligibility?: EligibilityContent;
  howToApply?: HowToApplyContent;
  guidelines?: GuidelinesContent;
}

interface PublicContentResponse {
  pages?: PublicPages;
  program?: ProgramView;
}

export interface PublicContentState {
  pages: PublicPages;
  program: ProgramView | null;
  loading: boolean;
  error: string;
  reload: () => void;
}

// One request per page load, shared by every public page that reads the hook.
let pending: Promise<PublicContentResponse> | null = null;

export function loadPublicContent(force = false): Promise<PublicContentResponse> {
  if (force) pending = null;
  if (!pending) {
    pending = fetch(`${API_URL}/public/content`)
      .then(async response => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body?.message || 'Public content is unavailable.');
        return body as PublicContentResponse;
      })
      .catch(error => {
        // Let the next mount retry instead of caching the failure forever.
        pending = null;
        throw error instanceof Error ? error : new Error('Public content is unavailable.');
      });
  }
  return pending;
}

export function usePublicContent(): PublicContentState {
  const [pages, setPages] = useState<PublicPages>({});
  const [program, setProgram] = useState<ProgramView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    loadPublicContent(attempt > 0)
      .then(result => {
        if (cancelled) return;
        setPages(result.pages || {});
        setProgram(result.program || null);
        setError('');
      })
      .catch(err => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Public content is unavailable.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [attempt]);

  return { pages, program, loading, error, reload: () => setAttempt(count => count + 1) };
}

// Document slots the student must fill, straight from the City Office settings.
export function useDocumentSlots(kind: 'application' | 'renewal' = 'application'): DocumentSlot[] {
  const { program } = usePublicContent();
  if (!program) return [];
  return kind === 'renewal' ? program.renewalDocuments || [] : program.applicationDocuments || [];
}
