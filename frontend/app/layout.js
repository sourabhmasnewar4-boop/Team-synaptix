import './globals.css';
import { AuthProvider } from '@/lib/AuthContext';

export const metadata = {
  title: 'SmartHome — Intelligent Home Automation',
  description: 'Control your home devices from anywhere in the world. Smart, secure, and seamless home automation powered by ESP32.',
  keywords: 'smart home, home automation, ESP32, IoT, device control',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <meta name="theme-color" content="#0a0e1a" />
      </head>
      <body>
        <AuthProvider>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
