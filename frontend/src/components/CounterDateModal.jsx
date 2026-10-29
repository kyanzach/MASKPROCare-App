import { useState, useEffect } from 'react';

/**
 * CounterDateModal — lets a client decline a branch offer and/or propose their
 * own preferred schedule. Emits counter_date as 'YYYY-MM-DD HH:MM' (Manila local),
 * matching the mobile CounterDatePicker and the /bookings/respond-offer API.
 */
export const TIME_SLOTS = [
  { value: '08:00', label: '8:00 AM' },
  { value: '09:00', label: '9:00 AM' },
  { value: '10:00', label: '10:00 AM' },
  { value: '11:00', label: '11:00 AM' },
  { value: '13:00', label: '1:00 PM' },
  { value: '14:00', label: '2:00 PM' },
  { value: '15:00', label: '3:00 PM' },
  { value: '16:00', label: '4:00 PM' },
];

export const formatCounterDate = (raw) => {
  if (!raw) return '';
  const d = new Date(String(raw).includes('T') ? raw : String(raw).replace(' ', 'T'));
  if (isNaN(d.getTime())) return String(raw);
  return `${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} at ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}`;
};

const tomorrowYmd = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

export default function CounterDateModal({ open, mode = 'decline', offeredDate, submitting, onClose, onSubmit }) {
  const [date, setDate] = useState('');
  const [time, setTime] = useState('08:00');
  const [reason, setReason] = useState('');
  const [fieldError, setFieldError] = useState('');

  useEffect(() => {
    if (open) { setDate(''); setTime('08:00'); setReason(''); setFieldError(''); }
  }, [open]);

  if (!open) return null;
  const isPropose = mode === 'propose';
  const isSunday = date && new Date(`${date}T00:00:00`).getDay() === 0;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (isPropose && !date) { setFieldError('Please choose your preferred date.'); return; }
    if (!date && !reason.trim()) { setFieldError('Please give a reason or pick your preferred date.'); return; }
    if (isSunday) { setFieldError('Branches are closed on Sundays. Please pick another day.'); return; }
    setFieldError('');
    onSubmit({ counterDate: date ? `${date} ${time}` : '', reason: reason.trim() });
  };

  const accent = isPropose ? '#2563eb' : '#dc2626';

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed', inset: 0, backgroundColor: 'rgba(15,23,42,0.55)', zIndex: 9999,
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '12px',
      }}
    >
      <div style={{
        backgroundColor: '#fff', borderRadius: '16px', padding: 'clamp(16px, 4vw, 24px)',
        maxWidth: '440px', width: '100%', boxSizing: 'border-box', boxShadow: '0 20px 25px -5px rgba(0,0,0,0.15)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '20px', flexShrink: 0,
            backgroundColor: isPropose ? '#dbeafe' : '#fee2e2',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: accent,
          }}>
            <i className={isPropose ? 'fas fa-calendar-plus' : 'fas fa-calendar-times'} style={{ fontSize: '18px' }}></i>
          </div>
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700, color: '#111827' }}>
              {isPropose ? 'Propose a Preferred Date' : 'Decline or Propose New Date'}
            </h3>
            <small style={{ color: '#64748b' }}>
              {isPropose ? 'Our branch will call you to finalize' : (offeredDate ? `Offered: ${formatCounterDate(offeredDate)}` : '')}
            </small>
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', marginBottom: '6px' }}>
            {isPropose ? 'Your Preferred Date & Time' : 'Suggest Preferred Date & Time (Optional)'}
          </label>
          <div style={{ display: 'flex', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
            <input
              id="counter-date-input"
              type="date"
              min={tomorrowYmd()}
              value={date}
              onChange={(e) => { setDate(e.target.value); setFieldError(''); }}
              style={{ flex: '1 1 160px', minWidth: 0, borderRadius: '8px', border: '1px solid #d1d5db', padding: '9px 10px', fontSize: '13px', boxSizing: 'border-box' }}
            />
            <select
              id="counter-time-select"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              disabled={!date}
              style={{ flex: '1 1 130px', minWidth: 0, borderRadius: '8px', border: '1px solid #d1d5db', padding: '9px 10px', fontSize: '13px', background: '#fff', boxSizing: 'border-box' }}
            >
              {TIME_SLOTS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>
          {fieldError && (
            <div style={{ color: '#b91c1c', fontSize: '12px', marginBottom: '6px' }}>
              <i className="fas fa-exclamation-circle" style={{ marginRight: 4 }}></i>{fieldError}
            </div>
          )}

          <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#374151', margin: '12px 0 6px' }}>
            {isPropose ? 'Note for the branch (optional)' : "Why doesn't the offered schedule work?"}
          </label>
          <textarea
            id="counter-reason-input"
            rows={2}
            value={reason}
            onChange={(e) => { setReason(e.target.value); setFieldError(''); }}
            placeholder="e.g. Schedule conflict, out of town..."
            style={{
              width: '100%', borderRadius: '10px', border: '1px solid #d1d5db',
              padding: '10px 12px', fontSize: '13px', resize: 'vertical', marginBottom: '16px', boxSizing: 'border-box',
            }}
          />

          <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              style={{ padding: '8px 16px', borderRadius: '8px', border: '1px solid #d1d5db', background: '#fff', color: '#4b5563', cursor: 'pointer', fontWeight: 600 }}
            >
              Cancel
            </button>
            <button
              id="counter-submit-btn"
              type="submit"
              disabled={submitting}
              style={{ padding: '8px 18px', borderRadius: '8px', border: 'none', background: date ? '#4f46e5' : accent, color: '#fff', cursor: 'pointer', fontWeight: 700 }}
            >
              {submitting ? 'Sending...' : (date ? 'Send Preferred Date' : 'Submit & Decline')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
