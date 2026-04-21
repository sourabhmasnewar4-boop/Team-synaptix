'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '@/lib/AuthContext'; // we can keep auth but not use profile pic

const navItems = [
    {
        href: '/dashboard', icon: (
            <svg viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm1-13h-2v4l3.5 1.5.8-1.5-2.8-1.2V7z" /></svg>
        ), label: 'Dashboard'
    },
    {
        href: '/dashboard/rooms', icon: (
            <svg viewBox="0 0 24 24"><path d="M19 19V4h-4V3H5v16H3v2h12V6h2v15h4v-2h-2zm-6 0H7V5h6v14zm-3-8h2v2h-2z" /></svg>
        ), label: 'Rooms'
    },
    {
        href: '/dashboard/devices', icon: (
            <svg viewBox="0 0 24 24"><path d="M21 11V9h-2V7c0-1.1-.9-2-2-2h-2V3h-2v2h-2V3H9v2H7c-1.1 0-2 .9-2 2v2H3v2h2v2H3v2h2v2c0 1.1.9 2 2 2h2v2h2v-2h2v2h2v-2h2c1.1 0 2-.9 2-2v-2h2v-2h-2v-2h2zm-4 6H7V7h10v10z" /><path d="M9 9h6v6H9z" /></svg>
        ), label: 'Devices'
    },
    {
        href: '/dashboard/routines', icon: (
            <svg viewBox="0 0 24 24"><path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42C16.07 4.74 14.12 4 12 4c-4.97 0-9 4.03-9 9s4.03 9 9 9 9-4.03 9-9c0-2.12-.74-4.07-1.97-5.61zM12 20c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z" /></svg>
        ), label: 'Routines'
    },
];

const bottomNavItems = [
    {
        href: '/dashboard/settings', icon: (
            <svg viewBox="0 0 24 24"><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.06-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.06.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.49-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z" /></svg>
        ), label: 'Settings'
    },
];

export default function Sidebar({ isOpen, onClose }) {
    const pathname = usePathname();

    const isActive = (href) => {
        if (href === '/dashboard') return pathname === '/dashboard';
        return pathname.startsWith(href);
    };

    return (
        <aside className="sidebar">
            <Link href="/dashboard" className="sidebar-header" style={{ marginBottom: '20px' }}>
                {/* Robot Head icon */}
                <svg viewBox="0 0 24 24" style={{ fill: '#3B82F6', width: '28px', height: '28px' }}>
                    <path d="M12 2a2 2 0 0 1 2 2c0 .74-.4 1.39-1 1.73V7h5a2 2 0 0 1 2 2v6h2v2h-2v2a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-2H2v-2h2V9a2 2 0 0 1 2-2h5V5.73c-.6-.34-1-.99-1-1.73a2 2 0 0 1 2-2M7.5 13A1.5 1.5 0 0 0 6 11.5 1.5 1.5 0 0 0 7.5 10 1.5 1.5 0 0 0 9 11.5 1.5 1.5 0 0 0 7.5 13m9 0a1.5 1.5 0 0 0-1.5-1.5A1.5 1.5 0 0 0 13.5 13a1.5 1.5 0 0 0 1.5 1.5A1.5 1.5 0 0 0 16.5 13m-3.5 3.5a1 1 0 0 0 1 1h2a1 1 0 0 0 1-1v-1h-6v1z" />
                </svg>
                <span className="sidebar-brand" style={{ fontSize: '20px', fontWeight: '700', color: 'white' }}>AutoHome</span>
            </Link>

            <nav className="sidebar-nav" style={{ paddingTop: '0' }}>
                {navItems.map((item) => (
                    <Link
                        key={item.href}
                        href={item.href}
                        className={`sidebar-link ${isActive(item.href) ? 'active' : ''}`}
                    >
                        <span className="sidebar-link-icon">{item.icon}</span>
                        <span>{item.label}</span>
                    </Link>
                ))}

                <div style={{ marginTop: 'auto', marginBottom: '20px' }}>
                    {bottomNavItems.map((item) => (
                        <Link
                            key={item.href}
                            href={item.href}
                            className={`sidebar-link ${isActive(item.href) ? 'active' : ''}`}
                        >
                            <span className="sidebar-link-icon">{item.icon}</span>
                            <span>{item.label}</span>
                        </Link>
                    ))}
                </div>
            </nav>
        </aside>
    );
}
