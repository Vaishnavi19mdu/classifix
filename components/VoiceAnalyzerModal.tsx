import React, { useState, useRef } from 'react';
import { GoogleGenerativeAI } from "@google/generative-ai";

interface VoiceAnalyzerModalProps {
  onClose: () => void;
}

const SUPPORTED_LANGUAGES = [
  "Auto (Detect Automatically)",
  "English",
  "Tamil",
  "Hindi",
  "Malayalam",
  "Telugu"
];

interface AnalysisResponse {
  classification: "AI-generated" | "Human-generated";
  confidence: number;
  language: string;
  explanation: string;
}

export const VoiceAnalyzerModal: React.FC<VoiceAnalyzerModalProps> = ({ onClose }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(SUPPORTED_LANGUAGES[0]);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await analyzeAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
      setAnalysisResult(null);
    } catch (err: any) {
      setError(err.message || "Microphone access denied.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const analyzeAudio = async (audioBlob: Blob) => {
    setLoading(true);
    setError(null);
    
    try {
      // Convert audio to base64
      const base64Audio = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const base64 = (reader.result as string).split(',')[1];
          resolve(base64);
        };
        reader.onerror = reject;
        reader.readAsDataURL(audioBlob);
      });

      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) throw new Error("VITE_GEMINI_API_KEY is missing from .env.local");

      const genAI = new GoogleGenerativeAI(apiKey);
      
      // Use gemini-2.5-flash model
      const model = genAI.getGenerativeModel(
        { model: "gemini-2.5-flash" },
        { apiVersion: 'v1' } 
      );

      const langContext = selectedLanguage === "Auto (Detect Automatically)" 
        ? "Detect the language automatically." 
        : `The expected language is ${selectedLanguage}.`;

      const prompt = `Analyze this audio recording to determine if it's from a real human voice or AI-generated (text-to-speech, deepfake, etc.).

${langContext}

Focus on:
1. Vocal authenticity - natural breath sounds, micro-variations in pitch
2. Prosody patterns - human-like rhythm and intonation changes
3. Spectral characteristics - frequency distributions typical of human vs synthetic voices
4. Artifacts - digital artifacts common in TTS/AI voices
5. Emotional authenticity - genuine emotional expression in voice

Respond ONLY in valid JSON format (no markdown):
{
  "classification": "Human-generated" or "AI-generated",
  "confidence": <number 0.0 to 1.0>,
  "language": "English" or "Tamil" or "Hindi" or "Malayalam" or "Telugu" or "Unknown",
  "explanation": "Brief explanation of acoustic features that led to this classification"
}`;

      const result = await model.generateContent([
        {
          inlineData: {
            mimeType: 'audio/webm',
            data: base64Audio
          }
        },
        { text: prompt }
      ]);

      const response = await result.response;
      const text = response.text();
      
      const cleanJson = text.replace(/```json|```/g, "").trim();
      setAnalysisResult(JSON.parse(cleanJson));
      
    } catch (err: any) {
      console.error("Analysis Error:", err);
      if (err.message?.includes("not found") || err.message?.includes("404")) {
        setError("Audio analysis not supported with current API. The model may not support audio input yet.");
      } else {
        setError(`Error: ${err.message || "Analysis failed"}`);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
      <div className="bg-gray-900 w-full max-w-lg rounded-3xl p-8 relative border border-white/10 shadow-2xl">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white">✕</button>

        <h2 className="text-2xl font-bold mb-6 text-white">Voice Authenticity Analyzer</h2>
        
        <div className="space-y-6">
          <div className="bg-white/5 p-4 rounded-xl">
            <label className="block text-xs font-bold text-indigo-400 uppercase mb-2">Detection Mode</label>
            <select 
              value={selectedLanguage}
              onChange={(e) => setSelectedLanguage(e.target.value)}
              className="w-full bg-black border border-white/10 rounded-lg px-4 py-2 text-white outline-none focus:border-indigo-500"
              disabled={isRecording}
            >
              {SUPPORTED_LANGUAGES.map(lang => <option key={lang} value={lang}>{lang}</option>)}
            </select>
            <p className="text-xs text-gray-500 mt-2">Analyzes actual audio waveforms, not just text.</p>
          </div>

          <div className="flex flex-col items-center justify-center p-8 border-2 border-dashed border-white/10 rounded-2xl bg-black/20">
            {isRecording ? (
              <>
                <div className="w-20 h-20 rounded-full bg-red-500/20 flex items-center justify-center mb-4 animate-pulse">
                  <div className="w-12 h-12 rounded-full bg-red-500 flex items-center justify-center">
                    <div className="w-4 h-4 bg-white rounded-sm"></div>
                  </div>
                </div>
                <button 
                  onClick={stopRecording} 
                  className="bg-red-500 hover:bg-red-600 text-white px-8 py-3 rounded-full font-bold transition-all"
                >
                  Stop Recording
                </button>
                <p className="text-gray-400 text-sm mt-4">Recording... Speak for 3-5 seconds</p>
              </>
            ) : loading ? (
              <>
                <div className="w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-4"></div>
                <p className="text-gray-300 font-medium">Analyzing audio waveforms...</p>
                <p className="text-gray-500 text-xs mt-2">This may take 10-15 seconds</p>
              </>
            ) : (
              <>
                <div className="w-20 h-20 rounded-full bg-indigo-600/20 flex items-center justify-center mb-4">
                  <svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
                    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path>
                    <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
                    <line x1="12" y1="19" x2="12" y2="22"></line>
                  </svg>
                </div>
                <button 
                  onClick={startRecording} 
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-full font-bold transition-all"
                >
                  Start Voice Analysis
                </button>
                <p className="text-gray-400 text-sm mt-4">Click to analyze your voice</p>
              </>
            )}
          </div>

          {error && (
            <div className="p-4 bg-red-500/10 border border-red-500/50 rounded-xl text-red-500 text-sm">
              <strong>Error:</strong> {error}
            </div>
          )}

          {analysisResult && (
            <div className="space-y-3 animate-fade-in">
              <div className="p-3 bg-indigo-500/10 border border-indigo-500/50 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <h3 className="font-bold text-[10px] text-gray-400 uppercase mb-0.5">Classification</h3>
                    <div className={`text-base font-bold shine-text ${analysisResult.classification === 'Human-generated' ? 'text-green-400' : 'text-red-400'}`}>
                      {analysisResult.classification}
                    </div>
                  </div>
                  <div className="text-right">
                    <h3 className="font-bold text-[10px] text-gray-400 uppercase mb-0.5">Confidence</h3>
                    <div className="text-base font-bold text-white shine-text">
                      {(analysisResult.confidence * 100).toFixed(1)}%
                    </div>
                  </div>
                </div>
                
                <div className="mb-2 pb-2 border-b border-white/10">
                  <h3 className="font-bold text-[10px] text-gray-400 uppercase mb-0.5">Language</h3>
                  <div className="text-sm text-indigo-400 font-medium">{analysisResult.language}</div>
                </div>

                <div>
                  <h3 className="font-bold text-[10px] text-gray-400 uppercase mb-0.5">Explanation</h3>
                  <p className="text-[11px] text-gray-300 leading-relaxed">{analysisResult.explanation}</p>
                </div>
              </div>

              <button 
                onClick={() => setAnalysisResult(null)}
                className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition-all"
              >
                Analyze Another Voice
              </button>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @keyframes fade-in {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fade-in 0.3s ease-out;
        }
        
        @keyframes shine {
          0% { filter: brightness(1); }
          50% { filter: brightness(1.3) drop-shadow(0 0 8px currentColor); }
          100% { filter: brightness(1); }
        }
        .shine-text {
          animation: shine 2s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
};