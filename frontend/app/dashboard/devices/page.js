'use client';

import { useAuth } from '@/lib/AuthContext';
import { useWebSocket } from '@/lib/WebSocketContext';
import { db } from '@/lib/firebase';
import {
    collection, query, where, onSnapshot,
    addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from 'firebase/firestore';
import { useEffect, useState, useRef, useCallback } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

function PowerIcon({ size = 24, color = 'currentColor' }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }}>
            <path d="M18.36 6.64A9 9 0 1 1 5.64 6.64" />
            <path d="M12 2v10" />
        </svg>
    );
}

function Toast({ message, type = 'success', onClose }) {
    useEffect(() => { const t = setTimeout(onClose, 2500); return () => clearTimeout(t); }, [onClose]);
    return (
        <div style={{
            position: 'fixed', bottom: '90px', right: '30px', zIndex: 1000,
            background: type === 'error' ? '#DC2626' : '#16A34A',
            color: 'white', padding: '10px 18px', borderRadius: '8px',
            fontSize: '13px', boxShadow: '0 4px 20px rgba(0,0,0,0.4)',
            animation: 'fadeSlideIn 0.2s ease',
        }}>
            {message}
        </div>
    );
}

function AddDeviceModal({ userId, rooms, onClose, onSuccess }) {
    const [name, setName] = useState('');
    const [roomId, setRoomId] = useState('');
    const [loading, setLoading] = useState(false);

    // Auto-Discovery State
    const [scanning, setScanning] = useState(true);
    const [discovered, setDiscovered] = useState([]);
    const [selectedDevice, setSelectedDevice] = useState(null);

    // Poll backend for newly discovered devices on the LAN
    useEffect(() => {
        if (!scanning) return;

        const fetchDevices = async () => {
            try {
                const res = await fetch(`${API}/api/devices/discover`);
                if (res.ok) {
                    const list = await res.json();
                    setDiscovered(list);
                }
            } catch (e) { console.error('Discovery error:', e); }
        };

        fetchDevices();
        const interval = setInterval(fetchDevices, 2000);
        return () => clearInterval(interval);
    }, [scanning]);

    const handleProvision = async (e) => {
        e.preventDefault();
        if (!name.trim() || !selectedDevice) return;
        setLoading(true);

        try {
            const res = await fetch(`${API}/api/devices/provision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    deviceId: selectedDevice.deviceId,
                    deviceIp: selectedDevice.publicIp,
                    channels: selectedDevice.channels,
                    userId,
                    name: name.trim(),
                    roomId: roomId || null
                })
            });

            if (!res.ok) throw new Error(await res.text());
            onSuccess('Device found and successfully connected!');
        } catch (err) {
            console.error(err);
            alert("Failed to provision. Make sure the device is powered on.");
        }
        setLoading(false);
    };

    return (
        <div style={overlayStyle} onClick={onClose}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
                <h2 style={modalTitleStyle}>Add New Device</h2>

                {!selectedDevice ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <p style={{ color: '#9CA3AF', fontSize: '13px' }}>
                            Power on your new ESP32 device and connect to its "AutoHome" WiFi network to enter your home WiFi credentials.
                            Once it joins this network, it will instantly appear below.
                        </p>

                        <div style={{
                            background: '#2F3947', borderRadius: '8px', padding: '16px',
                            minHeight: '120px', display: 'flex', flexDirection: 'column', gap: '8px'
                        }}>
                            {discovered.length === 0 ? (
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100px', gap: '10px' }}>
                                    <div className="spinner"></div>
                                    <span style={{ color: '#9CA3AF', fontSize: '13px' }}>Scanning local network...</span>
                                </div>
                            ) : (
                                discovered.map(dev => (
                                    <div key={dev.deviceId} style={{
                                        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                                        background: '#1E2535', padding: '12px 16px', borderRadius: '8px'
                                    }}>
                                        <div>
                                            <div style={{ fontWeight: '600' }}>Unconfigured ESP32 ({dev.channels}ch)</div>
                                            <div style={{ fontSize: '11px', color: '#9CA3AF' }}>Public IP: {dev.publicIp}</div>
                                        </div>
                                        <button
                                            style={primaryBtnStyle}
                                            onClick={() => { setSelectedDevice(dev); setScanning(false); }}
                                        >
                                            Connect
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>

                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
                            <button type="button" style={cancelBtnStyle} onClick={onClose}>Cancel</button>
                        </div>
                    </div>
                ) : (
                    <form onSubmit={handleProvision} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                        <div style={{ background: '#3B82F620', color: '#60A5FA', padding: '10px 14px', borderRadius: '8px', fontSize: '12px', border: '1px solid #3B82F650' }}>
                            ✓ ESP32 Found from your network ({selectedDevice.publicIp})
                        </div>
                        <input style={inputStyle} placeholder="Device Name (e.g. Living Room Lights)" value={name}
                            onChange={e => setName(e.target.value)} required autoFocus />
                        <select style={inputStyle} value={roomId} onChange={e => setRoomId(e.target.value)}>
                            <option value="">— No Room —</option>
                            {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                        </select>
                        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '8px' }}>
                            <button type="button" style={cancelBtnStyle} onClick={() => { setSelectedDevice(null); setScanning(true); }}>Back</button>
                            <button type="submit" style={primaryBtnStyle} disabled={loading}>
                                {loading ? 'Provisioning...' : 'Complete Setup'}
                            </button>
                        </div>
                    </form>
                )}
            </div>
            <style>{`
                .spinner {
                    width: 18px; height: 18px;
                    border: 2px solid #374151; border-top-color: #3B82F6;
                    border-radius: 50%;
                    animation: spin 1s linear infinite;
                }
                @keyframes spin { to { transform: rotate(360deg); } }
            `}</style>
        </div>
    );
}

function EditDeviceModal({ device, rooms, onClose, onSuccess }) {
    const [name, setName] = useState(device.name || '');
    const [roomId, setRoomId] = useState(device.roomId || '');
    const [channelNames, setChannelNames] = useState(device.channelNames || []);
    const [loading, setLoading] = useState(false);

    const handleSave = async (e) => {
        e.preventDefault();
        setLoading(true);
        try {
            await updateDoc(doc(db, 'devices', device.id), { name: name.trim(), roomId: roomId || null, channelNames });
            onSuccess('Device updated!');
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    return (
        <div style={overlayStyle} onClick={onClose}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
                <h2 style={modalTitleStyle}>Edit Device</h2>
                <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <input style={inputStyle} placeholder="Device Name" value={name}
                        onChange={e => setName(e.target.value)} required />
                    <select style={inputStyle} value={roomId} onChange={e => setRoomId(e.target.value)}>
                        <option value="">— No Room —</option>
                        {rooms.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </select>
                    <div>
                        <p style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '8px' }}>Channel Names</p>
                        {channelNames.map((ch, i) => (
                            <input key={i} style={{ ...inputStyle, marginBottom: '8px' }}
                                placeholder={`Channel ${i + 1}`} value={ch}
                                onChange={e => {
                                    const u = [...channelNames]; u[i] = e.target.value; setChannelNames(u);
                                }} />
                        ))}
                    </div>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
                        <button type="button" style={cancelBtnStyle} onClick={onClose}>Cancel</button>
                        <button type="submit" style={primaryBtnStyle} disabled={loading}>
                            {loading ? 'Saving...' : 'Save Changes'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// ─── Main Page ──────────────────────────────────────
export default function DevicesPage() {
    const { user } = useAuth();
    const ws = useWebSocket();

    // localStates: { [deviceId]: bool[] } — updated optimistically + via WS push
    const [localStates, setLocalStates] = useState({});
    const [devices, setDevices] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [showAdd, setShowAdd] = useState(false);
    const [editDevice, setEditDevice] = useState(null);
    const [toast, setToast] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);
    const pendingRef = useRef(new Set()); // track in-flight API calls

    // ── Firestore real-time listeners ──
    useEffect(() => {
        if (!user) return;
        const qD = query(collection(db, 'devices'), where('userId', '==', user.uid));
        const unsubD = onSnapshot(qD, snap => {
            const devs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setDevices(devs);
            // Sync localStates for NEW devices only (don't overwrite in-flight changes)
            setLocalStates(prev => {
                const updated = { ...prev };
                devs.forEach(d => {
                    if (!updated[d.id]) {
                        updated[d.id] = d.channelStates || [];
                    }
                });
                return updated;
            });
        });

        const qR = query(collection(db, 'rooms'), where('userId', '==', user.uid));
        const unsubR = onSnapshot(qR, snap => setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

        return () => { unsubD(); unsubR(); };
    }, [user]);

    // ── WebSocket push: device_state_update ──
    // When ESP32 reports state OR another client toggles, update instantly
    useEffect(() => {
        if (!ws) return;
        const unsub = ws.subscribe('device_state_update', (msg) => {
            // Only update if not currently pending (avoid race with optimistic update)
            if (!pendingRef.current.has(msg.deviceId)) {
                setLocalStates(prev => ({
                    ...prev,
                    [msg.deviceId]: msg.channelStates,
                }));
            }
        });
        return unsub;
    }, [ws]);

    // ── WebSocket push: device_online / device_offline ──
    useEffect(() => {
        if (!ws) return;
        const onOnline = (msg) => setDevices(prev =>
            prev.map(d => d.id === msg.deviceId ? { ...d, status: 'online' } : d));
        const onOffline = (msg) => setDevices(prev =>
            prev.map(d => d.id === msg.deviceId ? { ...d, status: 'offline' } : d));

        const u1 = ws.subscribe('device_online', onOnline);
        const u2 = ws.subscribe('device_offline', onOffline);
        return () => { u1(); u2(); };
    }, [ws]);

    // ── Right Click Close ──
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    // ── Toggle channel — optimistic update ──
    const toggleChannel = useCallback(async (device, idx) => {
        const currentStates = localStates[device.id] || device.channelStates || [];
        const newStates = [...currentStates];
        newStates[idx] = !newStates[idx];

        // 1. Update UI immediately (optimistic)
        setLocalStates(prev => ({ ...prev, [device.id]: newStates }));
        pendingRef.current.add(device.id);

        try {
            // 2. Call backend API (also triggers MQTT → ESP32 in ~5ms)
            const res = await fetch(`${API}/api/devices/${device.id}/control`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    channel: idx,
                    action: newStates[idx] ? 'on' : 'off',
                }),
            });

            if (!res.ok) {
                // Revert optimistic update on failure
                setLocalStates(prev => ({ ...prev, [device.id]: currentStates }));
                setToast({ msg: 'Command failed', type: 'error' });
            }
        } catch (err) {
            // Network error — revert
            setLocalStates(prev => ({ ...prev, [device.id]: currentStates }));
            setToast({ msg: 'Network error', type: 'error' });
        } finally {
            pendingRef.current.delete(device.id);
        }
    }, [localStates]);

    const controlDeviceAll = async (deviceId, action) => {
        const device = devices.find(d => d.id === deviceId);
        if (!device) return;
        const numCh = device.channels || 1;
        const next = Array(numCh).fill(action === 'on');

        setLocalStates(prev => ({ ...prev, [deviceId]: next }));
        try {
            await fetch(`${API}/api/devices/${deviceId}/control-all`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            });
        } catch { }
    };

    const deleteDevice = async (id) => {
        if (!confirm('Delete this device?')) return;
        await deleteDoc(doc(db, 'devices', id));
        setLocalStates(prev => { const n = { ...prev }; delete n[id]; return n; });
        setToast({ msg: 'Device deleted.' });
    };

    const togglePin = async () => {
        if (!contextMenu) return;
        const { id, isPinned } = contextMenu.item;
        await updateDoc(doc(db, 'devices', id), { addToDashboard: !isPinned });
        setToast({ msg: !isPinned ? 'Pinned to Dashboard' : 'Unpinned from Dashboard' });
    };

    const getRoomName = (roomId) => rooms.find(r => r.id === roomId)?.name || null;

    return (
        <>
            <style>{`
                @keyframes fadeSlideIn {
                    from { opacity: 0; transform: translateY(8px); }
                    to   { opacity: 1; transform: translateY(0); }
                }
                .device-btn-fast {
                    transition: background 0.08s ease, transform 0.08s ease !important;
                }
                .device-btn-fast:active {
                    transform: scale(0.93) !important;
                }
            `}</style>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h1 className="page-title">Devices</h1>
                <button style={primaryBtnStyle} onClick={() => setShowAdd(true)}>+ Add Device</button>
            </div>
            <p style={{ color: '#9CA3AF', fontSize: '14px', marginBottom: '30px' }}>
                Right-click any device card to pin it to your Dashboard.
            </p>

            {devices.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>🔌</div>
                    <p style={{ color: '#9CA3AF', fontSize: '14px' }}>No devices yet. Add your first ESP32 device.</p>
                    <button style={{ ...primaryBtnStyle, marginTop: '16px' }} onClick={() => setShowAdd(true)}>
                        + Add Device
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    {devices.map(device => {
                        const states = localStates[device.id] || device.channelStates || [];
                        const isOnline = device.status === 'online';

                        return (
                            <div key={device.id} className="room-group-card" style={{ maxWidth: '700px' }}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    setContextMenu({ x: e.pageX, y: e.pageY, item: { id: device.id, isPinned: device.addToDashboard } });
                                }}>
                                {/* Header */}
                                <div className="room-group-header">
                                    <div>
                                        <div className="room-group-title" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                            {device.name}
                                            {device.addToDashboard && <span style={{ fontSize: '11px', background: 'var(--accent-cyan)', color: 'black', padding: '2px 6px', borderRadius: '4px' }}>Pinned</span>}
                                        </div>
                                        <div className="room-group-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                            {getRoomName(device.roomId) && <span>{getRoomName(device.roomId)}</span>}
                                            {getRoomName(device.roomId) && <span style={{ color: '#374151' }}>·</span>}
                                            {/* Live status dot */}
                                            <div style={{
                                                width: '7px', height: '7px', borderRadius: '50%',
                                                background: isOnline ? '#10B981' : '#6B7280',
                                                boxShadow: isOnline ? '0 0 0 2px rgba(16,185,129,0.25)' : 'none',
                                                transition: 'all 0.3s ease',
                                            }} />
                                            <span style={{ fontSize: '11px', color: isOnline ? '#10B981' : '#6B7280' }}>
                                                {isOnline ? 'Online' : 'Offline'}
                                            </span>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                        {device.channels > 1 && (
                                            <button
                                                style={{ background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                                                onClick={() => controlDeviceAll(device.id, states.some(s => s) ? 'off' : 'on')}
                                            >
                                                Master <PowerIcon size={14} />
                                            </button>
                                        )}
                                        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)' }} />
                                        <button style={iconBtnStyle} onClick={() => setEditDevice(device)} title="Edit">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                            </svg>
                                        </button>
                                        <button style={{ ...iconBtnStyle, color: '#EF4444' }} onClick={() => deleteDevice(device.id)} title="Delete">
                                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                <polyline points="3 6 5 6 21 6" />
                                                <path d="M19 6l-1 14H6L5 6" /><path d="M9 6V4h6v2" />
                                            </svg>
                                        </button>
                                    </div>
                                </div>

                                {/* Channel buttons */}
                                <div className="device-buttons-grid">
                                    {(device.channelNames || []).map((chName, idx) => {
                                        const isOn = states[idx] === true;
                                        return (
                                            <button
                                                key={idx}
                                                className={`device-btn device-btn-fast ${isOn ? 'active' : ''}`}
                                                onClick={() => toggleChannel(device, idx)}
                                                title={isOn ? 'Click to turn OFF' : 'Click to turn ON'}
                                            >
                                                <span className="device-btn-label">{chName}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Context Menu Dropdown */}
            {contextMenu && (
                <div style={{
                    position: 'absolute', top: contextMenu.y, left: contextMenu.x, zIndex: 1000,
                    background: '#1E2535', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.6)', padding: '6px', minWidth: '180px'
                }}>
                    <button
                        style={{ width: '100%', padding: '12px 14px', textAlign: 'left', background: 'transparent', border: 'none', color: '#CBD5E1', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}
                        onMouseOver={e => e.target.style.background = 'rgba(255,255,255,0.06)'}
                        onMouseOut={e => e.target.style.background = 'transparent'}
                        onClick={togglePin}
                    >
                        {contextMenu.item.isPinned ? 'Unpin from Dashboard' : 'Pin to Dashboard'}
                    </button>
                </div>
            )}

            {showAdd && (
                <AddDeviceModal userId={user.uid} rooms={rooms}
                    onClose={() => setShowAdd(false)}
                    onSuccess={(msg) => { setShowAdd(false); setToast({ msg }); }} />
            )}
            {editDevice && (
                <EditDeviceModal device={editDevice} rooms={rooms}
                    onClose={() => setEditDevice(null)}
                    onSuccess={(msg) => { setEditDevice(null); setToast({ msg }); }} />
            )}
            {toast && <Toast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />}
        </>
    );
}

// Shared styles
const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 };
const modalStyle = { background: '#1E2535', borderRadius: '12px', padding: '32px', width: '420px', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' };
const modalTitleStyle = { fontSize: '20px', fontWeight: '700', marginBottom: '22px', color: 'white' };
const inputStyle = { width: '100%', background: '#2F3947', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 14px', color: 'white', fontSize: '14px', outline: 'none' };
const primaryBtnStyle = { background: '#3B82F6', color: 'white', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', border: 'none' };
const cancelBtnStyle = { background: 'transparent', color: '#9CA3AF', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', border: '1px solid #374151' };
const iconBtnStyle = { background: 'transparent', color: '#9CA3AF', cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', padding: '4px' };
