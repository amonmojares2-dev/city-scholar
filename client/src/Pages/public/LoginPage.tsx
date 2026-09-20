import { useState, useRef, useEffect } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import Icon from '../../components/Icon';
import { api } from '../../lib/api';
import { portalForRole, saveSession, type SessionUser } from '../../lib/auth';
import { SCHOOLS } from '../../data/schools';
import { BARANGAYS } from '../../data/barangays';

type Tab = 'login' | 'register' | 'forgot';

export default function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [tab, setTab] = useState<Tab>(() => searchParams.get('tab') === 'register' ? 'register' : 'login');
  const [registerRole, setRegisterRole] = useState<'student' | 'barangay' | 'city'>('student');
  // Account Type (students only): new applicants start with the applicant
  // portal, existing scholars continue through Renewal once the City Office
  // confirms their registration.
  const [scholarType, setScholarType] = useState<'new_applicant' | 'existing_scholar'>('new_applicant');
  const [showPass, setShowPass] = useState(false);
  const [otpStep, setOtpStep] = useState(false);
  const [otp, setOtp] = useState(['', '', '', '', '', '']);
  const [otpError, setOtpError] = useState('');
  const [otpLoading, setOtpLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [otpTimer, setOtpTimer] = useState(30);  // 30-second countdown (registration / forgot only)
  // LOGIN OTP: no expiry. 6 wrong entries -> block input for 30s -> must request NEW code.
  const [otpBlocked, setOtpBlocked] = useState(false);
  const [blockCountdown, setBlockCountdown] = useState(0);
  const [attemptsRemaining, setAttemptsRemaining] = useState(6);
  const [mustResend, setMustResend] = useState(false);
  const [challengeId, setChallengeId] = useState('');
  const [maskedEmail, setMaskedEmail] = useState('');
  const [otpPurpose, setOtpPurpose] = useState<'login' | 'registration' | 'password_reset'>('login');
  const [formError, setFormError] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [barangays, setBarangays] = useState<{ _id: string; name: string }[]>(() => BARANGAYS.map(name => ({ _id: name, name })));
  const [selectedSchool, setSelectedSchool] = useState('');
  // Roles are never chosen on the sign-in form — the server identifies the
  // account's role from MongoDB and the client routes to that role's portal.
  // needsPasswordSetup covers accounts with no password yet (e.g. a newly
  // provisioned Super Admin) or flagged mustChangePassword: they must create
  // a new password before continuing to OTP verification.
  const [needsPasswordSetup, setNeedsPasswordSetup] = useState(false);
  const otpRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const t = setTimeout(() => setResendCooldown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [resendCooldown]);

  // 30-second OTP countdown timer (registration / forgot-password only).
  // Login OTP does NOT expire — so freeze the timer for login purpose.
  useEffect(() => {
    if (!otpStep || otpPurpose === 'login' || otpTimer <= 0) return;
    const timer = setTimeout(() => setOtpTimer(t => t - 1), 1000);
    return () => clearTimeout(timer);
  }, [otpStep, otpPurpose, otpTimer]);

  // Login: 6 wrong attempts -> block OTP entry for 30s, count down, then
  // require the user to request a NEW code.
  useEffect(() => {
    if (!otpBlocked) return;
    if (blockCountdown <= 0) {
      setMustResend(true);
      return;
    }
    const t = setTimeout(() => setBlockCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [otpBlocked, blockCountdown]);

  useEffect(() => {
    api<{ barangays: { _id: string; name: string }[] }>('/barangays').then(result => {
      if (result.barangays?.length) setBarangays(result.barangays);
    }).catch(() => undefined);
  }, []);

  const resetLoginOtpState = () => {
    setOtp(['', '', '', '', '', '']);
    setOtpError('');
    setOtpBlocked(false);
    setBlockCountdown(0);
    setAttemptsRemaining(6);
    setMustResend(false);
  };

  const handleLogin = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);
    const fields = new FormData(e.currentTarget);
    try {
      const result = await api<{ challengeId: string; email: string; requiresPasswordSetup?: boolean }>('/auth/login', {
        method: 'POST', body: JSON.stringify({ email: fields.get('email'), password: fields.get('password') }),
      });
      setChallengeId(result.challengeId);
      setMaskedEmail(result.email);

      // First sign-in (or forced change): create a password before the OTP step.
      if (result.requiresPasswordSetup) {
        setNeedsPasswordSetup(true);
        return;
      }

      setOtpPurpose('login');
      resetLoginOtpState();
      setResendCooldown(30);
      setOtpStep(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to sign in.');
    } finally { setFormLoading(false); }
  };

  const handleRegister = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);
    const fields = new FormData(e.currentTarget);
    const roleMap = { student: 'student', barangay: 'barangay_staff', city: 'city_admin' } as const;
    const schoolField = e.currentTarget.elements.namedItem('school') as HTMLSelectElement | null;
    const school = schoolField?.value || selectedSchool;
    if (registerRole === 'student' && !school) {
      setFormError('Please select your school or university.');
      setFormLoading(false);
      return;
    }
    // Existing scholars must claim the Scholar ID the City Office has on
    // file — it is what gets verified on the Scholar Approval page.
    const scholarIdField = e.currentTarget.elements.namedItem('scholarId') as HTMLInputElement | null;
    const scholarId = (scholarIdField?.value || '').trim().toUpperCase();
    if (registerRole === 'student' && scholarType === 'existing_scholar' && !/^SCH-\d{4}-\d{4}$/.test(scholarId)) {
      setFormError('Enter the Scholar ID on file with the City Office (e.g. SCH-2024-0182).');
      setFormLoading(false);
      return;
    }
    try {
      const result = await api<{ challengeId: string; email: string }>('/auth/register', {
        method: 'POST', body: JSON.stringify({
          firstName: fields.get('firstName'),
          lastName: fields.get('lastName'),
          email: fields.get('email'),
          password: fields.get('password'),
          confirmPassword: fields.get('confirmPassword'),
          role: roleMap[registerRole],
          scholarType: registerRole === 'student' ? scholarType : undefined,
          scholarId: registerRole === 'student' && scholarType === 'existing_scholar' ? scholarId : undefined,
          barangay: fields.get('barangay'),
          school,
          employeeNumber: fields.get('employeeNumber'),
        }),
      });
      setChallengeId(result.challengeId);
      setMaskedEmail(result.email);
      setOtpPurpose('registration');
      resetLoginOtpState();
      setOtpTimer(30);
      setResendCooldown(30);
      setOtpStep(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to create account.');
    } finally { setFormLoading(false); }
  };

  const handleForgotPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);
    const fields = new FormData(e.currentTarget);
    try {
      const result = await api<{ challengeId: string; email: string }>('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({
          email: fields.get('email'),
          password: fields.get('password'),
          confirmPassword: fields.get('confirmPassword'),
        }),
      });
      setChallengeId(result.challengeId);
      setMaskedEmail(result.email);
      setOtpPurpose('password_reset');
      resetLoginOtpState();
      setOtpTimer(30);
      setResendCooldown(30);
      setOtpStep(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to send the reset code.');
    } finally {
      setFormLoading(false);
    }
  };

  // ------------------------------------------------------------------
  // Password setup (any role — e.g. a provisioned Super Admin, or an
  // account flagged for a password change). Completes the staged
  // /auth/login challenge, then continues to OTP verification.
  // ------------------------------------------------------------------
  const handleSetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setFormError('');
    setFormLoading(true);
    const fields = new FormData(e.currentTarget);
    try {
      const result = await api<{ challengeId: string; email: string }>('/auth/set-password', {
        method: 'POST',
        body: JSON.stringify({
          challengeId,
          newPassword: fields.get('newPassword'),
          confirmNewPassword: fields.get('confirmNewPassword'),
        }),
      });
      setChallengeId(result.challengeId);
      setMaskedEmail(result.email);
      setNeedsPasswordSetup(false);
      setOtpPurpose('login');
      resetLoginOtpState();
      setResendCooldown(30);
      setOtpStep(true);
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Unable to set your new password.');
    } finally {
      setFormLoading(false);
    }
  };

  const handleOtpChange = (i: number, val: string) => {
    if (otpPurpose === 'login' && (otpBlocked || mustResend)) return;
    const digit = val.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[i] = digit;
    setOtp(next);
    setOtpError('');
    if (digit && i < 5) otpRefs.current[i + 1]?.focus();
  };

  const handleOtpKeyDown = (i: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !otp[i] && i > 0) otpRefs.current[i - 1]?.focus();
  };

  const handleOtpPaste = (e: React.ClipboardEvent) => {
    if (otpPurpose === 'login' && (otpBlocked || mustResend)) return;
    e.preventDefault();
    const digits = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6).split('');
    const next = ['', '', '', '', '', ''];
    digits.forEach((d, i) => { next[i] = d; });
    setOtp(next);
    const focusIdx = Math.min(digits.length, 5);
    otpRefs.current[focusIdx]?.focus();
  };

  // LOGIN OTP: 6 attempts -> block entry for 30s -> must request NEW code.
  // No "verification code expired" for login.
  const handleOtpSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (otpPurpose === 'login') {
      if (otpBlocked && blockCountdown > 0) {
        setOtpError(`Too many incorrect attempts. OTP entry is blocked for ${blockCountdown}s.`);
        return;
      }
      if (mustResend) {
        setOtpError('Please request a new code and enter the new OTP.');
        return;
      }
    }
    const code = otp.join('');
    if (code.length < 6) { setOtpError('Please enter all 6 digits.'); return; }
    if (!challengeId) { setOtpError('Your verification request has expired. Please start again.'); return; }
    setOtpLoading(true);
    setOtpError('');
    try {
      const result = await api<{
        token?: string; user?: SessionUser; registered?: boolean; passwordReset?: boolean;
        blocked?: boolean; mustResend?: boolean; remainingSeconds?: number; attemptsRemaining?: number;
      }>('/auth/verify-otp', {
        method: 'POST',
        body: JSON.stringify({ challengeId, otp: code }),
      });
      if (typeof result.attemptsRemaining === 'number') setAttemptsRemaining(result.attemptsRemaining);

      if (result.registered) {
        setOtpStep(false);
        setChallengeId('');
        setTab('login');
        setFormError('Account verified. You can now sign in with your email and password.');
        return;
      }

      if (result.passwordReset) {
        setOtpStep(false);
        setChallengeId('');
        setTab('login');
        setFormError('Password reset successfully. You can now sign in with your new password.');
        return;
      }

      if (!result.token || !result.user) throw new Error('Verification succeeded, but no sign-in session was returned.');
      // Role-agnostic: the server resolved the account's role from MongoDB —
      // route straight to that role's portal. There is no client-side role choice.
      const userPortal = portalForRole(result.user.role);
      saveSession(result.token, result.user);
      navigate(`/${userPortal}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unable to verify the code.';
      setOtpError(msg);
      // 6th wrong login attempt -> block OTP entry for 30s.
      if (otpPurpose === 'login' && /blocked for 30s|blocked for \d+s|temporarily blocked|Too many incorrect/i.test(msg)) {
        const m = msg.match(/(\d+)s/);
        const secs = m ? parseInt(m[1], 10) : 30;
        setOtpBlocked(true);
        setBlockCountdown(secs);
        setAttemptsRemaining(0);
      } else if (otpPurpose === 'login' && /attempt\(s\) remaining/i.test(msg)) {
        const m = msg.match(/(\d+) attempt/);
        if (m) setAttemptsRemaining(parseInt(m[1], 10));
      } else if (otpPurpose === 'login' && /request a new code/i.test(msg)) {
        setMustResend(true);
        setAttemptsRemaining(0);
      }
      setOtp(['', '', '', '', '', '']);
      otpRefs.current[0]?.focus();
    } finally {
      setOtpLoading(false);
    }
  };

  const handleResend = async () => {
    if (!challengeId) return;
    // While blocked, resend is only allowed AFTER the 30s timer ends.
    if (otpPurpose === 'login' && otpBlocked && blockCountdown > 0) {
      setOtpError(`OTP entry is blocked. Please wait ${blockCountdown}s for the timer to end before requesting a new code.`);
      return;
    }
    // After the block timer ends (6 attempts used), user must request a new code.
    // Otherwise (normal cooldown) still enforce the 30s resend timer.
    if (otpPurpose !== 'login' || !mustResend) {
      if (resendCooldown > 0) {
        setOtpError(`Please wait ${resendCooldown}s for the timer to end before requesting a new code.`);
        return;
      }
    }
    setOtpLoading(true);
    setOtpError('');
    try {
      const result = await api<{ challengeId: string; email: string }>('/auth/resend-otp', {
        method: 'POST',
        body: JSON.stringify({ challengeId }),
      });
      setChallengeId(result.challengeId);
      setMaskedEmail(result.email);
      resetLoginOtpState();
      setOtpTimer(30);
      setResendCooldown(30);
      otpRefs.current[0]?.focus();
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unable to resend the code.';
      setOtpError(msg);
      // Server says still blocked -> sync the 30s block timer locally.
      const m = msg.match(/(\d+)s/);
      if (otpPurpose === 'login' && /blocked/i.test(msg)) {
        setOtpBlocked(true);
        setBlockCountdown(m ? parseInt(m[1], 10) : 30);
      }
    } finally {
      setOtpLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F6F7F9] flex" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
      {/* Left panel */}
      <div className="hidden lg:flex flex-col w-[480px] flex-shrink-0 bg-[#0B1F3A] text-white p-12 relative overflow-hidden">
        <div className="absolute inset-0" style={{
          backgroundImage: 'radial-gradient(circle at 10% 90%, #163A63 0%, transparent 60%), radial-gradient(circle at 90% 10%, #D4A72C20 0%, transparent 50%)'
        }} />
        <div className="relative z-10 flex-1 flex flex-col">
          <Link to="/" className="flex items-center gap-2.5 mb-12">
            <div className="w-9 h-9 bg-[#D4A72C] rounded-xl flex items-center justify-center">
              <span className="text-[#0B1F3A] font-800 text-sm" style={{ fontWeight: 800 }}>CS</span>
            </div>
            <div>
              <div className="font-700 text-sm" style={{ fontWeight: 700 }}>City Scholarship</div>
              <div className="text-white/50 text-xs">Management System</div>
            </div>
          </Link>

          <div className="flex-1 flex flex-col justify-center">
            <h2 className="text-3xl font-800 mb-4 leading-tight" style={{ fontWeight: 800 }}>
              Your scholarship<br />journey starts here.
            </h2>
            <p className="text-white/60 text-sm leading-relaxed mb-10">
              Access your personalized dashboard to manage applications, track documents, and stay updated on your scholarship status.
            </p>

            <div className="space-y-4">
              {[
                { icon: 'check-circle', text: 'Real-time application tracking' },
                { icon: 'file-text', text: 'Secure document management' },
                { icon: 'bell', text: 'Instant notifications and updates' },
                { icon: 'message-square', text: 'Direct messaging with the office' },
              ].map(item => (
                <div key={item.text} className="flex items-center gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#D4A72C]/20 flex items-center justify-center flex-shrink-0">
                    <Icon name={item.icon} size={13} className="text-[#D4A72C]" />
                  </div>
                  <span className="text-sm text-white/70">{item.text}</span>
                </div>
              ))}
            </div>
          </div>

          <p className="text-xs text-white/30">© 2026 City Scholarship Management System</p>
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-[400px]">
          <Link to="/" className="flex items-center gap-2 mb-8 lg:hidden">
            <div className="w-7 h-7 bg-[#0B1F3A] rounded-lg flex items-center justify-center">
              <span className="text-[#D4A72C] font-800 text-xs" style={{ fontWeight: 800 }}>CS</span>
            </div>
            <span className="text-sm font-600 text-[#1F2937]" style={{ fontWeight: 600 }}>City Scholarship</span>
          </Link>

          {otpStep && (
            <>
              <div className="flex items-center gap-3 mb-6">
                <button onClick={() => { setOtpStep(false); setOtpError(''); setOtp(['', '', '', '', '', '']); }} className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[#F6F7F9] text-[#6B7280]">
                  <Icon name="arrow-left" size={16} />
                </button>
                <div>
                  <h1 className="text-xl font-800 text-[#1F2937]" style={{ fontWeight: 800 }}>Check your email</h1>
                  <p className="text-xs text-[#6B7280]">Step 2 of 2 — Verification</p>
                </div>
              </div>

              <div className="bg-[#F6F7F9] rounded-2xl p-5 mb-6 flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#163A63]/10 flex items-center justify-center flex-shrink-0">
                  <Icon name="mail" size={16} className="text-[#163A63]" />
                </div>
                <div>
                  <p className="text-sm font-600 text-[#1F2937]" style={{ fontWeight: 600 }}>OTP sent to {maskedEmail}</p>
                  <p className="text-xs text-[#6B7280] mt-0.5 leading-relaxed">
                    Enter the 6-digit code sent to your email.{otpPurpose !== 'login' ? <> You have {otpTimer}s to enter it.</> : null}
                  </p>
                  {otpPurpose !== 'login' && otpTimer > 0 && otpTimer <= 10 && (
                    <div className="mt-2 flex items-center gap-1.5 text-xs">
                      <div className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                        otpTimer <= 5 ? 'bg-[#DC2626]' : 'bg-[#163A63]'
                      }`} style={{ width: `${(otpTimer / 30) * 100}%` }} />
                      <span className={otpTimer <= 5 ? 'text-[#DC2626] font-semibold' : 'text-[#6B7280]'}>
                        {otpTimer}s remaining
                      </span>
                    </div>
                  )}
                  {otpPurpose !== 'login' && otpTimer === 0 && (
                    <p className="mt-2 text-xs text-[#DC2626] font-medium flex items-center gap-1">
                      <Icon name="clock" size={12} /> Timer expired! Please request a new code.
                    </p>
                  )}
                  {otpPurpose === 'login' && otpBlocked && (
                    <div className="mt-2">
                      <div className="flex items-center gap-1.5 text-xs">
                        <div className="h-1.5 flex-1 rounded-full bg-[#E5E7EB] overflow-hidden">
                          <div className="h-full bg-[#DC2626] transition-all duration-1000" style={{ width: `${(blockCountdown / 30) * 100}%` }} />
                        </div>
                        <span className="text-[#DC2626] font-semibold">{blockCountdown}s</span>
                      </div>
                      {blockCountdown > 0 ? (
                        <p className="mt-1.5 text-xs text-[#DC2626] font-medium flex items-center gap-1">
                          <Icon name="lock" size={12} /> OTP entry blocked. Wait {blockCountdown}s, then request a new code.
                        </p>
                      ) : (
                        <p className="mt-1.5 text-xs text-[#DC2626] font-medium flex items-center gap-1">
                          <Icon name="lock" size={12} /> Block ended. Please request a new code and enter the new OTP.
                        </p>
                      )}
                    </div>
                  )}
                  {otpPurpose === 'login' && mustResend && !otpBlocked && (
                    <p className="mt-2 text-xs text-[#DC2626] font-medium flex items-center gap-1">
                      <Icon name="alert-circle" size={12} /> Please request a new code and enter the new OTP.
                    </p>
                  )}
                  {otpPurpose === 'login' && !otpBlocked && !mustResend && attemptsRemaining < 6 && (
                    <p className="mt-2 text-xs text-[#6B7280]">
                      {attemptsRemaining} attempt{attemptsRemaining === 1 ? '' : 's'} remaining
                    </p>
                  )}
                </div>
              </div>

              <form onSubmit={handleOtpSubmit} className="space-y-5">
                <div>
                  <label className="block text-xs font-600 text-[#1F2937] mb-3" style={{ fontWeight: 600 }}>Enter OTP Code</label>
                  <div className="flex gap-2 justify-between" onPaste={handleOtpPaste}>
                    {otp.map((digit, i) => (
                      <input
                        key={i}
                        ref={el => { otpRefs.current[i] = el; }}
                        type="text"
                        inputMode="numeric"
                        maxLength={1}
                        value={digit}
                        disabled={otpPurpose === 'login' && (otpBlocked || mustResend)}
                        onChange={e => handleOtpChange(i, e.target.value)}
                        onKeyDown={e => handleOtpKeyDown(i, e)}
                        className={`w-12 h-14 text-center text-xl font-800 rounded-xl border-2 focus:outline-none transition-colors ${
                          otpError ? 'border-[#DC2626] bg-red-50' :
                          digit ? 'border-[#163A63] bg-white' :
                          'border-[#E5E7EB] bg-white focus:border-[#163A63]'
                        }`}
                        style={{ fontWeight: 800 }}
                      />
                    ))}
                  </div>
                  {otpError && (
                    <p className="text-xs text-[#DC2626] mt-2 flex items-center gap-1">
                      <Icon name="alert-circle" size={12} /> {otpError}
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={otpLoading || (otpPurpose === 'login' && (otpBlocked || mustResend))}
                  className="w-full py-3 bg-[#0B1F3A] text-white font-700 rounded-xl hover:bg-[#163A63] transition-colors text-sm disabled:opacity-60 flex items-center justify-center gap-2"
                  style={{ fontWeight: 700 }}
                >
                  {otpLoading ? (
                    <><span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />Verifying…</>
                  ) : otpPurpose === 'password_reset' ? 'Verify & Reset Password' : 'Verify & Sign In'}
                </button>
              </form>

              <div className="mt-4 text-center">
                {otpPurpose === 'login' && otpBlocked && blockCountdown > 0 ? (
                  <p className="text-xs text-[#DC2626]">OTP blocked — resend available in <span className="font-600" style={{ fontWeight: 600 }}>{blockCountdown}s</span></p>
                ) : otpPurpose === 'login' && (mustResend || (otpBlocked && blockCountdown <= 0)) ? (
                  <button onClick={handleResend} disabled={otpLoading} className="text-xs font-600 text-[#163A63] hover:text-[#0B1F3A] disabled:opacity-60" style={{ fontWeight: 600 }}>
                    Request a new code
                  </button>
                ) : resendCooldown > 0 ? (
                  <p className="text-xs text-[#9CA3AF]">Resend code in <span className="font-600 text-[#6B7280]" style={{ fontWeight: 600 }}>{resendCooldown}s</span></p>
                ) : (
                  <button onClick={handleResend} className="text-xs font-600 text-[#163A63] hover:text-[#0B1F3A]" style={{ fontWeight: 600 }}>
                    Didn't receive a code? Resend
                  </button>
                )}
              </div>
            </>
          )}

          {!otpStep && tab === 'login' && !needsPasswordSetup && (
            <>
              <h1 className="text-2xl font-800 text-[#1F2937] mb-1" style={{ fontWeight: 800 }}>Welcome back</h1>
              <p className="text-sm text-[#6B7280] mb-6">Sign in to access your scholarship portal</p>

              <form onSubmit={handleLogin} className="space-y-4">
                <div>
                  <label htmlFor="login-email" className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>Email Address</label>
                  <input
                    id="login-email"
                    type="email"
                    name="email"
                    autoComplete="username"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-sm text-[#1F2937] bg-white focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63] placeholder-[#9CA3AF] transition-colors"
                    placeholder="you@example.com"
                  />
                </div>
                <div>
                  <label htmlFor="login-password" className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>Password</label>
                  <div className="relative">
                    <input
                      id="login-password"
                      type={showPass ? 'text' : 'password'}
                      name="password"
                      autoComplete="current-password"
                      className="w-full px-3.5 py-2.5 pr-10 rounded-xl border border-[#E5E7EB] text-sm text-[#1F2937] bg-white focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63] placeholder-[#9CA3AF]"
                      placeholder="••••••••"
                    />
                    <button type="button" onClick={() => setShowPass(!showPass)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[#6B7280] hover:text-[#1F2937]">
                      <Icon name="eye" size={15} />
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox" className="rounded border-[#E5E7EB]" defaultChecked />
                    <span className="text-xs text-[#6B7280]">Remember me</span>
                  </label>
                  <button type="button" onClick={() => setTab('forgot')}
                    className="text-xs font-600 text-[#163A63] hover:text-[#0B1F3A]" style={{ fontWeight: 600 }}>
                    Forgot password?
                  </button>
                </div>
                {formError && <p className="text-xs text-[#DC2626]">{formError}</p>}
                <button
                  type="submit"
                  disabled={formLoading}
                  className="w-full py-3 bg-[#0B1F3A] text-white font-700 rounded-xl hover:bg-[#163A63] transition-colors text-sm mt-2 flex items-center justify-center gap-2"
                  style={{ fontWeight: 700 }}
                >
                  {formLoading ? 'Signing in…' : <>Continue <Icon name="arrow-right" size={15} /></>}
                </button>
              </form>

              <p className="text-center text-xs text-[#6B7280] mt-5">
                Don't have an account?{' '}
                <button onClick={() => setTab('register')} className="font-600 text-[#163A63] hover:text-[#0B1F3A]" style={{ fontWeight: 600 }}>
                  Create account
                </button>
              </p>
            </>
          )}

          {!otpStep && tab === 'register' && (
            <>
              <h1 className="text-2xl font-800 text-[#1F2937] mb-1" style={{ fontWeight: 800 }}>Create Account</h1>
              <p className="text-sm text-[#6B7280] mb-4">
                {registerRole === 'student'
                  ? (scholarType === 'existing_scholar'
                    ? 'Continue your scholarship as an existing scholar'
                    : 'Start your scholarship application journey')
                  : registerRole === 'barangay' ? 'Register as a Barangay Official' : 'Register as a City Scholarship Office staff'}
              </p>

              <div className="grid grid-cols-3 gap-2 mb-5 p-1 bg-[#F6F7F9] rounded-xl">
                {(['student', 'barangay', 'city'] as const).map(r => (
                  <button key={r} onClick={() => setRegisterRole(r)}
                    className={`py-2 rounded-lg text-xs font-600 transition-all ${registerRole === r ? 'bg-white shadow-sm text-[#0B1F3A]' : 'text-[#6B7280] hover:text-[#1F2937]'}`}
                    style={{ fontWeight: 600 }}>
                    {r === 'student' ? 'Student' : r === 'barangay' ? 'Barangay' : 'City Office'}
                  </button>
                ))}
              </div>

              {/* Account Type — students only. Decides which portal pages
                  open: new applicants start with the application flow,
                  existing scholars continue through renewal. */}
              {registerRole === 'student' && (
                <div className="mb-5">
                  <span className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>Account Type</span>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      { value: 'new_applicant', label: 'New Applicant', hint: 'First time applying for the scholarship' },
                      { value: 'existing_scholar', label: 'Existing Scholar', hint: 'Already a recipient, continuing scholar' },
                    ] as const).map(option => {
                      const active = scholarType === option.value;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={active}
                          onClick={() => setScholarType(option.value)}
                          className={`text-left px-3.5 py-3 rounded-xl border transition-all ${active ? 'border-[#163A63] bg-[#F6F7F9] ring-2 ring-[#163A63]/10' : 'border-[#E5E7EB] hover:border-[#163A63]/40'}`}
                        >
                          <span className="flex items-center gap-2">
                            <span className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 ${active ? 'border-[#163A63]' : 'border-[#D1D5DB]'}`}>
                              {active && <span className="w-1.5 h-1.5 rounded-full bg-[#163A63]" />}
                            </span>
                            <span className={`text-sm text-[#0B1F3A] ${active ? 'font-700' : 'font-600'}`} style={{ fontWeight: active ? 700 : 600 }}>
                              {option.label}
                            </span>
                          </span>
                          <span className="block text-xs text-[#6B7280] mt-1.5 leading-snug">{option.hint}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <form onSubmit={handleRegister} className="space-y-4">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="register-first-name" className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>First Name</label>
                    <input id="register-first-name" name="firstName" autoComplete="given-name" required type="text" className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]" placeholder="Maria" />
                  </div>
                  <div>
                    <label htmlFor="register-last-name" className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>Last Name</label>
                    <input id="register-last-name" name="lastName" autoComplete="family-name" required type="text" className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]" placeholder="Santos" />
                  </div>
                </div>
                <div>
                  <label htmlFor="register-email" className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>Email Address</label>
                  <input id="register-email" name="email" autoComplete="email" required type="email" className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]" placeholder="you@gmail.com" />
                </div>

                {(registerRole === 'barangay' || registerRole === 'city') && (
                  <div>
                    <label htmlFor="employee-number" className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>
                      Employee Number <span className="text-[#DC2626]">*</span>
                    </label>
                    <input
                      id="employee-number"
                      type="text"
                      name="employeeNumber"
                      autoComplete="off"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]"
                      placeholder={registerRole === 'barangay' ? 'e.g. BRG-2026-0001' : 'e.g. CSO-2026-0001'}
                    />
                    <p className="text-xs text-[#9CA3AF] mt-1">
                      {registerRole === 'barangay' ? 'As issued by your Barangay office' : 'As issued by the City Government'}
                    </p>
                  </div>
                )}

                {registerRole === 'student' && (
                  <>
                    <div>
                      <label htmlFor="register-student-barangay" className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>Barangay</label>
                      <select id="register-student-barangay" name="barangay" required className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63] bg-white text-[#1F2937]">
                        <option value="">Select your barangay</option>
                        {BARANGAYS.map(name => (
                          <option key={name} value={name}>{name}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="register-school" className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>
                        School / University <span className="text-[#DC2626]">*</span>
                      </label>
                      <select id="register-school" name="school" required value={selectedSchool} onChange={event => setSelectedSchool(event.target.value)} className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63] bg-white text-[#1F2937]">
                        <option value="">Select your school</option>
                        {SCHOOLS.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    {/* Existing scholars only: the Scholar ID the City Office
                        verifies before unlocking Renewal. */}
                    {scholarType === 'existing_scholar' && (
                      <div>
                        <label htmlFor="register-scholar-id" className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>
                          Existing Scholar ID <span className="text-[#DC2626]">*</span>
                        </label>
                        <input
                          id="register-scholar-id"
                          name="scholarId"
                          type="text"
                          autoComplete="off"
                          required
                          className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63] uppercase"
                          placeholder="e.g. SCH-2024-0182"
                        />
                        <p className="text-xs text-[#9CA3AF] mt-1">
                          The Scholar ID on file with the City Scholarship Office. Renewal unlocks once they confirm it.
                        </p>
                      </div>
                    )}
                  </>
                )}

                {registerRole === 'barangay' && (
                  <div>
                    <label htmlFor="register-staff-barangay" className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>Assigned Barangay</label>
                    <select id="register-staff-barangay" name="barangay" required className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63] bg-white text-[#1F2937]">
                      <option value="">Select barangay</option>
                      {BARANGAYS.map(name => (
                        <option key={name} value={name}>{name}</option>
                      ))}
                    </select>
                  </div>
                )}

                <div>
                  <label htmlFor="register-password" className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>Create Password</label>
                  <input id="register-password" name="password" autoComplete="new-password" required minLength={8} type="password" className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]" placeholder="Minimum 8 characters" />
                </div>
                <div>
                  <label htmlFor="register-confirm-password" className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>Confirm Password</label>
                  <input id="register-confirm-password" name="confirmPassword" autoComplete="new-password" required minLength={8} type="password" className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]" placeholder="Re-enter your password" />
                </div>
                {formError && <p className="text-xs text-[#DC2626]">{formError}</p>}
                <button
                  type="submit"
                  disabled={formLoading}
                  className="w-full py-3 bg-[#0B1F3A] text-white font-700 rounded-xl hover:bg-[#163A63] transition-colors text-sm"
                  style={{ fontWeight: 700 }}
                >
                  {formLoading ? 'Creating account…' : 'Create Account'}
                </button>
              </form>
              <p className="text-center text-xs text-[#6B7280] mt-4">
                Already have an account?{' '}
                <button onClick={() => setTab('login')} className="font-600 text-[#163A63]" style={{ fontWeight: 600 }}>Sign in</button>
              </p>
            </>
          )}

          {!otpStep && tab === 'forgot' && (
            <>
              <button onClick={() => setTab('login')} className="flex items-center gap-1.5 text-sm text-[#6B7280] hover:text-[#1F2937] mb-6">
                <Icon name="arrow-left" size={14} /> Back to login
              </button>
              <h1 className="text-2xl font-800 text-[#1F2937] mb-1" style={{ fontWeight: 800 }}>Reset Password</h1>
              <p className="text-sm text-[#6B7280] mb-6">Enter your email address and a new password. We’ll email a verification code. Works for Student, Barangay, City Office, and Super Admin accounts.</p>
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <div>
                  <label htmlFor="forgot-email" className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>Email Address</label>
                  <input id="forgot-email" name="email" autoComplete="email" required type="email" className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]" placeholder="you@gmail.com" />
                </div>
                <div>
                  <label htmlFor="forgot-password" className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>New Password</label>
                  <input id="forgot-password" name="password" autoComplete="new-password" required minLength={8} type="password" className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]" placeholder="Minimum 8 characters" />
                </div>
                <div>
                  <label htmlFor="forgot-confirm-password" className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>Confirm New Password</label>
                  <input id="forgot-confirm-password" name="confirmPassword" autoComplete="new-password" required minLength={8} type="password" className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]" placeholder="Re-enter your new password" />
                </div>
                {formError && <p className="text-xs text-[#DC2626]">{formError}</p>}
                <button type="submit" disabled={formLoading} className="w-full py-3 bg-[#0B1F3A] text-white font-700 rounded-xl hover:bg-[#163A63] transition-colors text-sm disabled:opacity-60" style={{ fontWeight: 700 }}>
                  {formLoading ? 'Sending code…' : 'Send Verification Code'}
                </button>
              </form>
            </>
          )}

          {/* ---------------------------------------------------------- */}
          {/* First sign-in / forced password change (any role, e.g. a    */}
          {/* provisioned Super Admin): /auth/login responded with        */}
          {/* requiresPasswordSetup. Create or update the password here,  */}
          {/* then continue to OTP verification.                          */}
          {/* ---------------------------------------------------------- */}
          {!otpStep && tab === 'login' && needsPasswordSetup && (
            <>
              <button onClick={() => { setFormError(''); setNeedsPasswordSetup(false); }} className="flex items-center gap-1.5 text-sm text-[#6B7280] hover:text-[#1F2937] mb-6">
                <Icon name="arrow-left" size={14} /> Back
              </button>
              <h1 className="text-2xl font-800 text-[#1F2937] mb-1" style={{ fontWeight: 800 }}>Create Your Password</h1>
              <p className="text-sm text-[#6B7280] mb-6">
                This is your first sign-in as {maskedEmail}. Set a new password to continue.
              </p>
              <form onSubmit={handleSetPassword} className="space-y-4">
                <div>
                  <label htmlFor="set-new-password" className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>New Password</label>
                  <input id="set-new-password" name="newPassword" autoComplete="new-password" required minLength={8} type="password" className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]" placeholder="Minimum 8 characters" />
                </div>
                <div>
                  <label htmlFor="set-confirm-new-password" className="block text-xs font-600 text-[#1F2937] mb-1.5" style={{ fontWeight: 600 }}>Confirm New Password</label>
                  <input id="set-confirm-new-password" name="confirmNewPassword" autoComplete="new-password" required minLength={8} type="password" className="w-full px-3.5 py-2.5 rounded-xl border border-[#E5E7EB] text-sm focus:outline-none focus:ring-2 focus:ring-[#163A63]/20 focus:border-[#163A63]" placeholder="Re-enter your new password" />
                </div>
                {formError && <p className="text-xs text-[#DC2626]">{formError}</p>}
                <button type="submit" disabled={formLoading} className="w-full py-3 bg-[#0B1F3A] text-white font-700 rounded-xl hover:bg-[#163A63] transition-colors text-sm disabled:opacity-60" style={{ fontWeight: 700 }}>
                  {formLoading ? 'Saving…' : 'Save Password & Continue'}
                </button>
              </form>
            </>
          )}


        </div>
      </div>
    </div>
  );
}

