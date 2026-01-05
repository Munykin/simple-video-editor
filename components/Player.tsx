import React, { useEffect, useRef, useState } from 'react';
import { Clip } from '../types';

interface PlayerProps {
  clips: Clip[];
  currentTime: number;
  isPlaying: boolean;
  onTimeUpdate: (time: number) => void;
  onDurationChange: (duration: number) => void;
  onEnded: () => void;
}

const Player: React.FC<PlayerProps> = ({ clips, currentTime, isPlaying, onTimeUpdate, onEnded }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  // We need a pool of audio players for multiple tracks
  const audioRefs = useRef<Map<string, HTMLAudioElement>>(new Map());
  const [forceRender, setForceRender] = useState(0); // Hack to trigger re-render for audio pool management

  // 1. Determine active VIDEO clip (Layering logic: Highest trackIndex wins)
  const activeVideoClips = clips.filter(c => 
    c.type === 'video' && 
    currentTime >= c.startOffset && 
    currentTime < c.startOffset + (c.trimEnd - c.trimStart)
  );
  // Sort by trackIndex descending (highest layer on top)
  const topVideoClip = activeVideoClips.sort((a, b) => b.trackIndex - a.trackIndex)[0];

  // 2. Determine active AUDIO clips (Mixing logic: All play)
  const activeAudioClips = clips.filter(c => 
    c.type === 'audio' && 
    currentTime >= c.startOffset && 
    currentTime < c.startOffset + (c.trimEnd - c.trimStart)
  );

  // Video Sync Logic
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;

    if (topVideoClip) {
      const offsetInClip = currentTime - topVideoClip.startOffset;
      const targetSourceTime = topVideoClip.trimStart + offsetInClip;

      const currentSrc = vid.getAttribute('data-src');
      if (currentSrc !== topVideoClip.fileUrl) {
        vid.src = topVideoClip.fileUrl;
        vid.setAttribute('data-src', topVideoClip.fileUrl);
        vid.load();
        vid.currentTime = targetSourceTime;
        if (isPlaying) vid.play().catch(e => console.log('Autoplay prevented', e));
      } else {
        if (Math.abs(vid.currentTime - targetSourceTime) > 0.3) {
          vid.currentTime = targetSourceTime;
        }
        if (isPlaying && vid.paused) vid.play().catch(() => {});
        if (!isPlaying && !vid.paused) vid.pause();
      }
      vid.muted = topVideoClip.isMuted;
    } else {
      vid.pause();
      if (vid.getAttribute('data-src')) {
          vid.removeAttribute('src');
          vid.removeAttribute('data-src');
      }
    }
  }, [topVideoClip, currentTime, isPlaying]);

  // Audio Pool Management
  // Ensure we have an audio element for every active audio clip + the active video clip (if it has sound)
  useEffect(() => {
    const requiredIds = new Set(activeAudioClips.map(c => c.id));
    
    // Cleanup unused audio elements
    audioRefs.current.forEach((audio, id) => {
        if (!requiredIds.has(id)) {
            audio.pause();
            audio.remove();
            audioRefs.current.delete(id);
        }
    });

    // Create missing audio elements
    activeAudioClips.forEach(clip => {
        if (!audioRefs.current.has(clip.id)) {
            const audio = new Audio();
            audio.className = 'hidden';
            document.body.appendChild(audio); // Attach to DOM to ensure playback policies work better
            audioRefs.current.set(clip.id, audio);
        }
    });
  }, [activeAudioClips]); // Only run when composition of clips changes

  // Sync Audio Pool
  useEffect(() => {
    activeAudioClips.forEach(clip => {
        const aud = audioRefs.current.get(clip.id);
        if (!aud) return;

        const offsetInClip = currentTime - clip.startOffset;
        const targetSourceTime = clip.trimStart + offsetInClip;

        // Use custom prop to track src to avoid reloading
        const currentSrc = aud.getAttribute('data-src');
        if (currentSrc !== clip.fileUrl) {
            aud.src = clip.fileUrl;
            aud.setAttribute('data-src', clip.fileUrl);
            aud.load();
            aud.currentTime = targetSourceTime;
             if (isPlaying) aud.play().catch(e => console.log('Audio autoplay', e));
        } else {
            if (Math.abs(aud.currentTime - targetSourceTime) > 0.3) {
                aud.currentTime = targetSourceTime;
            }
            if (isPlaying && aud.paused) aud.play().catch(() => {});
            if (!isPlaying && !aud.paused) aud.pause();
        }
        aud.volume = clip.volume;
    });
  }, [activeAudioClips, currentTime, isPlaying]);

  // Main Clock
  useEffect(() => {
    let interval: number;
    if (isPlaying) {
      interval = window.setInterval(() => {
        onTimeUpdate(currentTime + 0.1); 
      }, 100);
    }
    return () => clearInterval(interval);
  }, [isPlaying, currentTime, onTimeUpdate]);


  return (
    <div className="relative w-full aspect-video bg-black rounded-lg overflow-hidden shadow-xl border border-slate-700">
      <video
        ref={videoRef}
        className="w-full h-full object-contain"
        playsInline
      />
      {!topVideoClip && (
        <div className="absolute inset-0 flex items-center justify-center text-slate-500">
          <span className="text-sm">Нет видео сигнала (No Signal)</span>
        </div>
      )}
    </div>
  );
};

export default Player;