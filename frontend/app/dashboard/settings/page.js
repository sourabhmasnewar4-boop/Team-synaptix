'use client';

import { useAuth } from '@/lib/AuthContext';

export default function SettingsPage() {
    const { user, logout } = useAuth();

    return (
        <>
            <div style={{ marginBottom: '30px' }}>
                <h1 className="page-title">Settings</h1>
            </div>

            {/* Account Card */}
            <div style={{
                background: '#222934', borderRadius: '12px', padding: '28px',
                maxWidth: '500px', marginBottom: '20px',
            }}>
                <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '20px' }}>Account</h2>

                {/* User Profile */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '24px' }}>
                    {user?.photoURL ? (
                        <img src={user.photoURL} alt=""
                            style={{ width: '56px', height: '56px', borderRadius: '50%' }}
                            referrerPolicy="no-referrer" />
                    ) : (
                        <div style={{
                            width: '56px', height: '56px', borderRadius: '50%',
                            background: '#3B82F6', display: 'flex', alignItems: 'center',
                            justifyContent: 'center', fontSize: '24px', fontWeight: '700',
                        }}>
                            {user?.displayName?.[0] || '?'}
                        </div>
                    )}
                    <div>
                        <div style={{ fontWeight: '600', fontSize: '16px' }}>{user?.displayName}</div>
                        <div style={{ color: '#9CA3AF', fontSize: '13px', marginTop: '2px' }}>{user?.email}</div>
                    </div>
                </div>

                {/* Logout Button */}
                <button
                    onClick={logout}
                    style={{
                        width: '100%', background: '#DC2626', color: 'white',
                        padding: '13px', borderRadius: '8px', fontSize: '14px',
                        fontWeight: '600', cursor: 'pointer', border: 'none',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px',
                    }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                        <polyline points="16 17 21 12 16 7" />
                        <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    Logout
                </button>
            </div>

            {/* ESP32 Info Card */}
            <div style={{
                background: '#222934', borderRadius: '12px', padding: '28px',
                maxWidth: '500px',
            }}>
                <h2 style={{ fontSize: '20px', fontWeight: '700', marginBottom: '16px' }}>ESP32 Setup</h2>
                <p style={{ fontSize: '13px', color: '#9CA3AF', lineHeight: '1.7', marginBottom: '16px' }}>
                    Your <strong style={{ color: '#E5E7EB' }}>User ID</strong> is required when flashing your ESP32 firmware
                    so the device knows which account to register to.
                </p>
                <div style={{
                    background: '#1A2233', borderRadius: '8px', padding: '12px 16px',
                    fontFamily: 'monospace', fontSize: '12px', color: '#60A5FA',
                    wordBreak: 'break-all',
                }}>
                    {user?.uid}
                </div>
                <p style={{ fontSize: '12px', color: '#6B7280', marginTop: '12px', lineHeight: '1.7' }}>
                    Flash firmware → Power on ESP32 → Connect to "AutoHome-XXXX" WiFi hotspot
                    → Enter home WiFi details → Device auto-registers here!
                </p>
            </div>
        </>
    );
}
