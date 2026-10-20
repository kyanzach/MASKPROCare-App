import React from 'react';
import { Link } from 'react-router-dom';

export default function Terms() {
  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc', color: '#1e293b', fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      <header style={{ backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', maxWidth: '960px', margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <img src="/maskpro_logo.png" alt="MASKPRO" style={{ width: '32px', height: '32px', borderRadius: '8px' }} />
          <span style={{ fontWeight: '800', fontSize: '18px', color: '#0f172a' }}>MASKPRO<span style={{ color: '#06b6d4' }}>Care</span></span>
        </div>
        <Link to="/login" style={{ color: '#4f46e5', fontWeight: '600', textDecoration: 'none', fontSize: '14px' }}>Back to Login</Link>
      </header>

      <main style={{ maxWidth: '800px', margin: '40px auto', padding: '0 24px 60px' }}>
        <div style={{ backgroundColor: '#ffffff', borderRadius: '16px', padding: '36px', boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.05), 0 2px 4px -2px rgba(0, 0, 0, 0.05)', border: '1px solid #e2e8f0' }}>
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>Terms of Service</h1>
          <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '28px' }}>Last updated: October 20, 2026</p>

          <section style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '10px' }}>1. Acceptance of Terms</h2>
            <p style={{ color: '#475569', lineHeight: '1.6', fontSize: '15px' }}>
              By downloading, accessing, or using the <strong>MASKPRO Care</strong> mobile application and web portal, you agree to be bound by these Terms of Service. If you do not agree, please do not use the application.
            </p>
          </section>

          <section style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '10px' }}>2. Vehicle Service Bookings & Warranties</h2>
            <ul style={{ color: '#475569', lineHeight: '1.6', fontSize: '15px', paddingLeft: '24px' }}>
              <li>Appointments made through the app are subject to branch schedule confirmation and capacity limits.</li>
              <li>Warranty coverage (ceramic coating, paint protection film, window tint) is tied to the customer vehicle and is valid only with regular maintenance as documented in the app.</li>
              <li>Cancellations or rescheduling should be completed at least 24 hours prior to the scheduled booking time whenever possible.</li>
            </ul>
          </section>

          <section style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '10px' }}>3. Community Guidelines & S.O.S. Emergency Feature</h2>
            <p style={{ color: '#475569', lineHeight: '1.6', fontSize: '15px' }}>
              The Community Care section is intended for car care advice, roadside help, and mutual automotive assistance. Users agree not to post spam, offensive content, fraudulent requests, or abusive comments. Posts are subject to automated moderation and administrative review.
            </p>
          </section>

          <section style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '10px' }}>4. Account Security</h2>
            <p style={{ color: '#475569', lineHeight: '1.6', fontSize: '15px' }}>
              You are responsible for safeguarding access to your registered mobile phone number. Do not share One-Time Passwords (OTPs) with anyone. MaskPro personnel will never request your OTP.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '10px' }}>5. Contact & Support</h2>
            <p style={{ color: '#475569', lineHeight: '1.6', fontSize: '15px' }}>
              For support inquiries or warranty concerns, contact MaskPro Care Customer Support at <a href="mailto:support@maskpro.ph" style={{ color: '#4f46e5' }}>support@maskpro.ph</a>.
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
