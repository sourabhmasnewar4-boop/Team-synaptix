'use client';

import { useAuth } from '@/lib/AuthContext';
import { useWebSocket } from '@/lib/WebSocketContext';
import { db } from '@/lib/firebase';
import { collection, query, where, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { useEffect, useState, useCallback, useRef } from 'react';

import { DndContext, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, rectSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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

// ── Smart Display Widgets (Clock & Weather) ──
function SmartDisplayHeader() {
    const [time, setTime] = useState(new Date());
    const [weather, setWeather] = useState({ temp: '--', condition: 'Fetching...' });

    // Clock
    useEffect(() => {
        const timer = setInterval(() => setTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    // Weather Fetch (using free open-meteo without API key)
    useEffect(() => {
        // Simple fallback to a general location (e.g., New Delhi if IP geoloc fails, but let's try to grab browser's location later. Using a fixed default for now to guarantee no errors).
        navigator.geolocation.getCurrentPosition(
            (pos) => fetchWeather(pos.coords.latitude, pos.coords.longitude),
            () => fetchWeather(28.61, 77.20) // Default to New Delhi
        );

        async function fetchWeather(lat, lon) {
            try {
                const res = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
                const data = await res.json();
                if (data && data.current_weather) {
                    const temp = Math.round(data.current_weather.temperature);
                    const code = data.current_weather.weathercode;
                    // Simple WMO weather code mapping
                    const isClear = code <= 1;
                    const isCloudy = code > 1 && code <= 3;
                    let cond = isClear ? '☀️ Clear' : isCloudy ? '☁️ Cloudy' : '🌧️ Rain/Storm';
                    setWeather({ temp: `${temp}°C`, condition: cond });
                }
            } catch (err) {
                setWeather({ temp: '--', condition: 'Offline' });
            }
        }
    }, []);

    const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const dateStr = time.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });

    return (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', padding: '24px 32px', background: 'rgba(0, 0, 0, 0.4)', backdropFilter: 'blur(24px)', borderRadius: '24px', border: '1px solid rgba(255, 255, 255, 0.1)', boxShadow: '0 20px 40px rgba(0,0,0,0.5)' }}>
            <div>
                <div style={{ fontSize: '48px', fontWeight: '800', letterSpacing: '-1px', color: 'white', lineHeight: '1' }}>{timeStr}</div>
                <div style={{ fontSize: '18px', color: '#9CA3AF', marginTop: '6px', fontWeight: '500' }}>{dateStr}</div>
            </div>
            <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '36px', fontWeight: '700', color: 'white', lineHeight: '1' }}>{weather.temp}</div>
                <div style={{ fontSize: '18px', color: '#60A5FA', marginTop: '6px', fontWeight: '600' }}>{weather.condition}</div>
            </div>
        </div>
    );
}

// ── Draggable Device Card Component ──
function SortableDeviceCard({ device, localStates, toggleChannel, getRoomName, controlDeviceAll }) {
    const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: device.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.7 : 1,
        zIndex: isDragging ? 100 : 1,
        cursor: isDragging ? 'grabbing' : 'grab',
    };

    const states = localStates[device.id] || device.channelStates || [];
    const isOnline = device.status === 'online';

    return (
        <div ref={setNodeRef} {...attributes} {...listeners} className="room-group-card" style={{ ...style, minWidth: '300px', margin: 0 }}>
            <div className="room-group-header" style={{ marginBottom: '16px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <svg viewBox="0 0 24 24" style={{ width: '16px', fill: '#9CA3AF', cursor: 'grab' }}>
                        <path d="M11 18c0 1.1-.9 2-2 2s-2-.9-2-2 .9-2 2-2 2 .9 2 2zm-2-8c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0-6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm6 4c1.1 0 2-.9 2-2s-.9-2-2-2-2 .9-2 2 .9 2 2zm0 2c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2zm0 6c-1.1 0-2 .9-2 2s.9 2 2 2 2-.9 2-2-.9-2-2-2z" />
                    </svg>
                    <div>
                        <div className="room-group-title">{device.name}</div>
                        <div className="room-group-subtitle" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            {getRoomName(device.roomId) && <span>{getRoomName(device.roomId)}</span>}
                            <div className={isOnline ? 'dot-online' : 'dot-offline'} />
                            <span style={{ fontSize: '11px', color: isOnline ? '#10B981' : '#6B7280' }}>
                                {isOnline ? 'Online' : 'Offline'}
                            </span>
                        </div>
                    </div>
                </div>
                {device.channels > 1 && (
                    <button
                        style={{ background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', fontSize: '12px' }}
                        onPointerDown={e => { e.stopPropagation(); controlDeviceAll(device.id, states.some(s => s) ? 'off' : 'on'); }}
                    >
                        Master <PowerIcon size={14} />
                    </button>
                )}
            </div>
            {/* onPointerDown stops the drag from stealing the button click */}
            <div className="device-buttons-grid" onPointerDown={(e) => e.stopPropagation()}>
                {(device.channelNames || []).map((chName, idx) => {
                    const isOn = states[idx] === true;
                    return (
                        <button
                            key={idx}
                            className={`device-btn ${isOn ? 'active' : ''}`}
                            onClick={(e) => { e.stopPropagation(); toggleChannel(device, idx); }}
                        >
                            <span className="device-btn-label">{chName}</span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

export default function DashboardPage() {
    const { user } = useAuth();
    const ws = useWebSocket();

    const [devices, setDevices] = useState([]);
    const [rooms, setRooms] = useState([]);
    const [routines, setRoutines] = useState([]);
    const [localStates, setLocalStates] = useState({});

    const [showSmartWidget, setShowSmartWidget] = useState(true);

    // Right click menu state
    const [contextMenu, setContextMenu] = useState(null);

    useEffect(() => {
        const saved = localStorage.getItem('showSmartWidget');
        if (saved !== null) {
            setShowSmartWidget(saved === 'true');
        }
    }, []);

    // Sensor for Drag and Drop
    const sensors = useSensors(
        useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
    );

    // ── Firestore listeners ──
    useEffect(() => {
        if (!user) return;
        const qD = query(collection(db, 'devices'), where('userId', '==', user.uid));
        const unsubD = onSnapshot(qD, snap => {
            const devs = snap.docs.map(d => ({ id: d.id, ...d.data() }));
            devs.sort((a, b) => (a.dashboardOrder || 0) - (b.dashboardOrder || 0));
            setDevices(devs);
            setLocalStates(prev => {
                const n = { ...prev };
                devs.forEach(d => { if (!n[d.id]) n[d.id] = d.channelStates || []; });
                return n;
            });
        });

        const qR = query(collection(db, 'rooms'), where('userId', '==', user.uid));
        const unsubR = onSnapshot(qR, snap => setRooms(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

        const qRo = query(collection(db, 'routines'), where('userId', '==', user.uid));
        const unsubRo = onSnapshot(qRo, snap => setRoutines(snap.docs.map(d => ({ id: d.id, ...d.data() }))));

        return () => { unsubD(); unsubR(); unsubRo(); };
    }, [user]);

    // ── WebSocket: real-time state push ──
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

    // Close right click menu
    useEffect(() => {
        const handleClick = () => setContextMenu(null);
        window.addEventListener('click', handleClick);
        return () => window.removeEventListener('click', handleClick);
    }, []);

    // ── Optimistic toggle ──
    // Strategy: send via WebSocket (fast, ~10ms) AND HTTP in parallel (reliable backup)
    // WebSocket gets the relay switching fast; HTTP guarantees delivery if WS/MQTT has issues
    const toggleChannel = useCallback(async (device, idx) => {
        const curr = localStates[device.id] || device.channelStates || [];
        const next = [...curr];
        next[idx] = !next[idx];
        // Instant optimistic UI update
        setLocalStates(prev => ({ ...prev, [device.id]: next }));

        const action = next[idx] ? 'on' : 'off';

        // Fast path: WebSocket (if connected)
        if (ws?.isConnected) {
            ws.send({ type: 'control', deviceId: device.id, channel: idx, action });
        }

        // Reliable backup: always also send via HTTP (fire-and-forget, non-blocking)
        fetch(`${API}/api/devices/${device.id}/control`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ channel: idx, action }),
        }).catch(() => {
            // Only revert if HTTP also fails (WS alone was the command)
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

        // Reliable backup: HTTP (fire-and-forget)
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

    const getRoomName = (roomId) => rooms.find(r => r.id === roomId)?.name || null;
    const formatTime = (t) => {
        if (!t) return '';
        const [h, m] = t.split(':');
        const hour = parseInt(h);
        return `${((hour % 12) || 12).toString().padStart(2, '0')}:${m} ${hour >= 12 ? 'PM' : 'AM'}`;
    };

    // ── Drag & Drop Handlers ──
    const handleDragEnd = async (event) => {
        const { active, over } = event;
        if (active.id !== over.id) {
            // We only reorder pinned devices right now (rooms could also be ordered, but we'll stick to devices for simplicity)
            const oldIndex = devices.findIndex(d => d.id === active.id);
            const newIndex = devices.findIndex(d => d.id === over.id);
            const reordered = arrayMove(devices, oldIndex, newIndex);
            setDevices(reordered);

            reordered.forEach(async (dev, index) => {
                if (dev.dashboardOrder !== index) {
                    await updateDoc(doc(db, 'devices', dev.id), { dashboardOrder: index });
                }
            });
        }
    };

    const handleUnpin = async () => {
        if (!contextMenu) return;
        if (contextMenu.item.type === 'widget') {
            setShowSmartWidget(false);
            localStorage.setItem('showSmartWidget', 'false');
            setContextMenu(null);
            return;
        }

        const { collectionName, id } = contextMenu.item;
        await updateDoc(doc(db, collectionName, id), { addToDashboard: false });
        setContextMenu(null);
    };

    // ── Filter Pinned Only ──
    const pinnedDevices = devices.filter(d => d.addToDashboard);
    const pinnedRooms = rooms.filter(r => r.addToDashboard);
    const pinnedRoutines = routines.filter(r => r.addToDashboard);

    const hasNoPins = pinnedDevices.length === 0 && pinnedRooms.length === 0 && pinnedRoutines.length === 0;

    return (
        <div
            style={{ minHeight: '100vh', width: '100%' }}
            onContextMenu={(e) => {
                e.preventDefault();
                setContextMenu({ x: e.pageX, y: e.pageY, emptyCanvasClick: true });
            }}
            onClick={(e) => {
                if (hasNoPins) {
                    e.preventDefault();
                    setContextMenu({ x: e.pageX, y: e.pageY, emptyCanvasClick: true });
                }
            }}
        >
            {hasNoPins ? (
                <div style={{ position: 'absolute', inset: 0, zIndex: 10, cursor: 'context-menu' }} />
            ) : (
                <>
                    {/* ── SMART WIDGETS ── */}
                    {showSmartWidget && (
                        <div
                            style={{ maxWidth: '1000px', margin: '0 auto 40px auto' }}
                            onContextMenu={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setContextMenu({ x: e.pageX, y: e.pageY, item: { type: 'widget' } });
                            }}
                        >
                            <SmartDisplayHeader />
                        </div>
                    )}

                    {/* ── PINNED ROOMS ── */}
                    {pinnedRooms.length > 0 && (
                        <div style={{ marginBottom: '40px' }}>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '30px' }}>
                                {pinnedRooms.map(room => {
                                    const roomDevices = devices.filter(d => d.roomId === room.id);
                                    return (
                                        <div key={room.id} className="room-group-card" style={{ maxWidth: '1000px', margin: 0 }}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setContextMenu({ x: e.pageX, y: e.pageY, item: { id: room.id, collectionName: 'rooms' } });
                                            }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', borderBottom: '1px solid rgba(255,255,255,0.08)', paddingBottom: '16px', marginBottom: '20px' }}>
                                                <div style={{ display: 'flex', gap: '14px', alignItems: 'center' }}>
                                                    <div style={{ fontSize: '32px' }}>{room.icon || '🏠'}</div>
                                                    <div>
                                                        <div style={{ fontWeight: '700', fontSize: '20px' }}>{room.name}</div>
                                                        <div style={{ color: '#9CA3AF', fontSize: '12px', marginTop: '4px' }}>
                                                            {roomDevices.length} device{roomDevices.length !== 1 ? 's' : ''}
                                                        </div>
                                                    </div>
                                                </div>
                                                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                                                    <button style={{ background: 'rgba(239, 68, 68, 0.2)', color: '#EF4444', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }} onClick={() => controlRoomAll(room.id, 'off')}>All Off</button>
                                                    <button style={{ background: 'rgba(16, 185, 129, 0.2)', color: '#10B981', border: 'none', padding: '8px 16px', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }} onClick={() => controlRoomAll(room.id, 'on')}>All On</button>
                                                </div>
                                            </div>

                                            {roomDevices.length === 0 ? (
                                                <div style={{ color: '#6B7280', fontSize: '13px' }}>No devices in this room.</div>
                                            ) : (
                                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
                                                    {roomDevices.map(device => {
                                                        const states = localStates[device.id] || device.channelStates || [];
                                                        return (
                                                            <div key={device.id} style={{ background: 'rgba(0,0,0,0.2)', padding: '16px', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.03)' }}>
                                                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                                                                    <div style={{ fontWeight: '600', fontSize: '14px' }}>{device.name}</div>
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
                                                                            <button key={idx} className={`device-btn ${isOn ? 'active' : ''}`} onClick={() => toggleChannel(device, idx)}>
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
                        </div>
                    )}

                    {/* ── PINNED DEVICES ── */}
                    {pinnedDevices.length > 0 && (
                        <div style={{ marginBottom: '40px' }}>
                            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
                                <SortableContext items={pinnedDevices.map(d => d.id)} strategy={rectSortingStrategy}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px', alignItems: 'flex-start' }}>
                                        {pinnedDevices.map(device => (
                                            <div key={device.id} onContextMenu={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setContextMenu({ x: e.pageX, y: e.pageY, item: { id: device.id, collectionName: 'devices' } });
                                            }}>
                                                <SortableDeviceCard
                                                    device={device}
                                                    localStates={localStates}
                                                    toggleChannel={toggleChannel}
                                                    getRoomName={getRoomName}
                                                    controlDeviceAll={controlDeviceAll}
                                                />
                                            </div>
                                        ))}
                                    </div>
                                </SortableContext>
                            </DndContext>
                        </div>
                    )}

                    {/* ── PINNED ROUTINES ── */}
                    {pinnedRoutines.length > 0 && (
                        <div>
                            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px' }}>
                                {pinnedRoutines.map(routine => {
                                    const dev = devices.find(d => d.id === routine.deviceId);
                                    const chName = dev?.channelNames?.[routine.channel];
                                    return (
                                        <div key={routine.id} className="room-group-card" style={{ padding: '20px', margin: 0, gap: '12px', minWidth: '280px' }}
                                            onContextMenu={(e) => {
                                                e.preventDefault();
                                                e.stopPropagation();
                                                setContextMenu({ x: e.pageX, y: e.pageY, item: { id: routine.id, collectionName: 'routines' } });
                                            }}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                                <div style={{ fontWeight: '700', fontSize: '18px' }}>{routine.name}</div>
                                                <span style={{ color: 'var(--accent-cyan)', fontWeight: '600', fontSize: '16px' }}>{formatTime(routine.time)}</span>
                                            </div>
                                            <div style={{ fontSize: '13px', color: '#9CA3AF' }}>
                                                {routine.days?.length === 7 ? 'Everyday'
                                                    : routine.days?.length === 0 ? 'No schedule'
                                                        : routine.days?.join(', ')}
                                            </div>
                                            <div style={{ fontSize: '14px', color: '#E5E7EB', marginTop: '6px', background: 'rgba(255,255,255,0.05)', padding: '10px 14px', borderRadius: '12px' }}>
                                                {dev?.name}{chName ? ` › ${chName}` : ''}{' '}
                                                <span style={{ marginLeft: '6px', fontWeight: '800', color: routine.action === 'on' ? 'var(--accent-cyan)' : '#EF4444' }}>
                                                    {routine.action?.toUpperCase()}
                                                </span>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Unpin/Add Context Menu */}
            {contextMenu && !contextMenu.emptyCanvasClick && (
                <div style={{
                    position: 'absolute', top: contextMenu.y, left: contextMenu.x, zIndex: 1000,
                    background: '#1E2535', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.6)', padding: '6px', minWidth: '180px'
                }}>
                    <button
                        style={{ width: '100%', padding: '12px 14px', textAlign: 'left', background: 'transparent', border: 'none', color: '#EF4444', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}
                        onMouseOver={e => e.target.style.background = 'rgba(239, 68, 68, 0.1)'}
                        onMouseOut={e => e.target.style.background = 'transparent'}
                        onClick={handleUnpin}
                    >
                        Remove from Dashboard
                    </button>
                </div>
            )}

            {/* Empty Canvas Context Menu */}
            {contextMenu && contextMenu.emptyCanvasClick && (
                <div style={{
                    position: 'absolute', top: contextMenu.y, left: contextMenu.x, zIndex: 1000,
                    background: 'rgba(10,5,25,0.8)', backdropFilter: 'blur(20px)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px',
                    boxShadow: '0 8px 32px rgba(0,0,0,0.6)', padding: '6px', minWidth: '180px', display: 'flex', flexDirection: 'column', gap: '4px'
                }}>
                    <div style={{ fontSize: '11px', color: '#9CA3AF', padding: '8px 14px', textTransform: 'uppercase', fontWeight: 'bold' }}>Add to Dashboard</div>
                    <button
                        onClick={(e) => { e.stopPropagation(); window.location.href = '/dashboard/devices'; }}
                        style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'transparent', border: 'none', color: '#F3F4F6', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}
                        onMouseOver={e => e.target.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={e => e.target.style.background = 'transparent'}
                    >
                        Configure Devices
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); window.location.href = '/dashboard/rooms'; }}
                        style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'transparent', border: 'none', color: '#F3F4F6', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}
                        onMouseOver={e => e.target.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={e => e.target.style.background = 'transparent'}
                    >
                        Configure Rooms
                    </button>
                    <button
                        onClick={(e) => { e.stopPropagation(); window.location.href = '/dashboard/routines'; }}
                        style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'transparent', border: 'none', color: '#F3F4F6', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}
                        onMouseOver={e => e.target.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={e => e.target.style.background = 'transparent'}
                    >
                        Configure Routines
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            const val = !showSmartWidget;
                            setShowSmartWidget(val);
                            localStorage.setItem('showSmartWidget', val.toString());
                            setContextMenu(null);
                        }}
                        style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'transparent', border: 'none', color: '#F3F4F6', borderRadius: '8px', cursor: 'pointer', fontWeight: '500' }}
                        onMouseOver={e => e.target.style.background = 'rgba(255,255,255,0.08)'} onMouseOut={e => e.target.style.background = 'transparent'}
                    >
                        {showSmartWidget ? 'Hide Smart Widget' : 'Show Smart Widget'}
                    </button>
                    <div style={{ height: '1px', background: 'rgba(255,255,255,0.08)', margin: '4px 0' }} />
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            setContextMenu(null);
                            window.dispatchEvent(new Event('openBackgroundOptions'));
                        }}
                        style={{ width: '100%', padding: '10px 14px', textAlign: 'left', background: 'transparent', border: 'none', color: '#10B981', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' }}
                        onMouseOver={e => e.target.style.background = 'rgba(16,185,129,0.1)'} onMouseOut={e => e.target.style.background = 'transparent'}
                    >
                        🖼️ Change Background
                    </button>
                </div>
            )}
        </div>
    );
}
