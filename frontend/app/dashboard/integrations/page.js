'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';

export default function IntegrationsPage() {
    const { user } = useAuth();
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        fetch(`http://localhost:4000/api/integrations/status?userId=${user?.uid || ''}`)
            .then(res => res.json())
            .then(data => {
                setStatus(data);
                setLoading(false);
            })
            .catch(err => {
                console.error(err);
                setLoading(false);
            });

        // Check URL for OAuth success/error
        const params = new URLSearchParams(window.location.search);
        if (params.get('success') === 'spotify') {
            alert('🎉 Spotify linked successfully!');
            window.history.replaceState({}, document.title, window.location.pathname);
        } else if (params.get('error')) {
            alert('⚠️ Failed to link account. Please check your credentials.');
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, [user]);

    const handleConnectTelegram = () => {
        if (!status?.telegram?.username) return;

        // This opens Telegram to our bot and passes the userId as the START payload!
        // Telegram resolves t.me/Bot?start=payload to /start payload
        const url = `https://t.me/${status.telegram.username}?start=${user.uid}`;
        window.open(url, '_blank');
    };

    if (loading) {
        return <div style={{ color: 'white' }}>Loading integrations...</div>;
    }

    return (
        <div style={{ maxWidth: '800px', margin: '0 auto', color: 'white' }}>
            <h1 style={{ fontSize: '32px', fontWeight: 'bold', marginBottom: '8px' }}>Integrations</h1>
            <p style={{ color: '#9CA3AF', marginBottom: '32px' }}>
                Connect third-party apps to control your smart home seamlessly.
            </p>

            <div style={{ display: 'grid', gap: '24px' }}>

                {/* ── Telegram Integration ── */}
                <div style={{
                    background: 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '16px',
                    padding: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div style={{
                            width: '60px', height: '60px', borderRadius: '14px',
                            background: '#0088cc', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <svg viewBox="0 0 24 24" width="32" height="32" fill="white">
                                <path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.888-.662 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z" />
                            </svg>
                        </div>
                        <div>
                            <h3 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 'bold' }}>Telegram Assistant</h3>
                            <p style={{ margin: 0, color: '#9CA3AF', fontSize: '14px' }}>Chat with your home right from Telegram.</p>
                        </div>
                    </div>

                    {status?.telegram?.enabled ? (
                        <button
                            onClick={handleConnectTelegram}
                            style={{
                                background: '#0088cc', color: 'white', border: 'none',
                                padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold',
                                cursor: 'pointer', transition: 'transform 0.2s',
                                boxShadow: '0 4px 14px rgba(0, 136, 204, 0.4)'
                            }}
                            onMouseOver={e => e.currentTarget.style.transform = 'scale(1.05)'}
                            onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
                        >
                            Connect Telegram
                        </button>
                    ) : (
                        <div style={{ color: '#EF4444', fontSize: '14px', background: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: '6px' }}>
                            Admin setup required in .env
                        </div>
                    )}
                </div>

                {/* ── Discord Integration ── */}
                <div style={{
                    background: 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '16px',
                    padding: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.2)',
                    opacity: 0.7 // slightly dimmed for future work
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div style={{
                            width: '60px', height: '60px', borderRadius: '14px',
                            background: '#5865F2', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <svg viewBox="0 0 24 24" width="32" height="32" fill="white">
                                <path d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.35-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95.02.04.05.07.09.09 1.77 1.3 3.48 2.08 5.15 2.59.03.01.07.01.1-.02.4-.55.76-1.13 1.07-1.74.02-.05-.01-.1-.06-.12-.58-.22-1.13-.49-1.66-.8-.06-.03-.06-.11-.02-.15.11-.08.22-.17.33-.25.04-.03.08-.03.11-.01 3.41 1.56 7.1 1.56 10.46 0 .04-.02.08-.01.12.01.11.08.22.17.33.26.04.03.04.11-.02.15-.52.31-1.08.57-1.66.79-.05.02-.07.08-.05.12.31.61.68 1.2 1.07 1.74.03.03.06.03.1.02 1.68-.52 3.39-1.3 5.16-2.6.04-.03.07-.06.09-.1.43-4.32-.51-8.23-3.1-11.95-.01-.01-.03-.02-.03-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z" />
                            </svg>
                        </div>
                        <div>
                            <h3 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 'bold' }}>Discord Server</h3>
                            <p style={{ margin: 0, color: '#9CA3AF', fontSize: '14px' }}>Add the bot to your family&apos;s discord group.</p>
                        </div>
                    </div>

                    {status?.discord?.enabled ? (
                        <span style={{ color: '#10B981', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                            Available
                        </span>
                    ) : (
                        <div style={{ color: '#EF4444', fontSize: '14px', background: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: '6px' }}>
                            Admin setup required in .env
                        </div>
                    )}
                </div>

                {/* ── Spotify Integration ── */}
                <div style={{
                    background: 'linear-gradient(145deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    borderRadius: '16px',
                    padding: '24px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    boxShadow: '0 10px 30px rgba(0,0,0,0.2)'
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
                        <div style={{
                            width: '60px', height: '60px', borderRadius: '14px',
                            background: '#1DB954', display: 'flex', alignItems: 'center', justifyContent: 'center'
                        }}>
                            <svg viewBox="0 0 24 24" width="32" height="32" fill="white">
                                <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.48.659.24 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.6.18-1.2.72-1.38 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.239.54-.959.72-1.498.42z" />
                            </svg>
                        </div>
                        <div>
                            <h3 style={{ margin: '0 0 4px 0', fontSize: '20px', fontWeight: 'bold' }}>Spotify Player</h3>
                            <p style={{ margin: 0, color: '#9CA3AF', fontSize: '14px' }}>Control your speakers with the AI Assistant.</p>
                        </div>
                    </div>

                    {status?.spotify?.linked ? (
                        <span style={{ color: '#10B981', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <svg viewBox="0 0 24 24" width="20" height="20" stroke="currentColor" strokeWidth="2" fill="none"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                            Linked
                        </span>
                    ) : status?.spotify?.enabled ? (
                        <button
                            onClick={() => window.location.href = `http://localhost:4000/api/spotify/login?userId=${user.uid}`}
                            style={{
                                background: 'transparent', color: 'white', border: '1px solid rgba(255,255,255,0.2)',
                                padding: '10px 20px', borderRadius: '8px', fontWeight: 'bold',
                                cursor: 'pointer', transition: 'all 0.2s'
                            }}
                            onMouseOver={e => { e.currentTarget.style.background = '#1DB954'; e.currentTarget.style.borderColor = '#1DB954'; }}
                            onMouseOut={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                        >
                            Link Account
                        </button>
                    ) : (
                        <div style={{ color: '#EF4444', fontSize: '14px', background: 'rgba(239, 68, 68, 0.1)', padding: '8px 12px', borderRadius: '6px' }}>
                            Admin setup required in .env
                        </div>
                    )}
                </div>

            </div>
        </div>
    );
}
