// services/audioService.ts

/**
 * A centralized service for managing and playing UI sound effects.
 * It preloads all sounds and includes a global mute setting.
 */

type SoundType = 'success' | 'error' | 'send' | 'receive' | 'notification' | 'click' | 'tab_switch' | 'node_connect';

// Sounds sourced from Pixabay, licensed for free use.
const soundMap: Record<SoundType, string> = {
    success: 'https://cdn.pixabay.com/audio/2022/03/10/audio_c8989c162e.mp3', // interface-button
    error: 'https://cdn.pixabay.com/audio/2022/03/15/audio_74c6e9f141.mp3',   // error-call
    send: 'https://cdn.pixabay.com/audio/2022/11/17/audio_835548f2a1.mp3',    // whoosh
    receive: 'https://cdn.pixabay.com/audio/2021/08/04/audio_12b0c7443c.mp3', // notification
    notification: 'https://cdn.pixabay.com/audio/2022/03/10/audio_945112a87a.mp3', // notification-2
    click: 'https://cdn.pixabay.com/audio/2022/03/15/audio_731c5f4a64.mp3',     // button-click
    tab_switch: 'https://cdn.pixabay.com/audio/2022/03/10/audio_29372f8d28.mp3', // pop
    node_connect: 'https://cdn.pixabay.com/audio/2022/11/17/audio_835548f2a1.mp3', // whoosh (reusing 'send')
};

class AudioService {
    private audioElements: Partial<Record<SoundType, HTMLAudioElement>> = {};
    private isMuted: boolean = false;

    constructor() {
        if (typeof Audio === 'undefined') {
            console.warn("Audio API not supported. Audio feedback will be disabled.");
            return;
        }

        Object.entries(soundMap).forEach(([key, src]) => {
            const audio = new Audio(src);
            audio.preload = 'auto';
            this.audioElements[key as SoundType] = audio;
        });

        // Initialize muted state from settings if available
        try {
            const settings = JSON.parse(localStorage.getItem('ai-shunt-settings') || '{}');
            this.isMuted = settings.audioFeedbackEnabled === false;
        } catch(e) {
            this.isMuted = false;
        }
    }

    setMuted(muted: boolean) {
        this.isMuted = muted;
    }

    playSound(sound: SoundType) {
        if (this.isMuted) return;

        const audioElement = this.audioElements[sound];
        if (audioElement) {
            audioElement.currentTime = 0; // Rewind to start for rapid playback
            audioElement.play().catch(error => {
                // Ignore errors that often happen on first load before user interaction
                if (error.name !== 'NotAllowedError') {
                    console.warn(`Audio playback failed for sound "${sound}":`, error);
                }
            });
        }
    }
}

export const audioService = new AudioService();