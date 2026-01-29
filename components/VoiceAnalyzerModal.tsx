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
  language: "Tamil" | "English" | "Hindi" | "Malayalam" | "Telugu" | "Unknown";
  explanation: string;
}

export const VoiceAnalyzerModal: React.FC<VoiceAnalyzerModalProps> = ({ onClose }) => {
  const [isRecording, setIsRecording] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState(SUPPORTED_LANGUAGES[0]);
  const [analysisResult, setAnalysisResult] = useState<AnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        const audioBlob = new Blob(chunksRef.current, { type: 'audio/webm' });
        await analyzeAudio(audioBlob);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
      setAnalysisResult(null);
    } catch (err) {
      setError("Microphone access denied or not supported.");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
  };

  const analyzeAudio = async (blob: Blob) => {
    setLoading(true);
    setError(null);
    
    try {
      // Convert blob to base64
      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const result = reader.result as string;
          resolve(result.split(',')[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(blob);
      });

      // Initialize Gemini AI
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("API key not configured. Please add VITE_GEMINI_API_KEY to your .env.local file");
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ 
        model: "gemini-1.5-flash",
        generationConfig: {
          responseMimeType: "application/json"
        }
      });

      const langContext = selectedLanguage === "Auto (Detect Automatically)" 
        ? "Identify the language automatically from the audio. The language detection is informational and must not affect the prediction outcome." 
        : `The user has specified the language context as ${selectedLanguage}. Use this for informational purposes only; the classification must remain language-agnostic.`;

      const prompt = `Perform a language-agnostic voice classification. ${langContext} 
Determine if the audio sounds like a real human or synthetic AI based primarily on acoustic features and neural patterns. 

Respond ONLY in JSON format following this exact schema:
{
  "classification": "AI-generated" or "Human-generated",
  "confidence": <number between 0.0 and 1.0>,
  "language": "Tamil" or "English" or "Hindi" or "Malayalam" or "Telugu" or "Unknown",
  "explanation": "<string describing the result, referencing the detected language and prosody characteristics>"
}`;

      const result = await model.generateContent([
        {
          inlineData: {
            data: base64Data,
            mimeType: 'audio/webm'
          }
        },
        { text: prompt }
      ]);

      const response = await result.response;
      const text = response.text();
      
      // Parse JSON response
      const analysisData = JSON.parse(text) as AnalysisResponse;
      setAnalysisResult(analysisData);
      
    } catch (err: any) {
      console.error("Analysis Error:", err);
      if (err.message?.includes("API key")) {
        setError(err.message);
      } else {
        setError("AI analysis failed. Please try again. Make sure your audio is clear.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-black/80 backdrop-blur-sm">
      <div className="glass w-full max-w-lg rounded-3xl p-8 relative overflow-hidden animate-fade-in-up">
        <button onClick={onClose} className="absolute top-4 right-4 text-gray-400 hover:text-white transition-colors">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
        </button>

        <h2 className="text-3xl font-bold mb-6 text-gradient">Voice Analysis</h2>
        
        {!analysisResult && !loading && (
          <div className="space-y-6">
            <div className="bg-white/5 p-4 rounded-xl border border-white/10">
              <label className="block text-xs font-bold text-indigo-400 uppercase tracking-widest mb-2">Detection Mode</label>
              <select 
                value={selectedLanguage}
                onChange={(e) => setSelectedLanguage(e.target.value)}
                className="w-full bg-[#0b0f14] border border-white/10 rounded-lg px-4 py-2 text-white focus:outline-none focus:border-indigo-500 transition-colors"
              >
                {SUPPORTED_LANGUAGES.map(lang => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
              <p className="text-[10px] text-gray-500 mt-2">Manual selection is informational and won't bias the classification.</p>
            </div>

            <div className="text-center py-6">
              <div className={`w-24 h-24 mx-auto rounded-full flex items-center justify-center mb-6 transition-all duration-300 ${isRecording ? 'bg-red-500/20 scale-110 shadow-[0_0_30px_rgba(239,68,68,0.4)]' : 'bg-indigo-600/20'}`}>
                <button 
                  onClick={isRecording ? stopRecording : startRecording}
                  className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-red-500 animate-pulse' : 'bg-indigo-600 hover:bg-indigo-500'}`}
                >
                  {isRecording ? (
                    <div className="w-6 h-6 bg-white rounded-sm"></div>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"></path><path d="M19 10v2a7 7 0 0 1-14 0v-2"></path><line x1="12" y1="19" x2="12" y2="22"></line></svg>
                  )}
                </button>
              </div>
              <p className="text-gray-400 text-lg px-4">
                {isRecording ? "Recording... Speak naturally." : "System is ready for language-agnostic detection."}
              </p>
              {isRecording && <div className="mt-4 flex gap-1 justify-center">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="w-1 bg-indigo-500 animate-[wave_1s_infinite]" style={{animationDelay: `${i*0.1}s`, height: `${10 + Math.random()*20}px`}}></div>
                ))}
              </div>}
            </div>
          </div>
        )}

        {loading && (
          <div className="text-center py-20">
            <div className="inline-block w-12 h-12 border-4 border-indigo-500/20 border-t-indigo-500 rounded-full animate-spin mb-6"></div>
            <p className="text-gray-300 font-medium">Classiflick AI is analyzing acoustic patterns...</p>
          </div>
        )}

        {analysisResult && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex items-center justify-between p-4 bg-white/5 rounded-2xl border border-white/10">
              <div>
                <div className="text-xs text-gray-500 uppercase font-bold tracking-widest mb-1">Status</div>
                <div className={`text-2xl font-bold ${analysisResult.classification === 'Human-generated' ? 'text-emerald-400' : 'text-red-400'}`}>
                  {analysisResult.classification}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xs text-gray-500 uppercase font-bold tracking-widest mb-1">Confidence</div>
                <div className="text-2xl font-bold text-white">{(analysisResult.confidence * 100).toFixed(1)}%</div>
              </div>
            </div>

            <div className="p-4 bg-white/5 rounded-2xl border border-white/10 text-center">
              <div className="text-xs text-gray-500 uppercase font-bold tracking-widest mb-1">Detected Language</div>
              <div className="text-xl font-medium text-indigo-400">{analysisResult.language}</div>
            </div>

            <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
              <div className="text-xs text-gray-500 uppercase font-bold tracking-widest mb-1">Explanation</div>
              <p className="text-sm text-gray-400 leading-relaxed mt-1">{analysisResult.explanation}</p>
            </div>

            <button 
              onClick={() => setAnalysisResult(null)}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all active:scale-95"
            >
              Scan Another Voice
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm text-center">
            {error}
          </div>
        )}
      </div>
      <style>{`
        @keyframes wave {
          0%, 100% { height: 10px; }
          50% { height: 30px; }
        }
        .animate-fade-in-up {
          animation: fadeInUp 0.4s ease-out forwards;
        }
        .animate-fade-in {
          animation: fadeIn 0.3s ease-out forwards;
        }
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; }
          to { opacity: 1; }
        }
      `}</style>
    </div>
  );
};
