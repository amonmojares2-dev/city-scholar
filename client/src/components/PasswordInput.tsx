import { forwardRef, useState } from 'react';
import Icon from './Icon';

export interface PasswordInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

const PasswordInput = forwardRef<HTMLInputElement, PasswordInputProps>(function PasswordInput(
  { label, error, className = '', id, ...props },
  ref,
) {
  const [visible, setVisible] = useState(false);
  const inputId = id || props.name;

  return (
    <div>
      {label && <label htmlFor={inputId} className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>{label}</label>}
      <div className="relative">
        <input
          {...props}
          ref={ref}
          id={inputId}
          type={visible ? 'text' : 'password'}
          className={`w-full px-3.5 py-2.5 pr-11 rounded-xl border text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63] ${error ? 'border-[#DC2626]' : 'border-[#E5E7EB]'} ${className} [&::-ms-reveal]:hidden`}
          aria-invalid={Boolean(error)}
          aria-describedby={error && inputId ? `${inputId}-error` : undefined}
        />
        <button
          type="button"
          aria-label={visible ? 'Hide password' : 'Show password'}
          aria-pressed={visible}
          onClick={() => setVisible(current => !current)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#1F2937] focus:outline-none focus:ring-2 focus:ring-[#163A63]/30 rounded"
        >
          <Icon name={visible ? 'eye-off' : 'eye'} size={16} />
        </button>
      </div>
      {error && <p id={inputId ? `${inputId}-error` : undefined} className="text-xs text-[#DC2626] mt-1">{error}</p>}
    </div>
  );
});

export default PasswordInput;
