const { getFirestore } = require('firebase-admin/firestore');

const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';
const SPOTIFY_ACCOUNTS_BASE = 'https://accounts.spotify.com';

async function refreshSpotifyToken(userId) {
    const db = getFirestore();
    const docRef = db.collection('user_integrations').doc(userId);
    const snap = await docRef.get();

    if (!snap.exists) return null;
    const data = snap.data();
    if (!data.spotify || !data.spotify.refreshToken) return null;

    // Check if expired
    if (data.spotify.expiresAt && Date.now() < data.spotify.expiresAt) {
        return data.spotify.accessToken; // Still valid
    }

    const { SPOTIFY_CLIENT_ID, SPOTIFY_CLIENT_SECRET } = process.env;
    if (!SPOTIFY_CLIENT_ID || !SPOTIFY_CLIENT_SECRET) return null;

    const auth = Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64');

    try {
        const response = await fetch(`${SPOTIFY_ACCOUNTS_BASE}/api/token`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                refresh_token: data.spotify.refreshToken
            })
        });

        const result = await response.json();
        if (result.access_token) {
            await docRef.update({
                'spotify.accessToken': result.access_token,
                'spotify.expiresAt': Date.now() + (result.expires_in * 1000)
            });
            return result.access_token;
        }
    } catch (e) {
        console.error('Spotify token refresh failed', e);
    }
    return null;
}

async function controlSpotify(userId, action, query = '') {
    const token = await refreshSpotifyToken(userId);
    if (!token) throw new Error('Spotify not linked or token expired.');

    const headers = { 'Authorization': `Bearer ${token}` };

    try {
        if (action === 'play') {
            if (query) {
                // search for track
                const searchRes = await fetch(`${SPOTIFY_API_BASE}/search?q=${encodeURIComponent(query)}&type=track&limit=1`, { headers });
                const searchData = await searchRes.json();
                if (searchData.tracks && searchData.tracks.items.length > 0) {
                    const uri = searchData.tracks.items[0].uri;
                    await fetch(`${SPOTIFY_API_BASE}/me/player/play`, {
                        method: 'PUT',
                        headers: { ...headers, 'Content-Type': 'application/json' },
                        body: JSON.stringify({ uris: [uri] })
                    });
                    return `Playing "${searchData.tracks.items[0].name}" by ${searchData.tracks.items[0].artists[0].name}.`;
                }
                return `Could not find any song matching "${query}".`;
            } else {
                await fetch(`${SPOTIFY_API_BASE}/me/player/play`, { method: 'PUT', headers });
                return 'Resumed Spotify playback.';
            }
        }
        else if (action === 'pause') {
            await fetch(`${SPOTIFY_API_BASE}/me/player/pause`, { method: 'PUT', headers });
            return 'Paused Spotify.';
        }
        else if (action === 'next') {
            await fetch(`${SPOTIFY_API_BASE}/me/player/next`, { method: 'POST', headers });
            return 'Skipped to the next track.';
        }
        else if (action === 'prev') {
            await fetch(`${SPOTIFY_API_BASE}/me/player/previous`, { method: 'POST', headers });
            return 'Going back to the previous track.';
        }
    } catch (e) {
        throw new Error('Spotify API Error. You might not have an active Spotify player open.');
    }

    throw new Error('Unknown Spotify command');
}

module.exports = { controlSpotify };
