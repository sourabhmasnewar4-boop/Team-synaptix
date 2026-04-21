'use client';

import { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { auth } from '@/lib/firebase';

const WsContext = createContext(null);

export function WebSocketProvider({ children }) {
    const wsRef = useRef(null);
    const [isConnected, setIsConnected] = useState(false);
    const listenersRef = useRef(new Map()); // type → Set<callback>
    const reconnectRef = useRef(null);

    const subscribe = useCallback((type, cb) => {
        if (!listenersRef.current.has(type)) {
            listenersRef.current.set(type, new Set());
        }
        listenersRef.current.get(type).add(cb);
        return () => listenersRef.current.get(type)?.delete(cb);
    }, []);

    const send = useCallback((data) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data));
        }
    }, []);

    const connect = useCallback(async () => {
        try {
            const user = auth.currentUser;
            if (!user) return;

            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';
            const wsUrl = apiUrl.replace('http', 'ws') + '/ws';

            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                setIsConnected(true);
                // Authenticate immediately on connect
                ws.send(JSON.stringify({ type: 'auth', userId: user.uid }));
            };

            ws.onmessage = (event) => {
                try {
                    const msg = JSON.parse(event.data);
                    const listeners = listenersRef.current.get(msg.type);
                    if (listeners) {
                        listeners.forEach(cb => cb(msg));
                    }
                    // Also fire wildcard listeners
                    const wildcard = listenersRef.current.get('*');
                    if (wildcard) wildcard.forEach(cb => cb(msg));
                } catch (e) { /* ignore */ }
            };

            ws.onclose = () => {
                setIsConnected(false);
                // Auto-reconnect after 2 seconds
                reconnectRef.current = setTimeout(connect, 2000);
            };

            ws.onerror = () => {
                ws.close();
            };
        } catch (e) {
            reconnectRef.current = setTimeout(connect, 3000);
        }
    }, []);

    useEffect(() => {
        // Wait for Firebase auth to initialize
        const unsubAuth = auth.onAuthStateChanged((user) => {
            if (user) {
                connect();
            } else {
                wsRef.current?.close();
                clearTimeout(reconnectRef.current);
            }
        });

        return () => {
            unsubAuth();
            clearTimeout(reconnectRef.current);
            wsRef.current?.close();
        };
    }, [connect]);

    return (
        <WsContext.Provider value={{ isConnected, subscribe, send }}>
            {children}
        </WsContext.Provider>
    );
}

export const useWebSocket = () => useContext(WsContext);
