'use client';

import { useAuth } from '@/lib/AuthContext';
import { useWebSocket } from '@/lib/WebSocketContext';
import { db } from '@/lib/firebase';
import {
    collection, query, where, onSnapshot,
    addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from 'firebase/firestore';
import { useEffect, useState, useCallback, useRef } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
const ROOM_ICONS = ['🏠', '🛋️', '🛏️', '🍳', '🚿', '🌿', '🎮', '📚', '🏋️', '🚗'];

function PowerIcon({ size = 24, color = 'currentColor' }) {
    return (
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
            stroke={color} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ overflow: 'visible' }}>
            <path d="M18.36 6.64A9 9 0 1 1 5.64 6.64" />
            <path d="M12 2v10" />
        </svg>
    );
}

function Toast({ message, onClose }) {
    useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
    return (
        <div style={{
            position: 'fixed', bottom: '90px', right: '30px',
            background: '#16A34A', color: 'white', padding: '12px 20px',
            borderRadius: '8px', fontSize: '14px', zIndex: 1000,
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>{message}</div>
    );
}

function RoomModal({ userId, existingRoom, onClose, onSuccess }) {
    const [name, setName] = useState(existingRoom?.name || '');
    const [icon, setIcon] = useState(existingRoom?.icon || '🏠');
    const [loading, setLoading] = useState(false);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!name.trim()) return;
        setLoading(true);
        try {
            if (existingRoom) {
                await updateDoc(doc(db, 'rooms', existingRoom.id), { name: name.trim(), icon });
                onSuccess('Room updated!');
            } else {
                await addDoc(collection(db, 'rooms'), {
                    userId, name: name.trim(), icon, addToDashboard: false,
                    createdAt: serverTimestamp(),
                });
                onSuccess('Room created!');
            }
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    return (
        <div style={overlayStyle} onClick={onClose}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
                <h2 style={modalTitleStyle}>{existingRoom ? 'Edit Room' : 'Add Room'}</h2>
                <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                    <input style={inputStyle} placeholder="Room Name (e.g. Living Room)"
                        value={name} onChange={e => setName(e.target.value)} required autoFocus />
                    <div>
                        <p style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '10px' }}>Choose Icon</p>
                        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                            {ROOM_ICONS.map(ic => (
                                <button key={ic} type="button" onClick={() => setIcon(ic)}
                                    style={{
                                        fontSize: '22px', width: '44px', height: '44px',
                                        borderRadius: '8px', border: 'none', cursor: 'pointer',
                                        background: ic === icon ? '#3B82F6' : '#2F3947',
                                    }}>
                                    {ic}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
                        <button type="button" style={cancelBtnStyle} onClick={onClose}>Cancel</button>
                        <button type="submit" style={primaryBtnStyle} disabled={loading}>
                            {loading ? 'Saving...' : existingRoom ? 'Save Changes' : '+ Add Room'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function RoomsPage() {
    const { user } = useAuth();
    const ws = useWebSocket();

    const [rooms, setRooms] = useState([]);
    const [devices, setDevices] = useState([]);
    const [localStates, setLocalStates] = useState({});

    const [showAdd, setShowAdd] = useState(false);
    const [editRoom, setEditRoom] = useState(null);
    const [toast, setToast] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);

    // ── Firestore Listeners ──
    useEffect(() => {
        if (!user) return;
        const qRooms = query(collection(db, 'rooms'), where('userId', '==', user.uid));
        const unsubRooms = onSnapshot(qRooms, snap =>
            setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

        const qDev = query(collection(db, 'devices'), where('userId', '==', user.uid));
        const unsubDev = onSnapshot(qDev, snap => {
            const devs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            setDevices(devs);
            setLocalStates(prev => {
                const n = { ...prev };
                devs.forEach(d => { if (!n[d.id]) n[d.id] = d.channelStates || []; });
                return n;
            });
        });

        return () => { unsubRooms(); unsubDev(); };
    }, [user]);

    // ── WebSocket push sync ──
    useEffect(() => {
        if (!ws) return;
        const u1 = ws.subscribe('device_state_update', (msg) => {
            setLocalStates(prev => ({ ...prev, [msg.deviceId]: msg.channelStates }));
        });
        const u2 = ws.subscribe('device_online', (msg) => {
            setDevices(prev => prev.map(d => d.id === msg.deviceId ? { ...d, status: 'online' } : d));
        });
        const u3 = ws.subscribe('device_offline', (msg) => {
            setDevices(prev => prev.map(d => d.id === msg.deviceId ? { ...d, status: 'offline' } : d));
        });
        return () => { u1(); u2(); u3(); };
    }, [ws]);

    // ── Right Click Close Listener ──
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    // ── Controls ──
    // Strategy: send via WebSocket (fast) AND HTTP (reliable backup) in parallel
    const toggleChannel = useCallback(async (device, idx) => {
        const curr = localStates[device.id] || device.channelStates || [];
        const next = [...curr];
        next[idx] = !next[idx];
        setLocalStates(prev => ({ ...prev, [device.id]: next }));

        const action = next[idx] ? 'on' : 'off';

        // Fast path: WebSocket
        if (ws?.isConnected) {
            ws.send({ type: 'control', deviceId: device.id, channel: idx, action });
        }

        // Reliable backup: HTTP (fire-and-forget)
        fetch(`${API}/api/devices/${device.id}/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: idx, action }),
        }).catch(() => {
            if (!ws?.isConnected) {
                setLocalStates(prev => ({ ...prev, [device.id]: curr }));
            }
        });
    }, [localStates, ws]);

    const controlDeviceAll = async (deviceId, action) => {
        const device = devices.find(d => d.id === deviceId);
        if (!device) return;
        const numCh = device.channels || 1;
        const next = Array(numCh).fill(action === 'on');

        setLocalStates(prev => ({ ...prev, [deviceId]: next }));

        // Fast path: WebSocket
        if (ws?.isConnected) {
            ws.send({ type: 'control_all', deviceId, action, numChannels: numCh });
        }

        // Reliable backup: HTTP
        fetch(`${API}/api/devices/${deviceId}/control-all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action }),
        }).catch(() => {});
    };

    const controlRoomAll = async (roomId, action) => {
        const roomDevices = devices.filter(d => d.roomId === roomId);
        for (const d of roomDevices) {
            controlDeviceAll(d.id, action);
        }
    };

    const deleteRoom = async (id) => {
        if (!confirm('Delete this room? Devices will become unassigned.')) return;
        const roomDevices = devices.filter(d => d.roomId === id);
        await Promise.all(roomDevices.map(d => updateDoc(doc(db, 'devices', d.id), { roomId: null })));
        await deleteDoc(doc(db, 'rooms', id));
        setToast({ msg: 'Room deleted.' });
    };

    const togglePin = async () => {
        if (!contextMenu) return;
        const { id, isPinned } = contextMenu.item;
        await updateDoc(doc(db, 'rooms', id), { addToDashboard: !isPinned });
        setToast({ msg: !isPinned ? 'Pinned to Dashboard' : 'Unpinned from Dashboard' });
    };

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
                <h1 className="page-title">Rooms</h1>
                <button style={primaryBtnStyle} onClick={() => setShowAdd(true)}>+ Add Room</button>
            </div>
            <p style={{ color: '#9CA3AF', fontSize: '14px', marginBottom: '20px' }}>
                Right-click any room to pin it to your Dashboard.
            </p>

            {rooms.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>🏠</div>
                    <p style={{ color: '#9CA3AF', fontSize: '14px' }}>No rooms yet. Create your first room.</p>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                    {rooms.map(room => {
                        const roomDevices = devices.filter(d => d.roomId === room.id);
                        return (
                            <div key={room.id} className="room-group-card" style={{ maxWidth: '1000px', margin: 0 }}
                                onContextMenu={(e) => {
                                    e.preventDefault();
                                    setContextMenu({ x: e.pageX, y: e.pageY, item: { id: room.id, isPinned: room.addToDashboard } });
                                }}>
                                {/* Room Header */}
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '16px', marginBottom: '20px' }}>
                                    <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                                        <div style={{ fontSize: '32px' }}>{room.icon || '🏠'}</div>
                                        <div>
                                            <div style={{ fontWeight: '700', fontSize: '20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                {room.name}
                                                {room.addToDashboard && <span style={{ fontSize: '12px', background: 'var(--accent-blue)', padding: '2px 6px', borderRadius: '4px' }}>Pinned</span>}
                                            </div>
                                            <div style={{ color: '#9CA3AF', fontSize: '12px', marginTop: '4px' }}>
                                                {roomDevices.length} device{roomDevices.length !== 1 ? 's' : ''}
                                            </div>
                                        </div>
                                    </div>
                                    <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                        <button style={{ ...primaryBtnStyle, background: 'rgba(239, 68, 68, 0.2)', color: '#EF4444' }} onClick={() => controlRoomAll(room.id, 'off')}>All Off</button>
                                        <button style={{ ...primaryBtnStyle, background: 'rgba(16, 185, 129, 0.2)', color: '#10B981' }} onClick={() => controlRoomAll(room.id, 'on')}>All On</button>
                                        <div style={{ width: '1px', height: '20px', background: 'rgba(255,255,255,0.1)', margin: '0 8px' }} />
                                        <button style={iconBtnStyle} onClick={() => setEditRoom(room)} title="Edit"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg></button>
                                        <button style={{ ...iconBtnStyle, color: '#EF4444' }} onClick={() => deleteRoom(room.id)} title="Delete"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14H6L5 6" /><path d="M9 6V4h6v2" /></svg></button>
                                    </div>
                                </div>

                                {/* Room Devices */}
                                {roomDevices.length === 0 ? (
                                    <div style={{ color: '#6B7280', fontSize: '13px' }}>No devices in this room.</div>
                                ) : (
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                                        {roomDevices.map(device => {
                                            const states = localStates[device.id] || device.channelStates || [];
                                            const isOnline = device.status === 'online';
                                            return (
                                                <div key={device.id} style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.03)' }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                                                            <div className={isOnline ? 'dot-online' : 'dot-offline'} />
                                                            <div style={{ fontWeight: '600', fontSize: '14px' }}>{device.name}</div>
                                                        </div>
                                                        {device.channels > 1 && (
                                                            <button
                                                                style={{ background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                                                                onClick={() => controlDeviceAll(device.id, states.some(s => s) ? 'off' : 'on')}
                                                            >
                                                                Master <PowerIcon size={14} />
                                                            </button>
                                                        )}
                                                    </div>
                                                    <div className="device-buttons-grid">
                                                        {(device.channelNames || []).map((chName, idx) => {
                                                            const isOn = states[idx] === true;
                                                            return (
                                                                <button
                                                                    key={idx}
                                                                    className={`device-btn ${isOn ? 'active' : ''}`}
                                                                    onClick={() => toggleChannel(device, idx)}
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
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Context Menu Dropdown */}
            {contextMenu && (
                <div style={{
                    position: 'absolute', top: contextMenu.y, left: contextMenu.x, zIndex: 1000,
                    background: '#1E2535', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '8px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.5)', padding: '6px', minWidth: '160px'
                }}>
                    <button
                        style={{ width: '100%', padding: '10px 12px', textAlign: 'left', background: 'transparent', border: 'none', color: 'white', borderRadius: '4px', cursor: 'pointer' }}
                        onMouseOver={e => e.target.style.background = 'var(--accent-blue)'}
                        onMouseOut={e => e.target.style.background = 'transparent'}
                        onClick={togglePin}
                    >
                        {contextMenu.item.isPinned ? 'Unpin from Dashboard' : 'Pin to Dashboard'}
                    </button>
                </div>
            )}

            {showAdd && <RoomModal userId={user.uid} onClose={() => setShowAdd(false)} onSuccess={(msg) => { setShowAdd(false); setToast({ msg }); }} />}
            {editRoom && <RoomModal userId={user.uid} existingRoom={editRoom} onClose={() => setEditRoom(null)} onSuccess={(msg) => { setEditRoom(null); setToast({ msg }); }} />}
            {toast && <Toast message={toast.msg} onClose={() => setToast(null)} />}
        </>
    );
}

const overlayStyle = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 };
const modalStyle = { background: '#1E2535', borderRadius: '12px', padding: '32px', width: '400px', boxShadow: '0 25px 50px rgba(0,0,0,0.5)' };
const modalTitleStyle = { fontSize: '20px', fontWeight: '700', marginBottom: '22px', color: 'white' };
const inputStyle = { width: '100%', background: '#2F3947', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '8px', padding: '10px 14px', color: 'white', fontSize: '14px', outline: 'none' };
const primaryBtnStyle = { background: '#3B82F6', color: 'white', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', border: 'none' };
const cancelBtnStyle = { background: 'transparent', color: '#9CA3AF', padding: '10px 20px', borderRadius: '8px', fontSize: '14px', cursor: 'pointer', border: '1px solid #374151' };
const iconBtnStyle = { background: 'transparent', color: '#9CA3AF', cursor: 'pointer', border: 'none', display: 'flex', alignItems: 'center', padding: '4px' };
