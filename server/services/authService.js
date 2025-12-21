import jwt from 'jsonwebtoken';
import prisma from '../config/prisma.js';
import { JWT_SECRET, LASTFM_API_KEY, LASTFM_API_BASE } from '../config/env.js';
import signParams from '../utils/signParams.js';

const buildError = (message, status = 400) => {
    const err = new Error(message);
    err.status = status;
    return err;
};

export const loginWithLastfm = async (token) => {
    if (!token) throw buildError('Token is required', 400);

    const params = { api_key: LASTFM_API_KEY, method: 'auth.getSession', token };
    const api_sig = signParams(params);

    const url = new URL(LASTFM_API_BASE);
    Object.entries({ ...params, api_sig, format: 'json' }).forEach(([key, value]) => {
        url.searchParams.append(key, value);
    });

    const response = await fetch(url.toString());
    const data = await response.json();

    if (data.error || !data.session) {
        const message = data.message || 'Failed to authenticate with Last.fm';
        throw buildError(message, 401);
    }

    const { name: username, key: sessionKey } = data.session;
    const image = data.session.image;

    let user = await prisma.user.findUnique({ where: { lastfmUsername: username } });

    if (!user) {
        user = await prisma.user.create({
            data: {
                lastfmUsername: username,
                name: username,
                image: image && Array.isArray(image) ? image[image.length - 1]['#text'] : null,
            },
        });
    }

    const jwtToken = jwt.sign(
        { id: user.id, lastfmUsername: user.lastfmUsername, spotifyId: user.spotifyId },
        JWT_SECRET,
        { expiresIn: '7d' }
    );

    return { user, jwtToken, sessionKey };
};

export const linkSpotify = async (userId, accessToken) => {
    if (!accessToken) throw buildError('Access token required', 400);

    const tokenPreview = `${accessToken.substring(0, 8)}...`;
    console.log('[Spotify Link] Starting link flow', { userId, tokenPreview });

    const spotifyResponse = await fetch('https://api.spotify.com/v1/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
    });

    console.log('[Spotify Link] /me response status', spotifyResponse.status);

    if (!spotifyResponse.ok) {
        const errorBody = await spotifyResponse.text();
        console.error('[Spotify Link] /me failed:', spotifyResponse.status, errorBody);
        throw buildError(`Invalid Spotify token: ${spotifyResponse.status}`, 401);
    }

    const spotifyUser = await spotifyResponse.json();

    console.log('[Spotify Link] Retrieved Spotify profile', {
        spotifyId: spotifyUser.id,
        displayName: spotifyUser.display_name,
    });

    const existingUser = await prisma.user.findUnique({ where: { spotifyId: spotifyUser.id } });
    if (existingUser && existingUser.id !== userId) {
        console.warn('[Spotify Link] Spotify account already linked to another user', {
            spotifyId: spotifyUser.id,
            existingUserId: existingUser.id,
            requestUserId: userId,
        });
        throw buildError('This Spotify account is already connected to another user.', 409);
    }

    const updatedUser = await prisma.user.update({
        where: { id: userId },
        data: { spotifyId: spotifyUser.id },
    });

    console.log('[Spotify Link] Link successful', {
        userId: updatedUser.id,
        spotifyId: updatedUser.spotifyId,
    });

    return updatedUser;
};

export const getCurrentUser = async (userId) => {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw buildError('User not found', 404);
    return user;
};