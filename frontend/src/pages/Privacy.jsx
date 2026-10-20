import React from 'react';
import { Link } from 'react-router-dom';

export default function Privacy() {
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
          <h1 style={{ fontSize: '28px', fontWeight: '800', color: '#0f172a', marginBottom: '8px' }}>Privacy Policy</h1>
          <p style={{ color: '#64748b', fontSize: '13px', marginBottom: '28px' }}>Last updated: October 20, 2026</p>

          <section style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '10px' }}>1. Introduction</h2>
            <p style={{ color: '#475569', lineHeight: '1.6', fontSize: '15px' }}>
              Welcome to <strong>MASKPRO Care</strong> (&quot;we,&quot; &quot;our,&quot; or &quot;us&quot;), operated by MaskPro Philippines. We are committed to protecting your privacy and ensuring your personal information is handled in accordance with the Data Privacy Act of 2012 (Republic Act No. 10173) and global app store standards.
            </p>
          </section>

          <section style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '10px' }}>2. Information We Collect</h2>
            <p style={{ color: '#475569', lineHeight: '1.6', fontSize: '15px', marginBottom: '10px' }}>
              We collect information to provide, maintain, and improve vehicle protection and aftercare services:
            </p>
            <ul style={{ color: '#475569', lineHeight: '1.6', fontSize: '15px', paddingLeft: '24px' }}>
              <li><strong>Contact Information:</strong> Full name, Philippine mobile number, and email address.</li>
              <li><strong>Vehicle Information:</strong> Make, model, year, plate number, color, and warranty coverage records.</li>
              <li><strong>Service & Booking Records:</strong> Service history (ceramic coating, tint, PPF, maintenance), appointment requests, branch locations, and completion dates.</li>
              <li><strong>Photos & Documentation:</strong> Profile photos and vehicle condition inspection photos uploaded at your discretion.</li>
            </ul>
          </section>

          <section style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '10px' }}>3. How We Use Your Information</h2>
            <ul style={{ color: '#475569', lineHeight: '1.6', fontSize: '15px', paddingLeft: '24px' }}>
              <li>To authenticate your login via secure One-Time Password (OTP) SMS verification.</li>
              <li>To schedule, confirm, and remind you of vehicle maintenance appointments.</li>
              <li>To issue and verify digital warranty cards and service history.</li>
              <li>To deliver critical vehicle emergency support in the Community SOS feature.</li>
            </ul>
          </section>

          <section style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '10px' }}>4. Device Permissions</h2>
            <ul style={{ color: '#475569', lineHeight: '1.6', fontSize: '15px', paddingLeft: '24px' }}>
              <li><strong>Camera & Photo Library:</strong> Used strictly when you choose to take or upload a profile picture or vehicle service documentation. You can revoke this permission anytime in device settings.</li>
            </ul>
          </section>

          <section style={{ marginBottom: '24px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '10px' }}>5. Account & Data Deletion (App Store Compliance)</h2>
            <p style={{ color: '#475569', lineHeight: '1.6', fontSize: '15px' }}>
              You have the right to request deletion of your account and personal data at any time. You can initiate account deletion directly inside the app by navigating to <strong>Profile → Delete Account</strong>, or by emailing our Data Protection Officer at <a href="mailto:support@maskpro.ph" style={{ color: '#4f46e5' }}>support@maskpro.ph</a>. Upon confirmation, all your personal identifying details and photos are permanently erased.
            </p>
          </section>

          <section>
            <h2 style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b', marginBottom: '10px' }}>6. Contact Us</h2>
            <p style={{ color: '#475569', lineHeight: '1.6', fontSize: '15px' }}>
              If you have any questions regarding this Privacy Policy, please contact us at:<br />
              <strong>Email:</strong> support@maskpro.ph<br />
              <strong>Website:</strong> https://maskpro.ph
            </p>
          </section>
        </div>
      </main>
    </div>
  );
}
