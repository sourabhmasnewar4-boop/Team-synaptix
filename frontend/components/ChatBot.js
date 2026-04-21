'use client';

import { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function ChatBot({ open, onOpen }) {
    const { user } = useAuth();
    const [messages, setMessages] = useState([
        { role: 'assistant', text: 'Hi! I am AutoHome. I can turn on your lights, set routines, and more. What can I do for you?' }
    ]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(false);
    const messagesEndRef = useRef(null);
    const awakeRef = useRef(false);
    const awakeTimeoutRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const executeCommand = async (userMsg) => {
        if (!userMsg || !user) return;
        setMessages(prev => [...prev, { role: 'user', text: userMsg }]);
        setLoading(true);

        try {
            const res = await fetch(`${API}/api/assistant/chat`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ userId: user.uid, message: userMsg })
            });
            const data = await res.json();

            if (res.ok) {
                setMessages(prev => [...prev, { role: 'assistant', text: data.reply }]);
            } else {
                setMessages(prev => [...prev, { role: 'assistant', text: `Error: ${data.error}` }]);
            }
        } catch (err) {
            setMessages(prev => [...prev, { role: 'assistant', text: 'Network connection error.' }]);
        }
        setLoading(false);
    };

    const handleSend = (e) => {
        e.preventDefault();
        const userMsg = input.trim();
        setInput('');
        executeCommand(userMsg);
    };

    // ── ON-DEMAND VOICE (tap mic to speak) ──
    // NOTE: We intentionally do NOT auto-start SpeechRecognition on page load.
    // On Android Chrome, every recognition.start() triggers a microphone
    // permission sound (the Google bar "ding dong"). The old always-on loop
    // restarted every few seconds causing constant sounds.
    const [listening, setListening] = useState(false);
    const recognitionRef = useRef(null);

    const startListening = () => {
        if (typeof window === 'undefined') return;
        if (listening) {
            // Toggle off
            recognitionRef.current?.stop();
            return;
        }

        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRecognition) {
            alert('Voice input is not supported in this browser.');
            return;
        }

        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        // continuous=false → single utterance, stops by itself, no looping restart
        recognition.continuous = false;
        recognition.interimResults = false;
        recognition.lang = 'en-US';

        recognition.onstart = () => setListening(true);

        recognition.onresult = (event) => {
            let transcript = event.results[0][0].transcript.toLowerCase();
            transcript = transcript.replace(/[.,!?]/g, '').trim();

            // Strip the wake word if the user said it
            if (transcript.startsWith('jarvis')) {
                transcript = transcript.replace(/^jarvis\s*/, '').trim();
            }

            if (transcript.length > 0) {
                if (onOpen) onOpen();
                setInput(transcript);
                executeCommand(transcript);
            }
        };

        recognition.onerror = (e) => {
            if (e.error !== 'no-speech') console.warn('Speech error:', e.error);
        };

        recognition.onend = () => {
            setListening(false);
            // Do NOT auto-restart — this is what caused the repeated Android sounds
        };

        try { recognition.start(); } catch (e) { console.warn('Could not start recognition:', e); }
    };

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            recognitionRef.current?.stop();
            clearTimeout(awakeTimeoutRef.current);
        };
    }, []);

    return (
        <div style={{
            position: 'fixed', bottom: '90px', right: '30px', zIndex: 1000,
            width: '340px', height: '400px', display: open ? 'flex' : 'none', flexDirection: 'column',
            overflow: 'hidden', animation: 'slideUp 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)'
        }}>
            <style>{`
                @keyframes slideUp { 
                    from { opacity: 0; transform: translateY(20px) scale(0.95); } 
                    to { opacity: 1; transform: translateY(0) scale(1); } 
                }
                .dot-typing { animation: blink 1.4s infinite both; }
                .dot-typing:nth-child(2) { animation-delay: 0.2s; }
                .dot-typing:nth-child(3) { animation-delay: 0.4s; }
                @keyframes blink { 0% { opacity: .2; } 20% { opacity: 1; } 100% { opacity: .2; } }
                .hide-scrollbar::-webkit-scrollbar { display: none; }
                .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

            <div className="hide-scrollbar" style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {messages.map((m, i) => (
                    <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: m.role === 'user' ? 'flex-end' : 'flex-start' }}>
                        <div style={{
                            background: m.role === 'user' ? 'transparent' : 'transparent',
                            color: m.role === 'user' ? '#00F0FF' : 'white',
                            padding: '8px 12px',
                            fontSize: '15px', lineHeight: '1.4',
                            textShadow: '0 0 10px rgba(255,255,255,0.2)',
                            textAlign: m.role === 'user' ? 'right' : 'left'
                        }}>
                            {m.text}
                        </div>
                    </div>
                ))}
                {loading && (
                    <div style={{ alignSelf: 'flex-start', background: 'rgba(255,255,255,0.05)', padding: '12px 16px', borderRadius: '12px', borderTopLeftRadius: '4px', display: 'flex', gap: '4px' }}>
                        <div className="dot-typing" style={{ width: '6px', height: '6px', background: '#9CA3AF', borderRadius: '50%' }} />
                        <div className="dot-typing" style={{ width: '6px', height: '6px', background: '#9CA3AF', borderRadius: '50%' }} />
                        <div className="dot-typing" style={{ width: '6px', height: '6px', background: '#9CA3AF', borderRadius: '50%' }} />
                    </div>
                )}
                {listening && (
                    <div style={{
                        position: 'absolute', bottom: '26px', right: '55px',
                        width: '8px', height: '8px', borderRadius: '50%',
                        background: '#10B981', boxShadow: '0 0 10px #10B981',
                        animation: 'blink 1.4s infinite both'
                    }} title="Jarvis is listening..." />
                )}
                <div ref={messagesEndRef} />
            </div>

            <form onSubmit={handleSend} style={{ padding: '12px', display: 'flex', gap: '8px', alignItems: 'center' }}>
                <input
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Type or say 'Jarvis'..."
                    style={{ flex: 1, background: 'transparent', border: 'none', borderBottom: '1px solid rgba(255,255,255,0.3)', padding: '10px 14px', color: 'white', outline: 'none', fontSize: '14px' }}
                />
                {/* Mic button — tap to speak (only way to trigger microphone) */}
                <button
                    type="button"
                    onClick={startListening}
                    title={listening ? 'Listening… tap to cancel' : 'Tap to speak'}
                    style={{
                        background: listening ? 'rgba(239,68,68,0.2)' : 'transparent',
                        border: 'none', color: listening ? '#EF4444' : '#9CA3AF',
                        width: '36px', height: '36px', borderRadius: '50%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        cursor: 'pointer', flexShrink: 0,
                        boxShadow: listening ? '0 0 12px rgba(239,68,68,0.5)' : 'none',
                        animation: listening ? 'blink 1s infinite' : 'none',
                        transition: 'all 0.2s',
                    }}
                >
                    <svg viewBox="0 0 24 24" width="17" height="17" fill="currentColor">
                        <path d="M12 1a4 4 0 0 1 4 4v6a4 4 0 0 1-8 0V5a4 4 0 0 1 4-4zm0 2a2 2 0 0 0-2 2v6a2 2 0 0 0 4 0V5a2 2 0 0 0-2-2zm-7 8h2a5 5 0 0 0 10 0h2a7 7 0 0 1-6 6.93V20h3v2H8v-2h3v-2.07A7 7 0 0 1 5 11z"/>
                    </svg>
                </button>
                <button type="submit" disabled={loading || !input.trim()} style={{ background: 'transparent', border: 'none', color: '#00F0FF', width: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: input.trim() ? 'pointer' : 'default', opacity: input.trim() ? 1 : 0.5 }}>
                    <svg viewBox="0 0 24 24" width="18" height="18" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" /></svg>
                </button>
            </form>
        </div>
    );
}
