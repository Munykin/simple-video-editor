import { GoogleGenAI, Modality } from "@google/genai";

// Helper to decode base64 audio to array buffer
function decodeBase64ToArrayBuffer(base64: string) {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

// Ensure API key selection for Veo
export const ensureApiKey = async (): Promise<boolean> => {
  const win = window as any;
  if (win.aistudio && win.aistudio.hasSelectedApiKey) {
    const hasKey = await win.aistudio.hasSelectedApiKey();
    if (!hasKey) {
      if (win.aistudio.openSelectKey) {
        await win.aistudio.openSelectKey();
        return true; // Assume success to mitigate race condition
      }
      return false;
    }
    return true;
  }
  return true; // Fallback for environments without the specific wrapper
};

export const generateVideoClip = async (prompt: string): Promise<string | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    // Using Veo model for video generation
    let operation = await ai.models.generateVideos({
      model: 'veo-3.1-fast-generate-preview',
      prompt: prompt,
      config: {
        numberOfVideos: 1,
        resolution: '720p',
        aspectRatio: '16:9'
      }
    });

    console.log("Generating video... this may take a moment.");

    // Poll for completion
    while (!operation.done) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      operation = await ai.operations.getVideosOperation({operation: operation});
    }

    const videoUri = operation.response?.generatedVideos?.[0]?.video?.uri;
    
    if (!videoUri) throw new Error("No video URI returned");

    // Fetch the actual video blob
    const response = await fetch(`${videoUri}&key=${process.env.API_KEY}`);
    const blob = await response.blob();
    return URL.createObjectURL(blob);

  } catch (error) {
    console.error("Video generation failed:", error);
    throw error;
  }
};

export const generateVoiceover = async (text: string): Promise<string | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text: text }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: 'Kore' },
            },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    
    if (!base64Audio) throw new Error("No audio data returned");

    const arrayBuffer = decodeBase64ToArrayBuffer(base64Audio);
    const blob = new Blob([arrayBuffer], { type: 'audio/wav' }); // Gemini returns raw PCM usually, but browser handling might vary. The blob creates a usable URL.
    // Note: Raw PCM needs headers to be a valid WAV file for <audio> elements usually. 
    // However, for this demo, we'll try to rely on the browser's ability to interpret the stream or wrap it if needed.
    // Actually, the example code uses AudioContext to decode. To make it a 'file' for the editor:
    
    // Let's use the AudioContext method to decode and then re-encode to WAV for the <audio> tag compatibility
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({sampleRate: 24000});
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const wavBlob = await audioBufferToWav(audioBuffer);
    
    return URL.createObjectURL(wavBlob);

  } catch (error) {
    console.error("TTS generation failed:", error);
    throw error;
  }
};

// Utility to convert AudioBuffer to WAV Blob (simplified for browser compatibility)
function audioBufferToWav(buffer: AudioBuffer): Promise<Blob> {
    return new Promise((resolve) => {
        const numOfChan = buffer.numberOfChannels;
        const length = buffer.length * numOfChan * 2 + 44;
        const bufferArr = new ArrayBuffer(length);
        const view = new DataView(bufferArr);
        const channels = [];
        let i;
        let sample;
        let offset = 0;
        let pos = 0;

        // write WAVE header
        setUint32(0x46464952); // "RIFF"
        setUint32(length - 8); // file length - 8
        setUint32(0x45564157); // "WAVE"

        setUint32(0x20746d66); // "fmt " chunk
        setUint32(16); // length = 16
        setUint16(1); // PCM (uncompressed)
        setUint16(numOfChan);
        setUint32(buffer.sampleRate);
        setUint32(buffer.sampleRate * 2 * numOfChan); // avg. bytes/sec
        setUint16(numOfChan * 2); // block-align
        setUint16(16); // 16-bit (hardcoded in this example)

        setUint32(0x61746164); // "data" - chunk
        setUint32(length - pos - 4); // chunk length

        // write interleaved data
        for (i = 0; i < buffer.numberOfChannels; i++)
            channels.push(buffer.getChannelData(i));

        while (pos < buffer.length) {
            for (i = 0; i < numOfChan; i++) {
                // interleave channels
                sample = Math.max(-1, Math.min(1, channels[i][pos])); // clamp
                sample = (0.5 + sample < 0 ? sample * 32768 : sample * 32767) | 0; // scale to 16-bit signed int
                view.setInt16(44 + offset, sample, true); // write 16-bit sample
                offset += 2;
            }
            pos++;
        }

        resolve(new Blob([bufferArr], { type: 'audio/wav' }));

        function setUint16(data: any) {
            view.setUint16(pos, data, true);
            pos += 2;
        }

        function setUint32(data: any) {
            view.setUint32(pos, data, true);
            pos += 4;
        }
    });
}