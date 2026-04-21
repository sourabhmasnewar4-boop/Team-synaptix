'use client';

import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { WebSocketProvider, useWebSocket } from '@/lib/WebSocketContext';
import ChatBot from '@/components/ChatBot';

// ── WebSocket Status Removed for Minimalism ──

function FloatingNavMenu() {
    const [open, setOpen] = useState(false);
    const router = useRouter();

    const navBtnStyle = { background: 'transparent', border: 'none', color: '#F3F4F6', fontSize: '15px', fontWeight: '500', padding: '10px 16px', textAlign: 'left', cursor: 'pointer', borderRadius: '8px', transition: 'background 0.2s', width: '100%' };

    return (
        <div style={{ position: 'fixed', bottom: '30px', left: '30px', zIndex: 1000 }}>
            {open && (
                <div style={{ position: 'absolute', bottom: '60px', left: '0', display: 'flex', flexDirection: 'column', gap: '6px', background: 'rgba(10, 5, 25, 0.7)', backdropFilter: 'blur(20px)', padding: '12px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', minWidth: '160px', boxShadow: '0 10px 40px rgba(0,0,0,0.5)' }}>
                    <button style={navBtnStyle} onMouseOver={e => e.target.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={e => e.target.style.background = 'transparent'} onClick={() => { setOpen(false); router.push('/dashboard'); }}>Dashboard</button>
                    <button style={navBtnStyle} onMouseOver={e => e.target.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={e => e.target.style.background = 'transparent'} onClick={() => { setOpen(false); router.push('/dashboard/rooms'); }}>Rooms</button>
                    <button style={navBtnStyle} onMouseOver={e => e.target.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={e => e.target.style.background = 'transparent'} onClick={() => { setOpen(false); router.push('/dashboard/devices'); }}>Devices</button>
                    <button style={navBtnStyle} onMouseOver={e => e.target.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={e => e.target.style.background = 'transparent'} onClick={() => { setOpen(false); router.push('/dashboard/routines'); }}>Routines</button>
                    <button style={navBtnStyle} onMouseOver={e => e.target.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={e => e.target.style.background = 'transparent'} onClick={() => { setOpen(false); router.push('/dashboard/integrations'); }}>Integrations</button>
                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
                    <button style={navBtnStyle} onMouseOver={e => e.target.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={e => e.target.style.background = 'transparent'} onClick={() => { setOpen(false); router.push('/dashboard/settings'); }}>Settings</button>
                </div>
            )}
            <button
                onClick={() => setOpen(!open)}
                style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(255,255,255,0.05)', backdropFilter: 'blur(16px)', border: '1px solid rgba(255,255,255,0.15)', color: 'white', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 8px 32px rgba(0,0,0,0.3)', transition: 'transform 0.2s cubic-bezier(0.2, 0.8, 0.2, 1)' }}
                onMouseOver={e => e.currentTarget.style.transform = 'scale(1.08)'}
                onMouseOut={e => e.currentTarget.style.transform = 'scale(1)'}
            >
                {open ? (
                    <svg viewBox="0 0 24 24" width="26" height="26" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                ) : (
                    <svg viewBox="0 0 24 24" width="26" height="26" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>
                )}
            </button>
        </div>
    );
}

// ── INDEXEDDB VIDEO STORAGE ──
const DB_NAME = 'AutoHomeDB';
const STORE_NAME = 'bgConfig';
const DB_VERSION = 3;

const initDB = () => {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME);
            }
        };
        req.onsuccess = (e) => resolve(e.target.result);
        req.onerror = (e) => reject(e.target.error);
    });
};

const saveVideoToDB = async (file) => {
    try {
        const db = await initDB();
        return new Promise((resolve) => {
            if (!db.objectStoreNames.contains(STORE_NAME)) return resolve();
            try {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).put({ file, type: 'customVideo' }, 'customBg');
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch (e) { resolve(); }
        });
    } catch { }
};

const loadVideoFromDB = async () => {
    try {
        const db = await initDB();
        return new Promise((resolve) => {
            if (!db.objectStoreNames.contains(STORE_NAME)) return resolve(null);
            try {
                const tx = db.transaction(STORE_NAME, 'readonly');
                const getReq = tx.objectStore(STORE_NAME).get('customBg');
                getReq.onsuccess = () => resolve(getReq.result?.file || null);
                getReq.onerror = () => resolve(null);
            } catch (e) { resolve(null); }
        });
    } catch { return null; }
};

const deleteVideoFromDB = async () => {
    try {
        const db = await initDB();
        return new Promise((resolve) => {
            if (!db.objectStoreNames.contains(STORE_NAME)) return resolve();
            try {
                const tx = db.transaction(STORE_NAME, 'readwrite');
                tx.objectStore(STORE_NAME).delete('customBg');
                tx.oncomplete = () => resolve();
                tx.onerror = () => resolve();
            } catch (e) { resolve(); }
        });
    } catch { }
};

// ── BACKGROUND MANAGER ──
function BackgroundManager() {
    const [bgModal, setBgModal] = useState(false);
    const [activeBg, setActiveBg] = useState(null);
    const [customUrl, setCustomUrl] = useState('');

    useEffect(() => {
        const savedType = localStorage.getItem('autohome_bg_type');
        const savedUrl = localStorage.getItem('autohome_bg');

        if (savedType === 'custom') {
            loadVideoFromDB().then(file => {
                if (file) {
                    const url = URL.createObjectURL(file);
                    setActiveBg(url);
                }
            });
        } else if (savedUrl) {
            setActiveBg(savedUrl);
        }

        const handleOpen = () => setBgModal(true);
        window.addEventListener('openBackgroundOptions', handleOpen);
        return () => window.removeEventListener('openBackgroundOptions', handleOpen);
    }, []);

    const setBg = (url, isCustom = false, file = null) => {
        setActiveBg(url);

        if (isCustom) {
            localStorage.setItem('autohome_bg_type', 'custom');
            saveVideoToDB(file);
        } else {
            localStorage.setItem('autohome_bg_type', 'preset');
            if (url) localStorage.setItem('autohome_bg', url);
            else localStorage.removeItem('autohome_bg');
            deleteVideoFromDB();
        }
    };

    const handleFileUpload = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const url = URL.createObjectURL(file);
        setBg(url, true, file);
    };

    const presets = [
        { name: "Deep Aurora (Default CSS)", url: null },
        { name: "Galactic Nebula", url: "https://cdn.pixabay.com/video/2018/11/04/19080-302384784_large.mp4" },
        { name: "Futuristic Grid", url: "https://cdn.pixabay.com/video/2021/08/04/83818-584742468_large.mp4" },
        { name: "Cyber City", url: "https://cdn.pixabay.com/video/2020/03/11/33580-399566993_large.mp4" }
    ];

    return (
        <>
            {/* The Video Layer Behind Everything */}
            {activeBg && (
                <video
                    autoPlay loop muted playsInline
                    key={activeBg}
                    style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', objectFit: 'cover', zIndex: -1, opacity: 0.6 }}
                >
                    <source src={activeBg} type="video/mp4" />
                </video>
            )}

            {/* Modal for Background Selection */}
            {bgModal && (
                <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.8)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <div style={{ background: '#111827', width: '400px', padding: '24px', borderRadius: '16px', border: '1px solid #374151', color: 'white' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                            <h3 style={{ margin: 0 }}>Background Settings</h3>
                            <button onClick={() => setBgModal(false)} style={{ background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', fontSize: '18px' }}>×</button>
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {presets.map((p, i) => (
                                <button key={i} onClick={() => setBg(p.url)} style={{ background: activeBg === p.url ? 'rgba(16,185,129,0.2)' : 'rgba(255,255,255,0.05)', color: activeBg === p.url ? '#10B981' : 'white', border: activeBg === p.url ? '1px solid #10B981' : '1px solid transparent', padding: '12px', borderRadius: '8px', cursor: 'pointer', textAlign: 'left', fontWeight: 'bold' }}>
                                    {p.name}
                                </button>
                            ))}
                        </div>

                        <div style={{ marginTop: '16px', paddingTop: '16px', borderTop: '1px solid #374151' }}>
                            <h4 style={{ margin: '0 0 8px 0', fontSize: '14px', color: '#9CA3AF' }}>Upload Custom Video (.mp4)</h4>
                            <input type="file" accept="video/mp4,video/webm" onChange={handleFileUpload} style={{ width: '100%', fontSize: '14px', background: 'rgba(255,255,255,0.05)', padding: '10px', borderRadius: '8px' }} />
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

function DashboardLayoutInner({ children }) {
    const { user, loading } = useAuth();
    const router = useRouter();
    const [botOpen, setBotOpen] = useState(false);

    useEffect(() => {
        if (!loading && !user) router.push('/');
    }, [user, loading, router]);

    if (loading) return null;
    if (!user) return null;

    return (
        <div style={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
            <BackgroundManager />
            <FloatingNavMenu />
            <main style={{ flex: 1, padding: '40px', position: 'relative' }}>
                {children}

                {/* Floating Bot Context */}
                <ChatBot open={botOpen} onOpen={() => setBotOpen(true)} />
                <div className="floating-bot" title="AutoHome Assistant" onClick={() => setBotOpen(!botOpen)}>
                    {botOpen ? (
                        <svg viewBox="0 0 24 24" style={{ width: '24px', fill: 'none', stroke: 'white', strokeWidth: '2.5', strokeLinecap: 'round' }}>
                            <path d="M18 6L6 18M6 6l12 12" />
                        </svg>
                    ) : (
                        <svg viewBox="0 0 24 24" style={{ width: '30px', fill: 'white' }}>
                            <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h5a2 2 0 0 1 2 2v6h2v2h-2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2H2v-2h2V9a2 2 0 0 1 2-2h5V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M7.5 13A1.5 1.5 0 0 0 6 11.5 1.5 1.5 0 0 0 7.5 10 1.5 1.5 0 0 0 9 11.5 1.5 1.5 0 0 0 7.5 13m9 0a1.5 1.5 0 0 0-1.5-1.5A1.5 1.5 0 0 0 13.5 13a1.5 1.5 0 0 0 1.5 1.5A1.5 1.5 0 0 0 16.5 13m-3.5 3.5a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-1h-6v1z" />
                        </svg>
                    )}
                </div>
            </main>
        </div>
    );
}

export default function DashboardLayout({ children }) {
    return (
        <WebSocketProvider>
            <DashboardLayoutInner>{children}</DashboardLayoutInner>
        </WebSocketProvider>
    );
}
