export type MediaType = 'video' | 'audio' | 'image';

export interface Clip {
  id: string;
  fileUrl: string; // Blob URL
  type: MediaType;
  name: string;
  duration: number; // Native duration of the source file
  startOffset: number; // Where it sits on the timeline (seconds)
  trackIndex: number; // Vertical track position (0, 1, 2...)
  trimStart: number; // Start trimming from source (seconds)
  trimEnd: number; // End trimming from source (seconds)
  volume: number; // 0 to 1
  isMuted: boolean;
  thumbnail?: string;
}

export interface ProjectState {
  clips: Clip[];
  duration: number; // Total timeline duration
  currentTime: number; // Playhead position
  isPlaying: boolean;
  selectedClipId: string | null;
}

export interface GenerationConfig {
  prompt: string;
  type: 'video' | 'audio';
}