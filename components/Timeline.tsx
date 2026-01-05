import React, { useRef, useState, useEffect } from 'react';
import { Clip } from '../types';
import { Film, Music, GripVertical } from 'lucide-react';

interface TimelineProps {
  clips: Clip[];
  duration: number;
  currentTime: number;
  selectedClipId: string | null;
  onSelectClip: (id: string | null) => void;
  onSeek: (time: number) => void;
  onUpdateClip: (id: string, updates: Partial<Clip>) => void;
}

const PIXELS_PER_SECOND = 20;
const TRACK_HEIGHT = 64;
const TRACK_GAP = 8;
const HEADER_HEIGHT = 32;

// Expanded state to handle different types of dragging
interface DragState {
  clipId: string;
  startX: number;
  startY: number;
  mode: 'move' | 'resize-left' | 'resize-right';
  // Snapshots of values at start of drag
  initialStartOffset: number;
  initialTrimStart: number;
  initialTrimEnd: number;
  initialTrackIndex: number;
  // Current dynamic values for rendering during drag
  currentStartOffset: number;
  currentTrimStart: number;
  currentTrimEnd: number;
  currentTrackIndex: number;
}

const Timeline: React.FC<TimelineProps> = ({ 
  clips, 
  duration, 
  currentTime, 
  selectedClipId, 
  onSelectClip, 
  onSeek,
  onUpdateClip
}) => {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const headerContainerRef = useRef<HTMLDivElement>(null);

  const [dragState, setDragState] = useState<DragState | null>(null);
  const [isScrubbing, setIsScrubbing] = useState(false);

  // Sync scrolling between header and tracks
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const scrollLeft = target.scrollLeft;
    
    // Sync the other container
    if (target === scrollContainerRef.current && headerContainerRef.current) {
        headerContainerRef.current.scrollLeft = scrollLeft;
    } else if (target === headerContainerRef.current && scrollContainerRef.current) {
        scrollContainerRef.current.scrollLeft = scrollLeft;
    }
  };

  // --- Scrubber (Playhead) Logic ---
  const handleScrubStart = (e: React.MouseEvent) => {
    setIsScrubbing(true);
    updateScrubPosition(e.clientX);
  };

  const updateScrubPosition = (clientX: number) => {
    if (scrollContainerRef.current) {
      const rect = scrollContainerRef.current.getBoundingClientRect();
      const scrollLeft = scrollContainerRef.current.scrollLeft;
      // Fixed: Removed "- 200" offset. rect.left already accounts for the sidebar position.
      const x = clientX - rect.left + scrollLeft;
      const time = Math.max(0, x / PIXELS_PER_SECOND);
      onSeek(time);
    }
  };

  useEffect(() => {
    if (!isScrubbing) return;

    const handleScrubMove = (e: globalThis.MouseEvent) => {
      e.preventDefault();
      updateScrubPosition(e.clientX);
    };

    const handleScrubUp = () => {
      setIsScrubbing(false);
    };

    window.addEventListener('mousemove', handleScrubMove);
    window.addEventListener('mouseup', handleScrubUp);

    return () => {
      window.removeEventListener('mousemove', handleScrubMove);
      window.removeEventListener('mouseup', handleScrubUp);
    };
  }, [isScrubbing, onSeek]);


  // --- Clip Drag & Resize Logic ---
  useEffect(() => {
    if (!dragState) return;

    const activeClip = clips.find(c => c.id === dragState.clipId);
    if (!activeClip) return;

    const handleMouseMove = (e: globalThis.MouseEvent) => {
      const deltaPixelsX = e.clientX - dragState.startX;
      const deltaSeconds = deltaPixelsX / PIXELS_PER_SECOND;

      const deltaPixelsY = e.clientY - dragState.startY;
      const tracksJump = Math.round(deltaPixelsY / (TRACK_HEIGHT + TRACK_GAP));

      setDragState(prev => {
        if (!prev) return null;
        
        let updates = { ...prev };

        if (prev.mode === 'move') {
           // Simple move: change startOffset
           const newOffset = Math.max(0, prev.initialStartOffset + deltaSeconds);
           updates.currentStartOffset = newOffset;

           // Track Vertical Move
           let newTrackIndex = prev.initialTrackIndex + tracksJump;
           // Clamp tracks (0 to 2)
           newTrackIndex = Math.max(0, Math.min(newTrackIndex, 2));
           updates.currentTrackIndex = newTrackIndex;

        } 
        else if (prev.mode === 'resize-left') {
           let newTrimStart = prev.initialTrimStart + deltaSeconds;
           const minDuration = 0.5; // seconds
           newTrimStart = Math.max(0, Math.min(newTrimStart, prev.initialTrimEnd - minDuration));
           const actualDelta = newTrimStart - prev.initialTrimStart;
           
           updates.currentTrimStart = newTrimStart;
           updates.currentStartOffset = prev.initialStartOffset + actualDelta;
        } 
        else if (prev.mode === 'resize-right') {
           let newTrimEnd = prev.initialTrimEnd + deltaSeconds;
           const minDuration = 0.5;
           newTrimEnd = Math.max(prev.initialTrimStart + minDuration, Math.min(newTrimEnd, activeClip.duration));
           
           updates.currentTrimEnd = newTrimEnd;
        }

        return updates;
      });
    };

    const handleMouseUp = () => {
      if (dragState) {
        // Commit changes
        const updates: Partial<Clip> = {};
        
        if (dragState.mode === 'move') {
            updates.startOffset = dragState.currentStartOffset;
            updates.trackIndex = dragState.currentTrackIndex;
        } else if (dragState.mode === 'resize-left') {
            updates.trimStart = dragState.currentTrimStart;
            updates.startOffset = dragState.currentStartOffset;
        } else if (dragState.mode === 'resize-right') {
            updates.trimEnd = dragState.currentTrimEnd;
        }

        onUpdateClip(dragState.clipId, updates);
        setDragState(null);
      }
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [dragState, onUpdateClip, clips]);


  const renderRuler = () => {
    const marks = [];
    const totalSeconds = Math.max(duration + 60, 300); 
    for (let i = 0; i < totalSeconds; i += 5) {
      marks.push(
        <div 
          key={i} 
          className="absolute top-0 h-2 border-l border-slate-600 text-[10px] text-slate-400 pl-1 select-none pointer-events-none"
          style={{ left: `${i * PIXELS_PER_SECOND}px` }}
        >
          {i % 10 === 0 ? formatTime(i) : ''}
        </div>
      );
    }
    return marks;
  };

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = Math.floor(s % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const ClipItem: React.FC<{ clip: Clip; color: string }> = ({ clip, color }) => {
    const isDragging = dragState?.clipId === clip.id;
    
    // Use values from DragState if active, otherwise from Clip
    const startOffset = isDragging ? dragState.currentStartOffset : clip.startOffset;
    const trackIndex = isDragging && dragState?.mode === 'move' ? dragState.currentTrackIndex : clip.trackIndex;
    const trimStart = isDragging ? dragState.currentTrimStart : clip.trimStart;
    const trimEnd = isDragging ? dragState.currentTrimEnd : clip.trimEnd;
    
    const duration = trimEnd - trimStart;
    const width = duration * PIXELS_PER_SECOND;
    const left = startOffset * PIXELS_PER_SECOND;
    const isSelected = selectedClipId === clip.id;

    // Handlers
    const startMove = (e: React.MouseEvent) => {
      e.stopPropagation();
      onSelectClip(clip.id);
      setDragState({
        clipId: clip.id,
        startX: e.clientX,
        startY: e.clientY,
        mode: 'move',
        initialStartOffset: clip.startOffset,
        initialTrimStart: clip.trimStart,
        initialTrimEnd: clip.trimEnd,
        initialTrackIndex: clip.trackIndex,
        currentStartOffset: clip.startOffset,
        currentTrimStart: clip.trimStart,
        currentTrimEnd: clip.trimEnd,
        currentTrackIndex: clip.trackIndex
      });
    };

    const startResizeLeft = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault(); 
      onSelectClip(clip.id);
      setDragState({
        clipId: clip.id,
        startX: e.clientX,
        startY: e.clientY,
        mode: 'resize-left',
        initialStartOffset: clip.startOffset,
        initialTrimStart: clip.trimStart,
        initialTrimEnd: clip.trimEnd,
        initialTrackIndex: clip.trackIndex,
        currentStartOffset: clip.startOffset,
        currentTrimStart: clip.trimStart,
        currentTrimEnd: clip.trimEnd,
        currentTrackIndex: clip.trackIndex
      });
    };

    const startResizeRight = (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();
      onSelectClip(clip.id);
      setDragState({
        clipId: clip.id,
        startX: e.clientX,
        startY: e.clientY,
        mode: 'resize-right',
        initialStartOffset: clip.startOffset,
        initialTrimStart: clip.trimStart,
        initialTrimEnd: clip.trimEnd,
        initialTrackIndex: clip.trackIndex,
        currentStartOffset: clip.startOffset,
        currentTrimStart: clip.trimStart,
        currentTrimEnd: clip.trimEnd,
        currentTrackIndex: clip.trackIndex
      });
    };

    return (
      <div
        onMouseDown={startMove}
        className={`absolute top-0 bottom-0 rounded-md border border-opacity-30 overflow-visible cursor-pointer group transition-none
          ${isSelected ? 'border-yellow-400 ring-2 ring-yellow-400/50 z-20' : 'border-white/10 z-10'}
          ${isDragging && dragState?.mode === 'move' ? 'opacity-80 cursor-grabbing shadow-xl scale-[1.02] z-50' : 'cursor-grab'}
          ${color}
        `}
        style={{ width: `${width}px`, left: `${left}px` }}
      >
        {/* Resize Handle LEFT */}
        <div 
            className="absolute left-0 top-0 bottom-0 w-3 cursor-w-resize z-30 flex items-center justify-center hover:bg-black/20 group-hover:bg-white/10 transition-colors"
            onMouseDown={startResizeLeft}
        >
             <div className="w-1 h-4 bg-white/50 rounded-full" />
        </div>

        {/* Content */}
        <div className="absolute inset-0 flex items-center px-4 gap-2 pointer-events-none overflow-hidden">
          {isDragging && dragState?.mode === 'move' && <GripVertical size={14} className="text-white/50" />}
          {clip.type === 'video' ? <Film size={14} className="opacity-50 min-w-[14px]" /> : <Music size={14} className="opacity-50 min-w-[14px]" />}
          <span className="text-xs truncate font-medium text-white shadow-sm select-none">{clip.name}</span>
        </div>
        
        {/* Resize Handle RIGHT */}
        <div 
            className="absolute right-0 top-0 bottom-0 w-3 cursor-e-resize z-30 flex items-center justify-center hover:bg-black/20 group-hover:bg-white/10 transition-colors"
            onMouseDown={startResizeRight}
        >
            <div className="w-1 h-4 bg-white/50 rounded-full" />
        </div>
      </div>
    );
  };

  const contentWidth = `${Math.max(duration * PIXELS_PER_SECOND, 2000)}px`;

  // Render Tracks Helper
  const renderTracks = (type: 'video' | 'audio') => {
      const tracks = [0, 1, 2]; // 3 Tracks
      return tracks.map(trackIdx => {
          // Filter clips that belong to this track OR are being dragged to this track
          const trackClips = clips.filter(c => {
             const isBeingDragged = dragState?.clipId === c.id;
             if (isBeingDragged) {
                 return dragState?.mode === 'move' ? dragState.currentTrackIndex === trackIdx : c.trackIndex === trackIdx;
             }
             return c.type === type && c.trackIndex === trackIdx;
          });

          
          const filteredTrackClips = trackClips.filter(c => c.type === type);

          return (
            <div 
                key={`${type}-${trackIdx}`} 
                className="relative bg-slate-800/50 rounded border border-slate-700/50 mb-2" 
                style={{ height: TRACK_HEIGHT, minWidth: contentWidth }}
            >
                {filteredTrackClips.map(clip => (
                    <ClipItem 
                        key={clip.id} 
                        clip={clip} 
                        color={type === 'video' ? "bg-indigo-600 hover:bg-indigo-500" : "bg-emerald-600 hover:bg-emerald-500"} 
                    />
                ))}
            </div>
          );
      });
  };

  return (
    <div className="flex flex-col flex-1 bg-slate-900 border-t border-slate-700 h-80 overflow-hidden select-none relative">
      
      {/* Time Header (Ruler) */}
      <div className="flex border-b border-slate-700 bg-slate-800 z-20">
          <div className="w-[200px] flex-shrink-0 border-r border-slate-700 bg-slate-900 p-2 text-xs text-slate-500 font-bold uppercase flex items-center">
              Tracks
          </div>
          <div 
            ref={headerContainerRef}
            className="flex-1 overflow-hidden relative cursor-ew-resize h-8"
            onMouseDown={handleScrubStart}
          >
            <div style={{ width: contentWidth, height: '100%' }}>
                {renderRuler()}
            </div>
          </div>
      </div>

      {/* Main Body */}
      <div className="flex flex-1 overflow-hidden">
        {/* Track Labels (Sticky Left) */}
        <div className="w-[200px] flex-shrink-0 bg-slate-900 border-r border-slate-700 overflow-y-hidden flex flex-col py-4 px-4 space-y-2 select-none z-10">
             <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2">Video</div>
             {[0, 1, 2].map(i => (
                 <div key={`v-label-${i}`} className="flex items-center justify-end px-4 text-xs text-slate-400 font-mono bg-slate-800/30 rounded" style={{ height: TRACK_HEIGHT, marginBottom: TRACK_GAP }}>
                     V{i + 1}
                 </div>
             ))}
             <div className="text-xs text-slate-500 font-bold uppercase tracking-wider mb-2 mt-4">Audio</div>
             {[0, 1, 2].map(i => (
                 <div key={`a-label-${i}`} className="flex items-center justify-end px-4 text-xs text-slate-400 font-mono bg-slate-800/30 rounded" style={{ height: TRACK_HEIGHT, marginBottom: TRACK_GAP }}>
                     A{i + 1}
                 </div>
             ))}
        </div>

        {/* Scrolling Content */}
        <div 
            ref={scrollContainerRef}
            className="flex-1 overflow-auto relative py-4"
            onScroll={handleScroll}
        >
             {/* Playhead Line */}
             <div 
                className="absolute top-0 bottom-0 w-px bg-red-500 z-50 pointer-events-none"
                style={{ left: `${currentTime * PIXELS_PER_SECOND}px` }}
            >
                <div 
                    className="w-4 h-4 -ml-2 bg-red-500 rounded-full shadow-md absolute -top-3 cursor-ew-resize pointer-events-auto hover:scale-110 transition-transform flex items-center justify-center"
                    onMouseDown={handleScrubStart}
                >
                    <div className="w-1.5 h-1.5 bg-white rounded-full" />
                </div>
            </div>

            {/* Video Tracks Area */}
            <div className="mb-8">
               {renderTracks('video')}
            </div>

            {/* Audio Tracks Area */}
            <div>
               {renderTracks('audio')}
            </div>
            
            <div className="absolute inset-0 z-0" onMouseDown={handleScrubStart} />
        </div>
      </div>
    </div>
  );
};

export default Timeline;