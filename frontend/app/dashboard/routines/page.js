'use client';

import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase';
import {
    collection, query, where, onSnapshot,
    addDoc, updateDoc, deleteDoc, doc, serverTimestamp
} from 'firebase/firestore';
import { useEffect, useState } from 'react';

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function Toast({ message, onClose }) {
    useEffect(() => { const t = setTimeout(onClose, 3000); return () => clearTimeout(t); }, [onClose]);
    return (
        <div style={{
            position: 'fixed', bottom: '90px', right: '30px', background: '#16A34A',
            color: 'white', padding: '12px 20px', borderRadius: '8px',
            fontSize: '14px', zIndex: 1000, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
        }}>{message}</div>
    );
}

function RoutineModal({ userId, devices, existingRoutine, onClose, onSuccess }) {
    const [name, setName] = useState(existingRoutine?.name || '');
    const [time, setTime] = useState(existingRoutine?.time || '08:00');
    const [deviceId, setDeviceId] = useState(existingRoutine?.deviceId || '');
    const [channel, setChannel] = useState(existingRoutine?.channel ?? 0);
    const [action, setAction] = useState(existingRoutine?.action || 'on');
    const [days, setDays] = useState(existingRoutine?.days || ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']);
    const [loading, setLoading] = useState(false);

    const selectedDevice = devices.find(d => d.id === deviceId);

    const toggleDay = (day) =>
        setDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day]);

    const handleSave = async (e) => {
        e.preventDefault();
        if (!name.trim() || !deviceId) return;
        setLoading(true);
        try {
            const data = {
                userId, name: name.trim(), time, deviceId,
                channel: parseInt(channel), action, days,
                enabled: existingRoutine?.enabled ?? true,
            };
            if (existingRoutine) {
                await updateDoc(doc(db, 'routines', existingRoutine.id), data);
                onSuccess('Routine updated!');
            } else {
                await addDoc(collection(db, 'routines'), data);
                onSuccess('Routine created!');
            }
        } catch (err) { console.error(err); }
        setLoading(false);
    };

    return (
        <div style={overlayStyle} onClick={onClose}>
            <div style={modalStyle} onClick={e => e.stopPropagation()}>
                <h2 style={modalTitleStyle}>{existingRoutine ? 'Edit Routine' : 'Create New Routine'}</h2>
                <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                    <input style={inputStyle} placeholder="Routine Name (e.g. Morning Lights)"
                        value={name} onChange={e => setName(e.target.value)} required autoFocus />

                    <input type="time" style={inputStyle} value={time} onChange={e => setTime(e.target.value)} required />

                    <select style={inputStyle} value={deviceId}
                        onChange={e => { setDeviceId(e.target.value); setChannel(0); }} required>
                        <option value="">— Select Device —</option>
                        {devices.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                    </select>

                    {selectedDevice && selectedDevice.channels > 1 && (
                        <select style={inputStyle} value={channel} onChange={e => setChannel(e.target.value)}>
                            {Array.from({ length: selectedDevice.channels }, (_, i) => (
                                <option key={i} value={i}>
                                    {selectedDevice.channelNames?.[i] || `Channel ${i + 1}`}
                                </option>
                            ))}
                        </select>
                    )}

                    <select style={inputStyle} value={action} onChange={e => setAction(e.target.value)}>
                        <option value="on">Turn ON</option>
                        <option value="off">Turn OFF</option>
                        <option value="toggle">Toggle</option>
                    </select>

                    {/* Days picker */}
                    <div>
                        <p style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '8px' }}>Repeat on</p>
                        <div style={{ display: 'flex', gap: '6px' }}>
                            {DAYS.map(day => (
                                <button key={day} type="button"
                                    onClick={() => toggleDay(day)}
                                    style={{
                                        width: '36px', height: '36px', borderRadius: '8px',
                                        fontSize: '11px', fontWeight: '600', cursor: 'pointer',
                                        border: 'none',
                                        background: days.includes(day) ? '#3B82F6' : '#2F3947',
                                        color: days.includes(day) ? 'white' : '#9CA3AF',
                                    }}>
                                    {day[0]}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', marginTop: '4px' }}>
                        <button type="button" style={cancelBtnStyle} onClick={onClose}>Cancel</button>
                        <button type="submit" style={primaryBtnStyle} disabled={loading}>
                            {loading ? 'Saving...' : existingRoutine ? 'Save Changes' : '+ Create'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default function RoutinesPage() {
    const { user } = useAuth();
    const [routines, setRoutines] = useState([]);
    const [devices, setDevices] = useState([]);
    const [showAdd, setShowAdd] = useState(false);
    const [editRoutine, setEditRoutine] = useState(null);
    const [toast, setToast] = useState(null);
    const [contextMenu, setContextMenu] = useState(null);

    useEffect(() => {
        if (!user) return;
        const qR = query(collection(db, 'routines'), where('userId', '==', user.uid));
        const unsubR = onSnapshot(qR, snap =>
            setRoutines(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

        const qD = query(collection(db, 'devices'), where('userId', '==', user.uid));
        const unsubD = onSnapshot(qD, snap =>
            setDevices(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

        return () => { unsubR(); unsubD(); };
    }, [user]);

    // ── Right Click Close ──
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    const toggleEnabled = async (routine) => {
        await updateDoc(doc(db, 'routines', routine.id), { enabled: !routine.enabled });
    };

    const deleteRoutine = async (id) => {
        if (!confirm('Delete this routine?')) return;
        await deleteDoc(doc(db, 'routines', id));
        setToast({ msg: 'Routine deleted.' });
    };

    const togglePin = async () => {
        if (!contextMenu) return;
        const { id, isPinned } = contextMenu.item;
        await updateDoc(doc(db, 'routines', id), { addToDashboard: !isPinned });
        setToast({ msg: !isPinned ? 'Pinned to Dashboard' : 'Unpinned from Dashboard' });
    };

    const getDeviceName = (id) => devices.find(d => d.id === id)?.name || 'Unknown Device';
    const getChannelName = (routine) => {
        const dev = devices.find(d => d.id === routine.deviceId);
        return dev?.channelNames?.[routine.channel] || null;
    };

    // Format time to 12h
    const formatTime = (t) => {
        if (!t) return '';
        const [h, m] = t.split(':');
        const hour = parseInt(h);
        const ampm = hour >= 12 ? 'PM' : 'AM';
        return `${((hour % 12) || 12).toString().padStart(2, '0')}:${m} ${ampm}`;
    };

    return (
        <>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <h1 className="page-title">Routines</h1>
                <button style={primaryBtnStyle} onClick={() => setShowAdd(true)}>+ Create New Routine</button>
            </div>
            <p style={{ color: '#9CA3AF', fontSize: '14px', marginBottom: '30px' }}>
                Right-click any routine to pin it to your Dashboard.
            </p>

            {routines.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                    <div style={{ fontSize: '48px', marginBottom: '12px' }}>⏰</div>
                    <p style={{ color: '#9CA3AF', fontSize: '14px' }}>No routines yet. Automate your devices with schedules.</p>
                    <button style={{ ...primaryBtnStyle, marginTop: '16px' }} onClick={() => setShowAdd(true)}>
                        + Create New Routine
                    </button>
                </div>
            ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', maxWidth: '600px' }}>
                    {routines.map(routine => (
                        <div key={routine.id} style={{
                            background: '#222934', borderRadius: '12px', padding: '18px 20px',
                            display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                            opacity: routine.enabled ? 1 : 0.5,
                        }} onContextMenu={(e) => {
                            e.preventDefault();
                            setContextMenu({ x: e.pageX, y: e.pageY, item: { id: routine.id, isPinned: routine.addToDashboard } });
                        }}>
                            <div style={{ flex: 1 }}>
                                <div style={{ fontWeight: '600', fontSize: '16px', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                    {routine.name}
                                    {routine.addToDashboard && <span style={{ fontSize: '11px', background: 'var(--accent-cyan)', color: 'black', padding: '2px 6px', borderRadius: '4px' }}>Pinned</span>}
                                </div>
                                <div style={{ fontSize: '12px', display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                    <span style={{ color: '#60A5FA' }}>{formatTime(routine.time)}</span>
                                    <span style={{ color: '#9CA3AF' }}>
                                        {routine.days?.length === 7 ? 'Everyday'
                                            : routine.days?.length === 0 ? 'No days'
                                                : routine.days?.join(', ')}
                                    </span>
                                </div>
                                <div style={{ fontSize: '12px', color: '#9CA3AF', marginTop: '4px' }}>
                                    {getDeviceName(routine.deviceId)}
                                    {getChannelName(routine) && ` › ${getChannelName(routine)}`}
                                    {' → '}
                                    <strong style={{ color: routine.action === 'on' ? '#10B981' : routine.action === 'off' ? '#EF4444' : '#F59E0B' }}>
                                        {routine.action?.toUpperCase()}
                                    </strong>
                                </div>
                            </div>

                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                                {/* Toggle enabled */}
                                <button onClick={() => toggleEnabled(routine)} title={routine.enabled ? 'Disable' : 'Enable'}
                                    style={{
                                        width: '36px', height: '20px', borderRadius: '999px', border: 'none',
                                        cursor: 'pointer', position: 'relative',
                                        background: routine.enabled ? '#3B82F6' : '#374151',
                                    }}>
                                    <div style={{
                                        position: 'absolute', top: '3px',
                                        left: routine.enabled ? '19px' : '3px',
                                        width: '14px', height: '14px', borderRadius: '50%',
                                        background: 'white', transition: 'left 0.2s',
                                    }} />
                                </button>
                                <button style={iconBtnStyle} onClick={() => setEditRoutine(routine)} title="Edit">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                                    </svg>
                                </button>
                                <button style={{ ...iconBtnStyle, color: '#EF4444' }} onClick={() => deleteRoutine(routine.id)} title="Delete">
                                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polyline points="3 6 5 6 21 6" />
                                        <path d="M19 6l-1 14H6L5 6" />
                                        <path d="M9 6V4h6v2" />
                                    </svg>
                                </button>
                            </div>
                        </div>
                    ))}
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
                <RoutineModal userId={user.uid} devices={devices}
                    onClose={() => setShowAdd(false)}
                    onSuccess={(msg) => { setShowAdd(false); setToast({ msg }); }} />
            )}
            {editRoutine && (
                <RoutineModal userId={user.uid} devices={devices} existingRoutine={editRoutine}
                    onClose={() => setEditRoutine(null)}
                    onSuccess={(msg) => { setEditRoutine(null); setToast({ msg }); }} />
            )}

            {toast && <Toast message={toast.msg} onClose={() => setToast(null)} />}
        </>
    );
}

const overlayStyle = {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200,
};
const modalStyle = {
    background: '#1E2535', borderRadius: '12px', padding: '32px',
    width: '420px', boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
    maxHeight: '85vh', overflowY: 'auto',
};
const modalTitleStyle = { fontSize: '20px', fontWeight: '700', marginBottom: '22px', color: 'white' };
const inputStyle = {
    width: '100%', background: '#2F3947', border: '1px solid rgba(255,255,255,0.08)',
    borderRadius: '8px', padding: '10px 14px', color: 'white', fontSize: '14px', outline: 'none',
};
const primaryBtnStyle = {
    background: '#3B82F6', color: 'white', padding: '10px 20px',
    borderRadius: '8px', fontSize: '14px', fontWeight: '600', cursor: 'pointer', border: 'none',
};
const cancelBtnStyle = {
    background: 'transparent', color: '#9CA3AF', padding: '10px 20px',
    borderRadius: '8px', fontSize: '14px', cursor: 'pointer', border: '1px solid #374151',
};
const iconBtnStyle = {
    background: 'transparent', color: '#9CA3AF', cursor: 'pointer',
    border: 'none', display: 'flex', alignItems: 'center', padding: '4px',
};
