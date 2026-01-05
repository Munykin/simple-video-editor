import React, { useState, useRef } from 'react';
import { Clip } from './types';
import Player from './components/Player';
import Timeline from './components/Timeline';
import { generateVideoClip, generateVoiceover, ensureApiKey } from './services/geminiService';
import { 
  Play, Pause, Plus, Scissors, Download, 
  Split, Volume2, Video, Wand2, Trash2, 
  ArrowLeftToLine, ArrowRightToLine, Upload
} from 'lucide-react';

export default function App() {
  // State
  const [clips, setClips] = useState<Clip[]>([]);
  const [currentTime, setCurrentTime] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  
  // Refs
  const fileInputRef = useRef<HTMLInputElement>(null);

  // AI Modal State
  const [isAIModalOpen, setIsAIModalOpen] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiMode, setAiMode] = useState<'video' | 'audio'>('video');
  const [isGenerating, setIsGenerating] = useState(false);

  // Derived
  const totalDuration = clips.reduce((acc, clip) => Math.max(acc, clip.startOffset + (clip.trimEnd - clip.trimStart)), 0);
  const selectedClip = clips.find(c => c.id === selectedClipId);

  // --- Handlers ---

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const url = URL.createObjectURL(file);
    const videoElement = document.createElement('video');
    videoElement.src = url;
    
    // Reset input value to allow selecting the same file again if needed
    event.target.value = '';
    
    videoElement.onloadedmetadata = () => {
      const type = file.type.startsWith('audio') ? 'audio' : 'video';
      
      // Find first available track spot roughly (simplified: just put on track 0)
      const newClip: Clip = {
        id: crypto.randomUUID(),
        fileUrl: url,
        type: type as 'video' | 'audio',
        name: file.name,
        duration: videoElement.duration,
        startOffset: currentTime, 
        trackIndex: 0, // Default to track 0
        trimStart: 0,
        trimEnd: videoElement.duration,
        volume: 1,
        isMuted: false
      };
      setClips(prev => [...prev, newClip]);
      
      setCurrentTime(currentTime + videoElement.duration);
    };
  };

  const togglePlay = () => setIsPlaying(!isPlaying);

  const handleDeleteClip = () => {
    if (selectedClipId) {
      setClips(prev => prev.filter(c => c.id !== selectedClipId));
      setSelectedClipId(null);
    }
  };

  const handleUpdateClip = (id: string, updates: Partial<Clip>) => {
    setClips(prev => prev.map(c => c.id === id ? { ...c, ...updates } : c));
  };

  const handleSplit = () => {
    if (!selectedClip) return;
    
    const clipDuration = selectedClip.trimEnd - selectedClip.trimStart;
    const clipEndTime = selectedClip.startOffset + clipDuration;
    
    if (currentTime > selectedClip.startOffset && currentTime < clipEndTime) {
      const splitPointRelative = currentTime - selectedClip.startOffset;
      const splitPointSource = selectedClip.trimStart + splitPointRelative;

      // First half
      const firstHalf = {
        ...selectedClip,
        trimEnd: splitPointSource
      };

      // Second half - inherits trackIndex
      const secondHalf: Clip = {
        ...selectedClip,
        id: crypto.randomUUID(),
        startOffset: currentTime,
        trimStart: splitPointSource,
        // trimEnd remains
        // trackIndex inherits from selectedClip implicitly via spread, but explicit is good
        trackIndex: selectedClip.trackIndex
      };

      setClips(prev => prev.map(c => c.id === selectedClip.id ? firstHalf : c).concat(secondHalf));
      setSelectedClipId(secondHalf.id);
    }
  };

  const handleSeparateAudio = () => {
    if (!selectedClip || selectedClip.type !== 'video') return;

    const updatedVideo = { ...selectedClip, isMuted: true };

    const audioClip: Clip = {
      ...selectedClip,
      id: crypto.randomUUID(),
      type: 'audio',
      name: `Audio from ${selectedClip.name}`,
      trackIndex: 0, // Put audio on first track
      isMuted: false
    };

    setClips(prev => prev.map(c => c.id === selectedClip.id ? updatedVideo : c).concat(audioClip));
  };

  const adjustTrim = (startDelta: number, endDelta: number) => {
    if (!selectedClip) return;
    const newTrimStart = Math.max(0, selectedClip.trimStart + startDelta);
    const newTrimEnd = Math.min(selectedClip.duration, selectedClip.trimEnd + endDelta);
    
    if (newTrimStart < newTrimEnd) {
      setClips(prev => prev.map(c => c.id === selectedClip.id ? {
        ...c,
        trimStart: newTrimStart,
        trimEnd: newTrimEnd
      } : c));
    }
  };

  const handleAIGenerate = async () => {
    if (!aiPrompt) return;
    setIsGenerating(true);
    
    try {
        await ensureApiKey(); 

        let url: string | null = null;
        if (aiMode === 'video') {
            url = await generateVideoClip(aiPrompt);
        } else {
            url = await generateVoiceover(aiPrompt);
        }

        if (url) {
            const tempEl = document.createElement(aiMode === 'video' ? 'video' : 'audio');
            tempEl.src = url;
            tempEl.onloadedmetadata = () => {
                 const newClip: Clip = {
                    id: crypto.randomUUID(),
                    fileUrl: url!,
                    type: aiMode,
                    name: `AI Generated ${aiMode === 'video' ? 'Video' : 'Audio'}`,
                    duration: tempEl.duration || 5,
                    startOffset: currentTime,
                    trackIndex: 0,
                    trimStart: 0,
                    trimEnd: tempEl.duration || 5,
                    volume: 1,
                    isMuted: false
                };
                setClips(prev => [...prev, newClip]);
                setIsAIModalOpen(false);
                setAiPrompt('');
                setIsGenerating(false);
            };
             if(aiMode === 'audio') {
                 setTimeout(() => {
                     if(tempEl.readyState === 0) {
                          const newClip: Clip = {
                            id: crypto.randomUUID(),
                            fileUrl: url!,
                            type: aiMode,
                            name: `AI Generated ${aiMode === 'video' ? 'Video' : 'Audio'}`,
                            duration: 10, 
                            startOffset: currentTime,
                            trackIndex: 0,
                            trimStart: 0,
                            trimEnd: 10,
                            volume: 1,
                            isMuted: false
                        };
                        setClips(prev => [...prev, newClip]);
                        setIsAIModalOpen(false);
                        setAiPrompt('');
                        setIsGenerating(false);
                     }
                 }, 1000);
            }
        }
    } catch (e) {
        alert("Generation failed. Check console or API Key.");
        setIsGenerating(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-950 text-slate-100 font-sans">
      <input 
        type="file" 
        ref={fileInputRef}
        accept="video/*,audio/*" 
        onChange={handleFileUpload} 
        className="hidden" 
      />

      <header className="h-14 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900">
        <div className="flex items-center gap-2">
            <Scissors className="text-indigo-500" />
            <h1 className="font-bold text-lg tracking-tight">NeuroCut <span className="text-xs font-normal text-slate-400 bg-slate-800 px-2 py-0.5 rounded ml-2">Beta</span></h1>
        </div>
        <div className="flex items-center gap-4">
             <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-sm font-medium transition-colors border border-slate-700 text-white"
             >
                 <Upload size={16} /> Импорт
             </button>

             <button className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-slate-800 hover:bg-slate-700 text-sm font-medium transition-colors border border-slate-700">
                 <Download size={16} /> Экспорт
             </button>
             <button 
                onClick={() => setIsAIModalOpen(true)}
                className="flex items-center gap-2 px-4 py-1.5 rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-sm font-medium transition-all shadow-lg shadow-indigo-500/20"
             >
                 <Wand2 size={16} /> AI Assistant
             </button>
        </div>
      </header>

      <div className="flex-1 flex overflow-hidden">
        <div className="flex-1 flex flex-col p-6 gap-4 bg-slate-950">
            <Player 
                clips={clips} 
                currentTime={currentTime} 
                isPlaying={isPlaying} 
                onTimeUpdate={setCurrentTime}
                onDurationChange={() => {}}
                onEnded={() => setIsPlaying(false)}
            />
            
            <div className="flex justify-center items-center gap-6 p-2">
                <button onClick={() => setCurrentTime(0)} className="text-slate-400 hover:text-white"><ArrowLeftToLine size={20}/></button>
                <button 
                    onClick={togglePlay} 
                    className="w-12 h-12 rounded-full bg-white text-slate-900 flex items-center justify-center hover:bg-slate-200 transition-colors shadow-lg"
                >
                    {isPlaying ? <Pause fill="currentColor" /> : <Play fill="currentColor" className="ml-1"/>}
                </button>
                <button onClick={() => setCurrentTime(totalDuration)} className="text-slate-400 hover:text-white"><ArrowRightToLine size={20}/></button>
                <div className="text-sm font-mono text-slate-400">
                    {Math.floor(currentTime / 60)}:{Math.floor(currentTime % 60).toString().padStart(2, '0')} / {Math.floor(totalDuration / 60)}:{Math.floor(totalDuration % 60).toString().padStart(2, '0')}
                </div>
            </div>
        </div>

        <div className="w-80 border-l border-slate-800 bg-slate-900 p-4 flex flex-col gap-6 overflow-y-auto">
            <div 
                onClick={() => fileInputRef.current?.click()}
                className="p-4 rounded-xl border-2 border-dashed border-slate-700 hover:border-indigo-500 hover:bg-slate-800/50 transition-all text-center group cursor-pointer relative"
            >
                <div className="flex flex-col items-center gap-2 text-slate-400 group-hover:text-indigo-400">
                    <Plus className="w-8 h-8" />
                    <span className="text-sm font-medium">Загрузить видео/аудио</span>
                </div>
            </div>

            {selectedClip ? (
                <div className="space-y-4">
                    <h3 className="font-semibold text-slate-200 border-b border-slate-700 pb-2">Редактирование</h3>
                    <div className="text-xs text-slate-400 mb-2 truncate" title={selectedClip.name}>{selectedClip.name}</div>
                    
                    <div className="grid grid-cols-2 gap-2">
                        <button onClick={handleSplit} className="flex flex-col items-center justify-center p-3 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700">
                            <Split size={20} className="mb-1 text-orange-400"/>
                            <span className="text-xs">Разрезать</span>
                        </button>
                        <button onClick={handleDeleteClip} className="flex flex-col items-center justify-center p-3 rounded bg-slate-800 hover:bg-red-900/30 border border-slate-700 hover:border-red-900">
                            <Trash2 size={20} className="mb-1 text-red-400"/>
                            <span className="text-xs">Удалить</span>
                        </button>
                    </div>

                    {selectedClip.type === 'video' && (
                         <button onClick={handleSeparateAudio} className="w-full flex items-center justify-center gap-2 p-3 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700">
                            <Volume2 size={16} className="text-emerald-400"/>
                            <span className="text-xs">Отделить звук</span>
                        </button>
                    )}

                    <div className="space-y-2">
                        <label className="text-xs uppercase font-bold text-slate-500">Подрезка (Trim)</label>
                        <div className="flex gap-2">
                            <button onClick={() => adjustTrim(1, 0)} className="flex-1 bg-slate-800 py-1 text-xs rounded hover:bg-slate-700">+ Начало</button>
                             <button onClick={() => adjustTrim(0, -1)} className="flex-1 bg-slate-800 py-1 text-xs rounded hover:bg-slate-700">- Конец</button>
                        </div>
                         <div className="text-xs text-center text-slate-500 font-mono">
                            {selectedClip.trimStart.toFixed(1)}s - {selectedClip.trimEnd.toFixed(1)}s
                        </div>
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex items-center justify-center text-slate-600 text-sm text-center italic">
                    Выберите клип
                </div>
            )}
        </div>
      </div>

      <Timeline 
        clips={clips} 
        duration={Math.max(totalDuration, 30)} 
        currentTime={currentTime}
        selectedClipId={selectedClipId}
        onSelectClip={setSelectedClipId}
        onSeek={setCurrentTime}
        onUpdateClip={handleUpdateClip}
      />

      {isAIModalOpen && (
          <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-slate-900 border border-slate-700 w-full max-w-md rounded-2xl shadow-2xl overflow-hidden">
                  <div className="p-6">
                      <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                          <Wand2 className="text-indigo-500" /> AI Генератор
                      </h2>
                      
                      <div className="flex gap-2 mb-6 p-1 bg-slate-800 rounded-lg">
                          <button 
                            onClick={() => setAiMode('video')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${aiMode === 'video' ? 'bg-indigo-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                          >
                              <Video size={16} /> Veo Video
                          </button>
                          <button 
                             onClick={() => setAiMode('audio')}
                             className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-md text-sm font-medium transition-all ${aiMode === 'audio' ? 'bg-emerald-600 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                          >
                              <Volume2 size={16} /> TTS Audio
                          </button>
                      </div>

                      <div className="space-y-2 mb-6">
                          <label className="text-sm text-slate-400">Промпт (Prompt)</label>
                          <textarea 
                            className="w-full bg-slate-950 border border-slate-700 rounded-lg p-3 text-sm focus:ring-2 focus:ring-indigo-500 outline-none resize-none h-24"
                            placeholder={aiMode === 'video' ? "Опишите сцену для видео..." : "Введите текст для озвучки..."}
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                          />
                      </div>

                      <div className="flex gap-3">
                          <button onClick={() => setIsAIModalOpen(false)} className="flex-1 py-2.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800 font-medium">
                              Отмена
                          </button>
                          <button 
                            onClick={handleAIGenerate} 
                            disabled={isGenerating || !aiPrompt}
                            className="flex-1 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium flex items-center justify-center gap-2"
                          >
                              {isGenerating ? (
                                  <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                                    Создаю...
                                  </>
                              ) : (
                                  "Сгенерировать"
                              )}
                          </button>
                      </div>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
}