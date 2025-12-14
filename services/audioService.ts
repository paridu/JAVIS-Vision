
import { AudioVisualizerData } from "../types";

// Define SpeechRecognition interfaces for TypeScript
interface IWindow extends Window {
  SpeechRecognition: any;
  webkitSpeechRecognition: any;
}

class AudioService {
  private audioContext: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private dataArray: Uint8Array | null = null;
  
  // TTS State
  private synthesis: SpeechSynthesis;
  private voices: SpeechSynthesisVoice[] = [];

  // STT State
  private recognition: any = null;

  constructor() {
    this.synthesis = window.speechSynthesis;
    if (this.synthesis) {
        this.synthesis.onvoiceschanged = () => {
            this.voices = this.synthesis.getVoices();
        };
    }

    // Initialize Speech Recognition
    if (typeof window !== 'undefined') {
        const { SpeechRecognition, webkitSpeechRecognition } = window as unknown as IWindow;
        const SpeechRecognitionConstructor = SpeechRecognition || webkitSpeechRecognition;
        
        if (SpeechRecognitionConstructor) {
            this.recognition = new SpeechRecognitionConstructor();
            this.recognition.lang = 'en-US'; // Default to English for commands, can be 'th-TH'
            this.recognition.continuous = false;
            this.recognition.interimResults = false;
            this.recognition.maxAlternatives = 1;
        }
    }
  }

  public initAudioContext(): void {
    if (!this.audioContext) {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 256; // Balance between detail and performance
      const bufferLength = this.analyser.frequencyBinCount;
      this.dataArray = new Uint8Array(bufferLength);
    }
  }

  public speak(text: string, onEnd?: () => void): void {
    if (!this.synthesis) return;
    
    this.synthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voice = this.voices.find(v => v.name.includes("Google US English") || v.name.includes("Samantha")) || this.voices[0];
    if (voice) utterance.voice = voice;
    
    utterance.rate = 1.05; 
    utterance.pitch = 0.95; 

    utterance.onend = () => {
      if (onEnd) onEnd();
    };
    
    this.synthesis.speak(utterance);
  }

  // Start Listening (STT)
  public startListening(
      onResult: (text: string) => void, 
      onEnd: () => void,
      onError: (error: any) => void
  ): void {
      if (!this.recognition) {
          onError("Speech Recognition API not supported in this browser.");
          onEnd();
          return;
      }

      // Ensure we don't have dangling handlers
      this.recognition.onstart = () => {
        console.log("Speech Recognition Started");
      };

      this.recognition.onresult = (event: any) => {
          const text = event.results[0][0].transcript;
          if (text) {
             onResult(text);
          }
      };

      this.recognition.onerror = (event: any) => {
          console.error("Speech Recognition Error:", event.error);
          onError(event.error);
      };

      this.recognition.onend = () => {
          onEnd();
      };

      try {
          this.recognition.start();
      } catch (e) {
          // If already started, stop and restart or just log
          console.warn("Recognition start failed (maybe already active):", e);
          try {
             this.recognition.stop();
             setTimeout(() => this.recognition.start(), 100);
          } catch (retryErr) {
             onError(retryErr);
          }
      }
  }

  public stopListening(): void {
      if (this.recognition) {
          try {
            this.recognition.stop();
          } catch(e) {
            console.warn("Error stopping recognition", e);
          }
      }
  }

  public getAnalysisData(): AudioVisualizerData {
    if (!this.analyser || !this.dataArray) {
      return { frequencyData: new Uint8Array(0), volume: 0 };
    }

    this.analyser.getByteFrequencyData(this.dataArray);
    
    let sum = 0;
    for (let i = 0; i < this.dataArray.length; i++) {
      sum += this.dataArray[i];
    }
    const volume = sum / this.dataArray.length;

    return {
      frequencyData: this.dataArray,
      volume: volume
    };
  }
}

export const audioService = new AudioService();