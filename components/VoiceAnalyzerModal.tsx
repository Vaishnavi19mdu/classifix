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
  const [transcription, setTranscription] = useState<string>("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const recognitionRef = useRef<any>(null);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      // Start speech recognition
      const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (SpeechRecognition) {
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = false;
        
        // Set language based on selection
        const langMap: Record<string, string> = {
          "English": "en-US",
          "Tamil": "ta-IN",
          "Hindi": "hi-IN",
          "Malayalam": "ml-IN",
          "Telugu": "te-IN"
        };
        
        if (selectedLanguage !== "Auto (Detect Automatically)") {
          recognition.lang = langMap[selectedLanguage] || "en-US";
        } else {
          recognition.lang = "en-US"; // Default to English for auto detect
        }

        let fullTranscript = "";
        recognition.onresult = (event: any) => {
          for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) {
              fullTranscript += event.results[i][0].transcript + " ";
            }
          }
          setTranscription(fullTranscript.trim());
        };

        recognition.start();
        recognitionRef.current = recognition;
      }

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        if (recognitionRef.current) {
          recognitionRef.current.stop();
        }
        // Wait a moment for final transcription
        setTimeout(() => {
          analyzeTranscription();
        }, 500);
      };

      mediaRecorder.start();
      setIsRecording(true);
      setError(null);
      setAnalysisResult(null);
      setTranscription("");
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

  const analyzeTranscription = async () => {
    if (!transcription || transcription.length < 3) {
      setError("Could not transcribe audio. Please speak clearly and try again.");
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const apiKey = import.meta.env.VITE_GEMINI_API_KEY || import.meta.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("API key not configured. Please add VITE_GEMINI_API_KEY to your .env.local file");
      }

      const genAI = new GoogleGenerativeAI(apiKey);
      
      // Try all possible model names that might work
      const modelNames = [
        "gemini-1.5-flash-latest",
        "gemini-1.5-flash",
        "gemini-flash-1.5",
        "models/gemini-1.5-flash-latest"
      ];
      
      let model;
      let lastError;
      
      for (const modelName of modelNames) {
        try {
          model = genAI.getGenerativeModel({ model: modelName });
          
          const langContext = selectedLanguage === "Auto (Detect Automatically)" 
            ? "Identify the language automatically from the transcription." 
            : `The user specified ${selectedLanguage} as the language context.`;

          const prompt = `You are a voice authenticity analyzer. Based on the following transcribed speech, analyze if it's likely from a real human or AI-generated voice.

Transcription: "${transcription}"

${langContext}

Consider these factors:
1. Natural speech patterns and conversational flow
2. Presence of filler words (um, uh, like, you know)
3. Grammar and structure naturalness
4. Emotional undertones
5. Contextual coherence

Respond ONLY in JSON format (no markdown, no code blocks):
{
  "classification": "AI-generated" or "Human-generated",
  "confidence": <number between 0.0 and 1.0>,
  "language": "Tamil" or "English" or "Hindi" or "Malayalam" or "Telugu" or "Unknown",
  "explanation": "<string describing your reasoning based on the transcription analysis>"
}`;

          const result = await model.generateContent(prompt);
          const response = await result.response;
          const text = response.text();
          
          const cleanText = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
          const analysisData = JSON.parse(cleanText) as AnalysisResponse;
          setAnalysisResult(analysisData);
          return; // Success! Exit the function
          
        } catch (err: any) {
          console.log(`Model ${modelName} failed, trying next...`);
          lastError = err;
          continue;
        }
      }
      
      // If we get here, all models failed
      throw lastError;
      
    } catch (err: any) {
      console.error("Analysis Error:", err);
      if (err.message?.includes("API key")) {
        setError("Invalid API key. Please check your .env.local file.");
      } else if (err.message?.includes("quota")) {
        setError("API quota exceeded. Please try again later.");
      } else if (err.message?.includes("not found") || err.message?.includes("404")) {
        setError("Your API key doesn't have access to Gemini models. Please go to https://aistudio.google.com and enable the Gemini API for your project.");
      } else {
        setError("Analysis failed. Error: " + (err.message || "Unknown error"));
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
                disabled={isRecording}
              >
                {SUPPORTED_LANGUAGES.map(lang => (
                  <option key={lang} value={lang}>{lang}</option>
                ))}
              </select>
              <p className="text-[10px] text-gray-500 mt-2">Speech recognition helps with analysis accuracy.</p>
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
              {transcription && isRecording && (
                <div className="mt-4 p-3 bg-white/5 rounded-lg text-sm text-gray-300 max-h-20 overflow-y-auto">
                  "{transcription}"
                </div>
              )}
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
            <p className="text-gray-300 font-medium">Classiflick AI is analyzing patterns...</p>
            {transcription && <p className="text-gray-500 text-sm mt-2">Transcription: "{transcription}"</p>}
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
              <div className="text-xs text-gray-500 uppercase font-bold tracking-widest mb-1">Transcription</div>
              <p className="text-sm text-gray-400 leading-relaxed mt-1">"{transcription}"</p>
            </div>

            <div className="p-4 bg-white/5 rounded-2xl border border-white/10">
              <div className="text-xs text-gray-500 uppercase font-bold tracking-widest mb-1">Explanation</div>
              <p className="text-sm text-gray-400 leading-relaxed mt-1">{analysisResult.explanation}</p>
            </div>

            <button 
              onClick={() => {
                setAnalysisResult(null);
                setTranscription("");
              }}
              className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl transition-all active:scale-95"
            >
              Scan Another Voice
            </button>
          </div>
        )}

        {error && (
          <div className="mt-4 p-4 bg-red-500/10 border border-red-500/20 rounded-xl text-red-400 text-sm">
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