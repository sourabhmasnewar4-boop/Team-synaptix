'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { auth, googleProvider, db } from '@/lib/firebase';
import {
    signInWithPopup,
    signOut,
    onAuthStateChanged,
} from 'firebase/auth';
import { doc, setDoc, getDoc, serverTimestamp } from 'firebase/firestore';

const AuthContext = createContext({});

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            try {
                if (firebaseUser) {
                    const userData = {
                        uid: firebaseUser.uid,
                        displayName: firebaseUser.displayName,
                        email: firebaseUser.email,
                        photoURL: firebaseUser.photoURL,
                    };
                    setUser(userData);

                    // Save/update user in Firestore
                    const userRef = doc(db, 'users', firebaseUser.uid);
                    const userDoc = await getDoc(userRef);
                    if (!userDoc.exists()) {
                        await setDoc(userRef, {
                            ...userData,
                            createdAt: serverTimestamp(),
                        });
                    }
                } else {
                    setUser(null);
                }
            } catch (error) {
                console.error("Error fetching user data from Firestore:", error);
                // Optionally sign out the user if their data can't be fetched, 
                // but setting loading to false will let them see the dashboard to some extent
                // or logout() manually.
            } finally {
                setLoading(false);
            }
        });

        return () => unsubscribe();
    }, []);

    const loginWithGoogle = async () => {
        try {
            const result = await signInWithPopup(auth, googleProvider);
            return result.user;
        } catch (error) {
            console.error('Login failed:', error);
            throw error;
        }
    };

    const logout = async () => {
        try {
            await signOut(auth);
        } catch (error) {
            console.error('Logout failed:', error);
            throw error;
        }
    };

    return (
        <AuthContext.Provider value={{ user, loading, loginWithGoogle, logout }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => useContext(AuthContext);
