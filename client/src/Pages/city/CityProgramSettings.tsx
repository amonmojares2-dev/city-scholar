import { useEffect, useState } from 'react';
import Icon from '../../components/Icon';
import PageHeader from '../../components/PageHeader';
import ConfirmDialog from '../../components/ConfirmDialog';
import { api, ApiError } from '../../lib/api';
import type { EligibilityContent, GuidelinesContent, GuidelinesSection, HowToApplyContent } from '../../lib/publicContent';

// City-wide program settings: the single place the City Office decides which
// document slots a student fills, when the application and renewal windows are
// open, and what the public Eligibility / How to Apply / Guidelines pages say.
// The values live in MongoDB and are read by the student flows and by the
// public pages, so a save here changes the live site without a deploy.

interface DocSlot {
  key: string;
  label: string;
  note: string;
  required: boolean;
  enabled: boolean;
}

interface Period {
  enabled: boolean;
  openDate: string | null;
  closeDate: string | null;
  academicYear: string;
}

interface Eligibility {
  residencyYears: number;
  incomeThreshold: string;
  maximumAge: number;
  noOtherScholarship: boolean;
  accreditedSchool: boolean;
}

interface Disbursement {
  stipendAmount: number;
  frequency: string;
  paymentMethod: string;
  maxScholarsPerSemester: number;
  autoNotify: boolean;
}

interface ProgramSettings {
  applicationDocuments: DocSlot[];
  renewalDocuments: DocSlot[];
  eligibility: Eligibility;
  disbursement: Disbursement;
  applicationPeriod: Period;
  renewalPeriod: Period;
  updatedAt?: string | null;
}

interface SettingsOptions {
  incomeThresholds: string[];
  frequencies: string[];
  paymentMethods: string[];
}

interface PagesState {
  eligibility: EligibilityContent;
  howToApply: HowToApplyContent;
  guidelines: GuidelinesContent;
}

interface ProgramResponse {
  settings: ProgramSettings;
  defaults: ProgramSettings;
  options: SettingsOptions;
}

interface PagesResponse {
  pages: PagesState;
  defaults: PagesState;
}

const INCOME_LABELS: Record<string, string> = {
  'below-5000': 'Below ₱5,000',
  '5000-10000': '₱5,000 – ₱10,000',
  '10001-15000': '₱10,001 – ₱15,000',
  '15001-20000': '₱15,001 – ₱20,000',
};

const FREQUENCY_LABELS: Record<string, string> = {
  monthly: 'Monthly',
  'per-semester': 'Per semester',
  annual: 'Annual',
};

const METHOD_LABELS: Record<string, string> = {
  'cash-pickup': 'Cash pickup',
  'bank-transfer': 'Bank transfer',
  gcash: 'GCash',
};

const inputCls =
  'w-full rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm text-[#0B1F3A] focus:outline-none focus:ring-2 focus:ring-[#163A63] focus:border-[#163A63] transition';

// ISO timestamps come back from the server; <input type="date"> needs yyyy-mm-dd.
const toDateInput = (value: string | null | undefined) => (value ? String(value).slice(0, 10) : '');
const toLines = (items?: string[]) => (items || []).join('\n');
const fromLines = (value: string) => value.split('\n').map(line => line.trim()).filter(Boolean);

function Toggle({ checked, onChange, disabled }: { checked: boolean; onChange: (value: boolean) => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus:outline-none focus:ring-2 focus:ring-[#163A63] focus:ring-offset-1 disabled:opacity-50"
      style={{ backgroundColor: checked ? '#163A63' : '#D1D5DB' }}
    >
      <span
        className="pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200"
        style={{ transform: checked ? 'translateX(16px)' : 'translateX(0)' }}
      />
    </button>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-500 text-[#374151] mb-1" style={{ fontWeight: 500 }}>{label}</span>
      {children}
      {hint && <span className="block text-xs text-[#9CA3AF] mt-1">{hint}</span>}
    </label>
  );
}

function ToggleField({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4 py-1">
      <div>
        <div className="text-sm text-[#374151]">{label}</div>
        {hint && <div className="text-xs text-[#9CA3AF] mt-0.5">{hint}</div>}
      </div>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

function Section({ title, icon, description, children }: { title: string; icon: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="bg-white rounded-xl border border-[#E5E7EB] overflow-hidden">
      <div className="px-6 py-4 border-b border-[#E5E7EB] flex items-center gap-2.5" style={{ backgroundColor: '#F6F7F9' }}>
        <span className="text-[#163A63]"><Icon name={icon} size={18} /></span>
        <div>
          <h2 className="font-600 text-[#0B1F3A] text-base" style={{ fontWeight: 600 }}>{title}</h2>
          {description && <p className="text-xs text-[#6B7280] mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="p-6 space-y-4">{children}</div>
    </section>
  );
}

function SaveRow({ dirty, saving, notice, error, onSave, onRestore }: {
  dirty: boolean;
  saving: boolean;
  notice?: string;
  error: string;
  onSave: () => void;
  onRestore?: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      <button
        type="button"
        onClick={onSave}
        disabled={saving || !dirty}
        className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-sm text-white transition hover:opacity-90 active:scale-95 disabled:opacity-50"
        style={{ backgroundColor: '#0B1F3A', fontWeight: 600 }}
      >
        <Icon name="check" size={14} />
        {saving ? 'Saving…' : 'Save changes'}
      </button>
      {onRestore && (
        <button
          type="button"
          onClick={onRestore}
          disabled={saving || !dirty}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#E5E7EB] px-3 py-2 text-sm text-[#6B7280] hover:bg-[#F6F7F9] disabled:opacity-50"
        >
          <Icon name="refresh" size={14} />
          Discard changes
        </button>
      )}
      {notice && <span className="inline-flex items-center gap-1.5 text-sm text-[#15803D]"><Icon name="check-circle" size={14} />{notice}</span>}
      {!dirty && !saving && !notice && <span className="text-xs text-[#9CA3AF]">No unsaved changes</span>}
      {error && <span className="text-sm text-[#DC2626]">{error}</span>}
    </div>
  );
}

function MiniButton({ icon, label, onClick, disabled }: { icon: string; label: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className="inline-flex items-center justify-center w-8 h-8 rounded-lg border border-[#E5E7EB] text-[#6B7280] hover:bg-[#F6F7F9] hover:text-[#1F2937] disabled:opacity-40"
    >
      <Icon name={icon} size={14} />
    </button>
  );
}

function AddButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-[#CBD5E1] px-3 py-2 text-sm text-[#163A63] hover:bg-[#F6F7F9]"
      style={{ fontWeight: 600 }}
    >
      <Icon name="plus" size={14} />
      {label}
    </button>
  );
}

// Document slots. The stored `key` is what a student upload is matched against,
// so it stays fixed once a slot exists; only the wording around it is editable.
function DocumentsEditor({ slots, onChange }: { slots: DocSlot[]; onChange: (slots: DocSlot[]) => void }) {
  const [newKey, setNewKey] = useState('');

  const update = (index: number, patch: Partial<DocSlot>) =>
    onChange(slots.map((slot, position) => (position === index ? { ...slot, ...patch } : slot)));

  const remove = (index: number) => onChange(slots.filter((_, position) => position !== index));

  const move = (index: number, delta: number) => {
    const target = index + delta;
    if (target < 0 || target >= slots.length) return;
    const next = [...slots];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    onChange(next);
  };

  const add = () => {
    const key = newKey.trim();
    if (!key || slots.some(slot => slot.key === key)) return;
    onChange([...slots, { key, label: key, note: '', required: true, enabled: true }]);
    setNewKey('');
  };

  return (
    <div className="space-y-3">
      {slots.map((slot, index) => (
        <div key={slot.key} className={`rounded-xl border p-4 ${slot.enabled ? 'border-[#E5E7EB]' : 'border-dashed border-[#E5E7EB] bg-[#FAFAFB]'}`}>
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="text-sm font-600 text-[#0B1F3A]" style={{ fontWeight: 600 }}>{slot.label || slot.key}</div>
              <div className="text-xs text-[#9CA3AF]">Slot key: {slot.key}</div>
            </div>
            <div className="flex items-center gap-1.5">
              <MiniButton icon="arrow-up" label="Move up" onClick={() => move(index, -1)} disabled={index === 0} />
              <MiniButton icon="arrow-down" label="Move down" onClick={() => move(index, 1)} disabled={index === slots.length - 1} />
              <MiniButton icon="trash" label="Remove slot" onClick={() => remove(index)} disabled={slots.length <= 1} />
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Label shown to students">
              <input className={inputCls} value={slot.label} onChange={event => update(index, { label: event.target.value })} />
            </Field>
            <Field label="Note" hint="Optional guidance, e.g. “Must be dry sealed”.">
              <input className={inputCls} value={slot.note} onChange={event => update(index, { note: event.target.value })} />
            </Field>
          </div>
          <div className="mt-3 grid sm:grid-cols-2 gap-x-6">
            <ToggleField
              label="Required"
              hint="Students cannot submit without this upload."
              checked={slot.required}
              onChange={value => update(index, { required: value })}
            />
            <ToggleField
              label="Shown to students"
              hint="Turn off to hide the slot without losing its settings."
              checked={slot.enabled}
              onChange={value => update(index, { enabled: value })}
            />
          </div>
        </div>
      ))}

      <div className="flex flex-wrap items-end gap-3 pt-1">
        <div className="flex-1 min-w-[220px]">
          <Field label="New slot key" hint="Must match the document type exactly, e.g. “Certificate of Good Moral”.">
            <input className={inputCls} value={newKey} onChange={event => setNewKey(event.target.value)} placeholder="Document type" />
          </Field>
        </div>
        <AddButton label="Add slot" onClick={add} />
      </div>
    </div>
  );
}

// Opening and closing dates. An empty date means "no limit on that side", which
// the server stores as null.
function PeriodEditor({ heading, period, onChange }: { heading: string; period: Period; onChange: (period: Period) => void }) {
  return (
    <div className="rounded-xl border border-[#E5E7EB] p-4 space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="text-sm font-600 text-[#0B1F3A]" style={{ fontWeight: 600 }}>{heading}</div>
        <Toggle checked={period.enabled} onChange={value => onChange({ ...period, enabled: value })} />
      </div>
      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="Opens on" hint="Blank = open immediately">
          <input
            type="date"
            className={inputCls}
            value={toDateInput(period.openDate)}
            onChange={event => onChange({ ...period, openDate: event.target.value || null })}
          />
        </Field>
        <Field label="Closes on" hint="Blank = no closing date">
          <input
            type="date"
            className={inputCls}
            value={toDateInput(period.closeDate)}
            onChange={event => onChange({ ...period, closeDate: event.target.value || null })}
          />
        </Field>
        <Field label="Academic year label">
          <input className={inputCls} value={period.academicYear} onChange={event => onChange({ ...period, academicYear: event.target.value })} />
        </Field>
      </div>
      {!period.enabled && (
        <p className="text-xs text-[#B45309] bg-[#FEF3C7] border border-[#FDE68A] rounded-lg px-3 py-2">
          While this window is off, students cannot submit and the public pages show the window as closed.
        </p>
      )}
    </div>
  );
}

// Number inputs: an empty box keeps the previous value instead of writing NaN.
function numberFromInput(raw: string, fallback: number, min: number, max: number) {
  const parsed = Number(raw);
  if (raw === '' || !Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function EligibilityEditor({ value, options, onChange }: { value: Eligibility; options: string[]; onChange: (value: Eligibility) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Minimum years of residency in the city">
          <input
            type="number"
            min={0}
            max={60}
            className={inputCls}
            value={value.residencyYears}
            onChange={event => onChange({ ...value, residencyYears: numberFromInput(event.target.value, value.residencyYears, 0, 60) })}
          />
        </Field>
        <Field label="Maximum age of an applicant">
          <input
            type="number"
            min={15}
            max={99}
            className={inputCls}
            value={value.maximumAge}
            onChange={event => onChange({ ...value, maximumAge: numberFromInput(event.target.value, value.maximumAge, 15, 99) })}
          />
        </Field>
      </div>
      <Field label="Household income bracket">
        <select className={inputCls} value={value.incomeThreshold} onChange={event => onChange({ ...value, incomeThreshold: event.target.value })}>
          {(options.length ? options : Object.keys(INCOME_LABELS)).map(option => (
            <option key={option} value={option}>{INCOME_LABELS[option] || option}</option>
          ))}
        </select>
      </Field>
      <ToggleField
        label="Applicants must not hold another scholarship"
        hint="Duplicate government grants are a ground for cancellation."
        checked={value.noOtherScholarship}
        onChange={checked => onChange({ ...value, noOtherScholarship: checked })}
      />
      <ToggleField
        label="School must be accredited"
        hint="Only enrollees of accredited schools may apply."
        checked={value.accreditedSchool}
        onChange={checked => onChange({ ...value, accreditedSchool: checked })}
      />
    </div>
  );
}

function DisbursementEditor({ value, options, onChange }: { value: Disbursement; options: SettingsOptions; onChange: (value: Disbursement) => void }) {
  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Stipend amount per release (₱)">
          <input
            type="number"
            min={0}
            max={1000000}
            className={inputCls}
            value={value.stipendAmount}
            onChange={event => onChange({ ...value, stipendAmount: numberFromInput(event.target.value, value.stipendAmount, 0, 1000000) })}
          />
        </Field>
        <Field label="Release frequency">
          <select className={inputCls} value={value.frequency} onChange={event => onChange({ ...value, frequency: event.target.value })}>
            {(options.frequencies.length ? options.frequencies : Object.keys(FREQUENCY_LABELS)).map(option => (
              <option key={option} value={option}>{FREQUENCY_LABELS[option] || option}</option>
            ))}
          </select>
        </Field>
        <Field label="Payment method">
          <select className={inputCls} value={value.paymentMethod} onChange={event => onChange({ ...value, paymentMethod: event.target.value })}>
            {(options.paymentMethods.length ? options.paymentMethods : Object.keys(METHOD_LABELS)).map(option => (
              <option key={option} value={option}>{METHOD_LABELS[option] || option}</option>
            ))}
          </select>
        </Field>
        <Field label="Maximum scholars per semester">
          <input
            type="number"
            min={1}
            max={1000000}
            className={inputCls}
            value={value.maxScholarsPerSemester}
            onChange={event => onChange({ ...value, maxScholarsPerSemester: numberFromInput(event.target.value, value.maxScholarsPerSemester, 1, 1000000) })}
          />
        </Field>
      </div>
      <ToggleField
        label="Notify scholars about releases"
        hint="Sends an in-app notification when a release is recorded."
        checked={value.autoNotify}
        onChange={checked => onChange({ ...value, autoNotify: checked })}
      />
    </div>
  );
}

function TextRow({ label, hint, value, onChange, placeholder }: {
  label: string;
  hint?: string;
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  return (
    <Field label={label} hint={hint}>
      <input className={inputCls} value={value || ''} placeholder={placeholder} onChange={event => onChange(event.target.value)} />
    </Field>
  );
}

function TextAreaRow({ label, hint, value, onChange, rows = 3 }: {
  label: string;
  hint?: string;
  value?: string;
  onChange: (value: string) => void;
  rows?: number;
}) {
  return (
    <Field label={label} hint={hint}>
      <textarea className={inputCls} rows={rows} value={value || ''} onChange={event => onChange(event.target.value)} />
    </Field>
  );
}

// One line of text per row; used for category bullets and step tips.
function LinesRow({ label, hint, value, onChange, rows = 4 }: {
  label: string;
  hint?: string;
  value?: string[];
  onChange: (value: string[]) => void;
  rows?: number;
}) {
  return (
    <Field label={label} hint={hint}>
      <textarea className={inputCls} rows={rows} value={toLines(value)} onChange={event => onChange(fromLines(event.target.value))} />
    </Field>
  );
}

function ListActions({ index, total, onMove, onRemove, removeLabel }: {
  index: number;
  total: number;
  onMove: (index: number, delta: number) => void;
  onRemove: (index: number) => void;
  removeLabel: string;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <MiniButton icon="arrow-up" label="Move up" onClick={() => onMove(index, -1)} disabled={index === 0} />
      <MiniButton icon="arrow-down" label="Move down" onClick={() => onMove(index, 1)} disabled={index === total - 1} />
      <MiniButton icon="trash" label={removeLabel} onClick={() => onRemove(index)} disabled={total <= 1} />
    </div>
  );
}

function moveItem<T>(items: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (target < 0 || target >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(index, 1);
  next.splice(target, 0, item);
  return next;
}

function EligibilityContentEditor({ value, onChange }: { value: EligibilityContent; onChange: (value: EligibilityContent) => void }) {
  const categories = value.categories || [];
  const setCategories = (next: EligibilityContent['categories']) => onChange({ ...value, categories: next });

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <TextRow label="Eyebrow" value={value.eyebrow} onChange={eyebrow => onChange({ ...value, eyebrow })} />
        <TextRow label="Page title" value={value.title} onChange={title => onChange({ ...value, title })} />
      </div>
      <TextAreaRow label="Subtitle" value={value.subtitle} onChange={subtitle => onChange({ ...value, subtitle })} rows={2} />
      <div className="grid sm:grid-cols-2 gap-3">
        <TextRow label="Notice heading" value={value.noticeTitle} onChange={noticeTitle => onChange({ ...value, noticeTitle })} />
        <TextRow label="Call-to-action button label" value={value.ctaLabel} onChange={ctaLabel => onChange({ ...value, ctaLabel })} />
      </div>
      <TextAreaRow label="Notice text" value={value.noticeText} onChange={noticeText => onChange({ ...value, noticeText })} />
      <div className="grid sm:grid-cols-2 gap-3">
        <TextRow label="Bottom banner heading" value={value.ctaTitle} onChange={ctaTitle => onChange({ ...value, ctaTitle })} />
        <TextAreaRow label="Bottom banner text" value={value.ctaText} onChange={ctaText => onChange({ ...value, ctaText })} rows={2} />
      </div>

      <div className="pt-2">
        <div className="text-sm font-600 text-[#0B1F3A] mb-2" style={{ fontWeight: 600 }}>Requirement groups</div>
        <div className="space-y-3">
          {categories.map((category, index) => (
            <div key={category.id || index} className="rounded-xl border border-[#E5E7EB] p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <TextRow label="Group title" value={category.title} onChange={title => setCategories(categories.map((item, position) => (position === index ? { ...item, title } : item)))} />
                <div className="pt-6">
                  <ListActions
                    index={index}
                    total={categories.length}
                    onMove={(from, delta) => setCategories(moveItem(categories, from, delta))}
                    onRemove={removeIndex => setCategories(categories.filter((_, position) => position !== removeIndex))}
                    removeLabel="Remove group"
                  />
                </div>
              </div>
              <LinesRow
                label="Requirements (one per line)"
                value={category.items}
                onChange={items => setCategories(categories.map((item, position) => (position === index ? { ...item, items } : item)))}
                rows={4}
              />
            </div>
          ))}
        </div>
        <div className="pt-3">
          <AddButton
            label="Add requirement group"
            onClick={() => setCategories([...categories, { id: `group-${categories.length + 1}`, title: 'New group', items: [] }])}
          />
        </div>
      </div>
    </div>
  );
}

function HowToApplyContentEditor({ value, onChange }: { value: HowToApplyContent; onChange: (value: HowToApplyContent) => void }) {
  const steps = value.steps || [];
  const setSteps = (next: HowToApplyContent['steps']) => onChange({ ...value, steps: next });
  const update = (index: number, patch: Record<string, unknown>) =>
    setSteps(steps.map((step, position) => (position === index ? { ...step, ...patch } : step)));

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <TextRow label="Eyebrow" value={value.eyebrow} onChange={eyebrow => onChange({ ...value, eyebrow })} />
        <TextRow label="Page title" value={value.title} onChange={title => onChange({ ...value, title })} />
      </div>
      <TextAreaRow label="Subtitle" value={value.subtitle} onChange={subtitle => onChange({ ...value, subtitle })} rows={2} />

      <div className="pt-2">
        <div className="text-sm font-600 text-[#0B1F3A] mb-2" style={{ fontWeight: 600 }}>Steps</div>
        <div className="space-y-3">
          {steps.map((step, index) => (
            <div key={`${step.num || index}-${index}`} className="rounded-xl border border-[#E5E7EB] p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="grid sm:grid-cols-[90px_1fr] gap-3 flex-1">
                  <TextRow label="Step no." value={step.num} onChange={num => update(index, { num })} />
                  <TextRow label="Step title" value={step.title} onChange={title => update(index, { title })} />
                </div>
                <div className="pt-6">
                  <ListActions
                    index={index}
                    total={steps.length}
                    onMove={(from, delta) => setSteps(moveItem(steps, from, delta))}
                    onRemove={removeIndex => setSteps(steps.filter((_, position) => position !== removeIndex))}
                    removeLabel="Remove step"
                  />
                </div>
              </div>
              <TextAreaRow
                label="Description"
                value={step.description ?? step.desc}
                onChange={description => update(index, { description })}
              />
              <LinesRow label="Tips (one per line)" value={step.tips} onChange={tips => update(index, { tips })} />
              <div className="grid sm:grid-cols-2 gap-3">
                <TextRow label="Link" hint="Optional, e.g. /eligibility" value={step.link || ''} onChange={link => update(index, { link })} />
                <TextRow label="Link label" value={step.linkLabel || ''} onChange={linkLabel => update(index, { linkLabel })} />
              </div>
            </div>
          ))}
        </div>
        <div className="pt-3">
          <AddButton
            label="Add step"
            onClick={() => setSteps([...steps, {
              num: String(steps.length + 1).padStart(2, '0'),
              title: 'New step',
              description: '',
              tips: [],
              link: '',
              linkLabel: '',
            }])}
          />
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-3 pt-2">
        <TextRow label="Help card heading" value={value.helpTitle} onChange={helpTitle => onChange({ ...value, helpTitle })} />
        <TextRow label="Help card link label" value={value.helpLinkLabel} onChange={helpLinkLabel => onChange({ ...value, helpLinkLabel })} />
      </div>
      <TextAreaRow label="Help card text" value={value.helpText} onChange={helpText => onChange({ ...value, helpText })} rows={2} />
      <TextRow label="Get-started card heading" value={value.readyTitle} onChange={readyTitle => onChange({ ...value, readyTitle })} />
      <TextAreaRow label="Get-started card text" value={value.readyText} onChange={readyText => onChange({ ...value, readyText })} rows={2} />
    </div>
  );
}

function GuidelinesContentEditor({ value, onChange }: { value: GuidelinesContent; onChange: (value: GuidelinesContent) => void }) {
  const sections = value.sections || [];
  const setSections = (next: GuidelinesContent['sections']) => onChange({ ...value, sections: next });
  const updateSection = (index: number, patch: Partial<GuidelinesSection>) =>
    setSections(sections.map((section, position) => (position === index ? { ...section, ...patch } : section)));
  const updateEntry = (sectionIndex: number, entryIndex: number, patch: Partial<{ heading: string; text: string }>) =>
    setSections(sections.map((section, position) => {
      if (position !== sectionIndex) return section;
      return { ...section, content: section.content.map((entry, entryPosition) => (entryPosition === entryIndex ? { ...entry, ...patch } : entry)) };
    }));

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 gap-3">
        <TextRow label="Eyebrow" value={value.eyebrow} onChange={eyebrow => onChange({ ...value, eyebrow })} />
        <TextRow label="Page title" value={value.title} onChange={title => onChange({ ...value, title })} />
      </div>
      <TextAreaRow label="Subtitle" value={value.subtitle} onChange={subtitle => onChange({ ...value, subtitle })} rows={2} />

      <div className="pt-2">
        <div className="text-sm font-600 text-[#0B1F3A] mb-2" style={{ fontWeight: 600 }}>Sections</div>
        <div className="space-y-3">
          {sections.map((section, index) => (
            <div key={section.id || index} className="rounded-xl border border-[#E5E7EB] p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1">
                  <TextRow
                    label="Section title"
                    hint={`Anchor #${section.id}`}
                    value={section.title}
                    onChange={title => updateSection(index, { title })}
                  />
                </div>
                <div className="pt-6">
                  <ListActions
                    index={index}
                    total={sections.length}
                    onMove={(from, delta) => setSections(moveItem(sections, from, delta))}
                    onRemove={removeIndex => setSections(sections.filter((_, position) => position !== removeIndex))}
                    removeLabel="Remove section"
                  />
                </div>
              </div>

              <div className="space-y-2">
                {(section.content || []).map((entry, entryIndex) => (
                  <div key={`${section.id}-${entryIndex}`} className="rounded-lg border border-[#EEF0F3] bg-[#FAFAFB] p-3 space-y-2">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 grid sm:grid-cols-2 gap-3">
                        <TextRow
                          label="Entry heading"
                          value={entry.heading}
                          onChange={heading => updateEntry(index, entryIndex, { heading })}
                        />
                        <TextRow
                          label="Entry text"
                          value={entry.text}
                          onChange={text => updateEntry(index, entryIndex, { text })}
                        />
                      </div>
                      <div className="pt-6">
                        <MiniButton
                          icon="trash"
                          label="Remove entry"
                          disabled={section.content.length <= 1}
                          onClick={() => updateSection(index, { content: section.content.filter((_, position) => position !== entryIndex) })}
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <AddButton
                label="Add entry"
                onClick={() => updateSection(index, { content: [...(section.content || []), { heading: 'New entry', text: '' }] })}
              />
            </div>
          ))}
        </div>
        <div className="pt-3">
          <AddButton
            label="Add section"
            onClick={() => setSections([...sections, {
              id: `section-${sections.length + 1}`,
              title: 'New section',
              content: [{ heading: 'New entry', text: '' }],
            }])}
          />
        </div>
      </div>
    </div>
  );
}

const TABS = [
  { id: 'documents', label: 'Document slots', icon: 'file-text', group: 'program' },
  { id: 'windows', label: 'Application windows', icon: 'calendar', group: 'program' },
  { id: 'rules', label: 'Eligibility & disbursement', icon: 'award', group: 'program' },
  { id: 'eligibility-page', label: 'Eligibility page', icon: 'eye', group: 'pages' },
  { id: 'apply-page', label: 'How to Apply page', icon: 'book', group: 'pages' },
  { id: 'guidelines-page', label: 'Guidelines page', icon: 'clipboard', group: 'pages' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const PREVIEWS: Partial<Record<TabId, string>> = {
  'eligibility-page': '/eligibility',
  'apply-page': '/how-to-apply',
  'guidelines-page': '/guidelines',
};

function PreviewLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1.5 text-sm text-[#163A63] hover:underline"
    >
      <Icon name="external-link" size={14} />
      Open the public page
    </a>
  );
}

interface PanelProps {
  dirty: boolean;
  saving: boolean;
  error: string;
  notice: string;
  onSave: () => void;
  onRestore: () => void;
}

function ProgramPanel({ tab, draft, options, onEdit, ...panel }: { tab: TabId; draft: ProgramSettings; options: SettingsOptions; onEdit: (next: ProgramSettings) => void } & PanelProps) {
  if (tab === 'documents') {
    return (
      <div className="space-y-5">
        <Section
          title="Application documents"
          icon="file-text"
          description="Slots a student fills in when filing a new application."
        >
          <DocumentsEditor slots={draft.applicationDocuments} onChange={applicationDocuments => onEdit({ ...draft, applicationDocuments })} />
        </Section>
        <Section
          title="Renewal documents"
          icon="refresh"
          description="Slots a continuing scholar fills in when renewing."
        >
          <DocumentsEditor slots={draft.renewalDocuments} onChange={renewalDocuments => onEdit({ ...draft, renewalDocuments })} />
        </Section>
        <SaveRow {...panel} />
      </div>
    );
  }

  if (tab === 'windows') {
    return (
      <div className="space-y-5">
        <Section
          title="Filing windows"
          icon="calendar"
          description="Outside an open window the student portal blocks submissions and the public pages show the window as closed."
        >
          <PeriodEditor
            heading="Application window"
            period={draft.applicationPeriod}
            onChange={applicationPeriod => onEdit({ ...draft, applicationPeriod })}
          />
          <PeriodEditor
            heading="Renewal window"
            period={draft.renewalPeriod}
            onChange={renewalPeriod => onEdit({ ...draft, renewalPeriod })}
          />
        </Section>
        <SaveRow {...panel} />
      </div>
    );
  }

  if (tab === 'rules') {
    return (
      <div className="space-y-5">
        <Section
          title="Eligibility rules"
          icon="award"
          description="Screening thresholds applied when staff review an application."
        >
          <EligibilityEditor
            value={draft.eligibility}
            options={options.incomeThresholds}
            onChange={eligibility => onEdit({ ...draft, eligibility })}
          />
        </Section>
        <Section
          title="Disbursement"
          icon="bar-chart-2"
          description="How much is released, how often, and to how many scholars."
        >
          <DisbursementEditor
            value={draft.disbursement}
            options={options}
            onChange={disbursement => onEdit({ ...draft, disbursement })}
          />
        </Section>
        <SaveRow {...panel} />
      </div>
    );
  }

  return null;
}

function PagesPanel({ tab, draft, onEdit, ...panel }: { tab: TabId; draft: PagesState; onEdit: (next: PagesState) => void } & PanelProps) {
  const preview = PREVIEWS[tab];

  const body = (() => {
    if (tab === 'eligibility-page') {
      return (
        <Section
          title="Eligibility page copy"
          icon="eye"
          description="What residents read before deciding whether to file."
        >
          <EligibilityContentEditor value={draft.eligibility} onChange={eligibility => onEdit({ ...draft, eligibility })} />
        </Section>
      );
    }
    if (tab === 'apply-page') {
      return (
        <Section
          title="How to Apply page copy"
          icon="book"
          description="The walkthrough shown to applicants and part of the public site."
        >
          <HowToApplyContentEditor value={draft.howToApply} onChange={howToApply => onEdit({ ...draft, howToApply })} />
        </Section>
      );
    }
    if (tab === 'guidelines-page') {
      return (
        <Section
          title="Guidelines page copy"
          icon="clipboard"
          description="The rules, obligations and sanctions published for scholars."
        >
          <GuidelinesContentEditor value={draft.guidelines} onChange={guidelines => onEdit({ ...draft, guidelines })} />
        </Section>
      );
    }
    return null;
  })();

  if (!body) return null;

  return (
    <div className="space-y-5">
      {body}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <SaveRow {...panel} />
        {preview && <PreviewLink href={preview} />}
      </div>
    </div>
  );
}

const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value)) as T;

const stamp = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
};

// Field-level validation from the server is reported in `errors`; surface the
// first few so the City Office knows which box to fix.
const describeError = (error: unknown, fallback: string) => {
  if (error instanceof ApiError) {
    const details = Object.values(error.errors || {}).filter(Boolean);
    return details.length ? `${error.message} ${details.slice(0, 3).join(' ')}` : error.message;
  }
  return error instanceof Error ? error.message : fallback;
};

export default function CityProgramSettings() {
  const [tab, setTab] = useState<TabId>('documents');
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // `program` / `pages` are the saved baseline; the drafts are what the form edits.
  const [program, setProgram] = useState<ProgramSettings | null>(null);
  const [programDraft, setProgramDraft] = useState<ProgramSettings | null>(null);
  const [options, setOptions] = useState<SettingsOptions>({ incomeThresholds: [], frequencies: [], paymentMethods: [] });
  const [pages, setPages] = useState<PagesState | null>(null);
  const [pagesDraft, setPagesDraft] = useState<PagesState | null>(null);

  const [programStatus, setProgramStatus] = useState({ saving: false, error: '', notice: '' });
  const [pagesStatus, setPagesStatus] = useState({ saving: false, error: '', notice: '' });
  const [confirming, setConfirming] = useState<'program' | 'pages' | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      api<ProgramResponse>('/city/settings/program'),
      api<PagesResponse>('/city/settings/public-pages'),
    ])
      .then(([programResult, pagesResult]) => {
        if (cancelled) return;
        setProgram(programResult.settings);
        setProgramDraft(clone(programResult.settings));
        setOptions(programResult.options || { incomeThresholds: [], frequencies: [], paymentMethods: [] });
        setPages(pagesResult.pages);
        setPagesDraft(clone(pagesResult.pages));
      })
      .catch(error => { if (!cancelled) setLoadError(describeError(error, 'Unable to load the city settings.')); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const programDirty = !!(program && programDraft && JSON.stringify(program) !== JSON.stringify(programDraft));
  const pagesDirty = !!(pages && pagesDraft && JSON.stringify(pages) !== JSON.stringify(pagesDraft));

  const editProgram = (next: ProgramSettings) => {
    setProgramDraft(next);
    setProgramStatus(status => (status.error || status.notice ? { ...status, error: '', notice: '' } : status));
  };

  const editPages = (next: PagesState) => {
    setPagesDraft(next);
    setPagesStatus(status => (status.error || status.notice ? { ...status, error: '', notice: '' } : status));
  };

  const saveProgram = async () => {
    if (!programDraft) return;
    setProgramStatus({ saving: true, error: '', notice: '' });
    try {
      const result = await api<{ settings: ProgramSettings; message?: string }>('/city/settings/program', {
        method: 'PUT',
        body: JSON.stringify(programDraft),
      });
      setProgram(result.settings);
      setProgramDraft(clone(result.settings));
      setProgramStatus({ saving: false, error: '', notice: result.message || 'Program settings saved.' });
    } catch (error) {
      setProgramStatus({ saving: false, error: describeError(error, 'Unable to save the program settings.'), notice: '' });
    }
  };

  const savePages = async () => {
    if (!pagesDraft) return;
    setPagesStatus({ saving: true, error: '', notice: '' });
    try {
      const result = await api<{ pages: PagesState; message?: string }>('/city/settings/public-pages', {
        method: 'PUT',
        body: JSON.stringify(pagesDraft),
      });
      setPages(result.pages);
      setPagesDraft(clone(result.pages));
      setPagesStatus({ saving: false, error: '', notice: result.message || 'Public page content saved.' });
    } catch (error) {
      setPagesStatus({ saving: false, error: describeError(error, 'Unable to save the page content.'), notice: '' });
    }
  };

  const restoreDefaults = async () => {
    const group = confirming;
    if (!group) return;
    setRestoring(true);
    try {
      if (group === 'program') {
        const result = await api<{ settings: ProgramSettings; message?: string }>('/city/settings/program/restore-defaults', { method: 'POST' });
        setProgram(result.settings);
        setProgramDraft(clone(result.settings));
        setProgramStatus({ saving: false, error: '', notice: result.message || 'Program settings restored to the shipped defaults.' });
      } else {
        const result = await api<{ pages: PagesState; message?: string }>('/city/settings/public-pages/restore-defaults', { method: 'POST' });
        setPages(result.pages);
        setPagesDraft(clone(result.pages));
        setPagesStatus({ saving: false, error: '', notice: result.message || 'Page content restored to the shipped copy.' });
      }
    } catch (error) {
      const message = describeError(error, 'Unable to restore the shipped defaults.');
      if (group === 'program') setProgramStatus({ saving: false, error: message, notice: '' });
      else setPagesStatus({ saving: false, error: message, notice: '' });
    } finally {
      setRestoring(false);
      setConfirming(null);
    }
  };

  if (loading) {
    return <div className="py-16 text-center text-sm text-[#6B7280]">Loading city settings...</div>;
  }

  if (loadError || !program || !programDraft || !pages || !pagesDraft) {
    return (
      <div>
        <PageHeader title="Program Settings" subtitle="City-wide scholarship configuration" breadcrumb={['City Office', 'Program Settings']} />
        <div className="bg-red-50 rounded-xl p-4 text-sm text-red-700">
          {loadError || 'The city settings could not be loaded. Please refresh the page.'}
        </div>
      </div>
    );
  }

  const activeGroup = (TABS.find(item => item.id === tab) || TABS[0]).group;
  const lastSaved = activeGroup === 'program' ? stamp(program.updatedAt) : '';

  const tabRow = (group: 'program' | 'pages') => {
    const unsaved = group === 'program' ? programDirty : pagesDirty;
    return (
      <div className="flex flex-wrap gap-2">
        {TABS.filter(item => item.group === group).map(item => {
          const active = item.id === tab;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`inline-flex items-center gap-2 rounded-xl px-3.5 py-2 text-sm transition ${
                active ? 'bg-[#163A63] text-white' : 'bg-white border border-[#E5E7EB] text-[#374151] hover:bg-[#F6F7F9]'
              }`}
              style={{ fontWeight: 600 }}
            >
              <Icon name={item.icon} size={15} />
              {item.label}
              {unsaved && <span className="inline-block h-1.5 w-1.5 rounded-full bg-[#F59E0B]" />}
            </button>
          );
        })}
      </div>
    );
  };

  return (
    <div>
      <PageHeader
        title="Program Settings"
        subtitle="City-wide program rules and the copy shown on the public pages"
        breadcrumb={['City Office', 'Program Settings']}
        action={
          <button
            type="button"
            onClick={() => setConfirming(activeGroup)}
            disabled={restoring}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E7EB] bg-white px-3.5 py-2 text-sm text-[#6B7280] hover:bg-[#F6F7F9] disabled:opacity-50"
          >
            <Icon name="refresh" size={14} />
            Restore shipped defaults
          </button>
        }
      />

      {lastSaved && <p className="-mt-4 mb-4 text-xs text-[#9CA3AF]">Last saved {lastSaved}</p>}

      <div className="mb-5 space-y-4">
        <div>
          <div className="mb-2 text-xs uppercase tracking-wide text-[#9CA3AF]">Program configuration</div>
          {tabRow('program')}
        </div>
        <div>
          <div className="mb-2 text-xs uppercase tracking-wide text-[#9CA3AF]">Public pages</div>
          {tabRow('pages')}
        </div>
      </div>

      {activeGroup === 'program' ? (
        <ProgramPanel
          tab={tab}
          draft={programDraft}
          options={options}
          onEdit={editProgram}
          dirty={programDirty}
          saving={programStatus.saving}
          error={programStatus.error}
          notice={programStatus.notice}
          onSave={saveProgram}
          onRestore={() => setProgramDraft(clone(program))}
        />
      ) : (
        <PagesPanel
          tab={tab}
          draft={pagesDraft}
          onEdit={editPages}
          dirty={pagesDirty}
          saving={pagesStatus.saving}
          error={pagesStatus.error}
          notice={pagesStatus.notice}
          onSave={savePages}
          onRestore={() => setPagesDraft(clone(pages))}
        />
      )}

      <p className="mt-6 text-xs text-[#9CA3AF]">
        Students see the document slots and filing windows as soon as you save, and the public pages pick up the new copy on their next load.
      </p>

      <ConfirmDialog
        open={confirming !== null}
        title={confirming === 'program' ? 'Restore program settings?' : 'Restore page content?'}
        message={
          confirming === 'program'
            ? 'Document slots, filing windows, eligibility rules and disbursement go back to the values shipped with the system. Anything saved here is overwritten.'
            : 'The Eligibility, How to Apply and Guidelines pages go back to the copy shipped with the system. Anything saved here is overwritten.'
        }
        confirmLabel="Restore defaults"
        danger
        loading={restoring}
        onCancel={() => { if (!restoring) setConfirming(null); }}
        onConfirm={restoreDefaults}
      />
    </div>
  );
}










