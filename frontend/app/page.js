'use client';

import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function LoginPage() {
  const { user, loading, loginWithGoogle } = useAuth();
  const router = useRouter();

  // For the exact UI match
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!loading && user) {
      router.push('/dashboard');
    }
  }, [user, loading, router]);

  if (loading) {
    return (
      <div className="auth-container">
        <div style={{ color: 'white' }}>Loading AutoHome...</div>
      </div>
    );
  }

  if (user) return null;

  const handleSignIn = (e) => {
    e.preventDefault();
    // In a real app we would use Firebase Email/Password Auth
    // For now, since we have Google Authentication, we will just trigger the Google Auth to keep it functional,
    // or let the user click SIGN IN and trigger fake login for UI demonstration.
    loginWithGoogle();
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <h1 className="auth-title">AutoHome</h1>
        <p className="auth-subtitle" style={{ fontSize: '15px' }}>Welcome back. Sign in to your smart home.</p>

        <button className="google-btn" onClick={loginWithGoogle}>
          <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" alt="Google Logo" style={{ width: '20px' }} />
          Continue with Google
        </button>
      </div>
    </div>
  );
}
