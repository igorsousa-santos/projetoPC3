import axios from 'axios';
import { LASTFM_API_KEY } from '../config/env.js';

/**
 * Last.fm Service for Code B Backend
 * Provides music recommendation data using Last.fm's collaborative filtering
 */
class LastFmService {
    constructor() {
        this.apiKey = LASTFM_API_KEY;
        this.baseUrl = 'https://ws.audioscrobbler.com/2.0/';
    }

    async makeRequest(params) {
        if (!this.apiKey) {
            throw new Error('LASTFM_API_KEY not configured');
        }

        try {
            const response = await axios.get(this.baseUrl, {
                params: {
                    ...params,
                    api_key: this.apiKey,
                    format: 'json'
                }
            });
            return response.data;
        } catch (error) {
            console.error('[Last.fm]', error.message);
            throw error;
        }
    }

    /**
     * Get similar artists to a given artist
     */
    async getSimilarArtists(artistName, limit = 50) {
        const data = await this.makeRequest({
            method: 'artist.getsimilar',
            artist: artistName,
            limit
        });

        if (!data.similarartists || !data.similarartists.artist) {
            return [];
        }

        return data.similarartists.artist.map(artist => ({
            name: artist.name,
            match: parseFloat(artist.match),
            url: artist.url
        }));
    }

    /**
     * Get top tracks for an artist with pagination support
     */
    async getTopTracksByArtist(artistName, limit = 20, page = 1) {
        const data = await this.makeRequest({
            method: 'artist.gettoptracks',
            artist: artistName,
            limit,
            page
        });

        if (!data.toptracks || !data.toptracks.track) {
            return [];
        }

        const tracks = Array.isArray(data.toptracks.track)
            ? data.toptracks.track
            : [data.toptracks.track];

        return tracks.map(track => ({
            name: track.name,
            artist: artistName,
            playcount: parseInt(track.playcount) || 0,
            listeners: parseInt(track.listeners) || 0,
            url: track.url,
            image: track.image
        }));
    }

    /**
     * Get similar tracks to a given track
     */
    async getSimilarTracks(trackName, artistName, limit = 50) {
        const data = await this.makeRequest({
            method: 'track.getsimilar',
            track: trackName,
            artist: artistName,
            limit
        });

        if (!data.similartracks || !data.similartracks.track) {
            return [];
        }

        const tracks = Array.isArray(data.similartracks.track)
            ? data.similartracks.track
            : [data.similartracks.track];

        return tracks.map(track => ({
            name: track.name,
            artist: track.artist?.name || track.artist,
            match: parseFloat(track.match),
            url: track.url,
            image: track.image
        }));
    }

    /**
     * Get top tracks by genre/tag
     */
    async getTopTracksByTag(tag, limit = 50, page = 1) {
        const data = await this.makeRequest({
            method: 'tag.gettoptracks',
            tag,
            limit,
            page
        });

        if (!data.tracks || !data.tracks.track) {
            return [];
        }

        const tracks = Array.isArray(data.tracks.track)
            ? data.tracks.track
            : [data.tracks.track];

        return tracks.map(track => ({
            name: track.name,
            artist: track.artist?.name || track.artist,
            url: track.url,
            image: track.image
        }));
    }

    /**
     * Search for a track (used for auto-detection)
     */
    async searchTrack(query, limit = 5) {
        const data = await this.makeRequest({
            method: 'track.search',
            track: query,
            limit
        });

        if (!data.results || !data.results.trackmatches || !data.results.trackmatches.track) {
            return [];
        }

        const tracks = Array.isArray(data.results.trackmatches.track)
            ? data.results.trackmatches.track
            : [data.results.trackmatches.track];

        return tracks.map(track => ({
            name: track.name,
            artist: track.artist,
            listeners: parseInt(track.listeners) || 0,
            url: track.url,
            image: track.image
        }));
    }
}

export default new LastFmService();
