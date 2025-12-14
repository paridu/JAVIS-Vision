
import { GoogleGenAI, LiveServerMessage, Modality, FunctionDeclaration, Type } from "@google/genai";
import { MODELS, JARVIS_PERSONA } from "../constants";
import { base64ToFloat32Array, createPCMBlob } from "../utils/audioUtils";
import { ToolCallData } from "../types";

// Tool Definitions
const TOOLS: FunctionDeclaration[] = [
  {
    name: 'switch_camera',
    description: 'Switch the user video input camera (e.g. front to back).',
    parameters: { type: Type.OBJECT, properties: {} }
  },
  {
    name: 'play_youtube',
    description: 'Play a YouTube video or search for a video.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: { type: Type.STRING, description: 'Search query for the video' }
      },
      required: ['query']
    }
  },
  {
    name: 'reset_mirror',
    description: 'Reset the UI or mirror display to default state.',
    parameters: { type: Type.OBJECT, properties: {} }
  }
];

class LiveService {
  private client: GoogleGenAI;
  private sessionPromise: Promise<any> | null = null;
  private audioContext: AudioContext | null = null;
  private inputSource: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private outputNode: GainNode | null = null;
  private isMuted: boolean = false;
  
  // Audio Playback State
  private nextStartTime: number = 0;
  private scheduledSources: Set<AudioBufferSourceNode> = new Set();
  
  // Callbacks
  public onVolumeChange: ((vol: number) => void) | null = null;
  public onToolCall: ((tool: ToolCallData) => Promise<any>) | null = null;
  public onStateChange: ((isActive: boolean) => void) | null = null;
  public onTranscript: ((text: string, type: 'user' | 'model') => void) | null = null;

  constructor() {
    this.client = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  public setMuted(muted: boolean) {
    this.isMuted = muted;
  }

  public async connect() {
    this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
    this.outputNode = this.audioContext.createGain();
    this.outputNode.connect(this.audioContext.destination);

    // Get Mic Stream
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
    
    // Config
    const config = {
      model: MODELS.LIVE,
      callbacks: {
        onopen: this.handleOpen.bind(this, stream),
        onmessage: this.handleMessage.bind(this),
        onerror: (e: any) => console.error("Live API Error:", e),
        onclose: () => {
          console.log("Live API Closed");
          this.disconnect();
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Kore' } },
        },
        systemInstruction: JARVIS_PERSONA.systemInstruction,
        // Fixed: Removed googleSearch/googleMaps as they cannot be mixed with functionDeclarations in the current API version
        tools: [
          { functionDeclarations: TOOLS }
        ],
        inputAudioTranscription: {},
        outputAudioTranscription: {},
      },
    };

    this.sessionPromise = this.client.live.connect(config);
    if (this.onStateChange) this.onStateChange(true);
  }

  private handleOpen(stream: MediaStream) {
    console.log("Live Session Connected");
    
    // Setup Audio Input Processing (Mic -> 16kHz PCM -> API)
    // Create a separate context for input if needed to match 16k, but downsampling via ScriptProcessor is easier here
    const inputCtx = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
    this.inputSource = inputCtx.createMediaStreamSource(stream);
    this.processor = inputCtx.createScriptProcessor(4096, 1, 1);

    this.processor.onaudioprocess = (e) => {
      if (this.isMuted) return;

      const inputData = e.inputBuffer.getChannelData(0);
      
      // Calculate Volume for Visualizer
      let sum = 0;
      for (let i = 0; i < inputData.length; i++) sum += inputData[i] * inputData[i];
      const vol = Math.sqrt(sum / inputData.length);
      if (this.onVolumeChange) this.onVolumeChange(vol * 500); // Scale up for UI

      // Send to API
      const pcmBlob = createPCMBlob(inputData, 16000);
      this.sessionPromise?.then(session => {
        session.sendRealtimeInput({ media: pcmBlob });
      });
    };

    this.inputSource.connect(this.processor);
    this.processor.connect(inputCtx.destination);
  }

  private async handleMessage(message: LiveServerMessage) {
    // 1. Handle Audio Output (Server -> User)
    const audioData = message.serverContent?.modelTurn?.parts?.[0]?.inlineData?.data;
    if (audioData && this.audioContext) {
      const float32 = base64ToFloat32Array(audioData);
      const buffer = this.audioContext.createBuffer(1, float32.length, 24000);
      buffer.copyToChannel(float32, 0);

      const source = this.audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(this.outputNode!);

      // Audio Scheduling
      this.nextStartTime = Math.max(this.audioContext.currentTime, this.nextStartTime);
      source.start(this.nextStartTime);
      this.nextStartTime += buffer.duration;
      
      this.scheduledSources.add(source);
      source.onended = () => this.scheduledSources.delete(source);
    }

    // 2. Handle Transcription
    if (message.serverContent?.outputTranscription?.text) {
      this.onTranscript?.(message.serverContent.outputTranscription.text, 'model');
    }
    if (message.serverContent?.inputTranscription?.text) {
      this.onTranscript?.(message.serverContent.inputTranscription.text, 'user');
    }

    // 3. Handle Interrupts
    if (message.serverContent?.interrupted) {
      this.clearAudioQueue();
    }

    // 4. Handle Tool Calls
    if (message.toolCall) {
      for (const call of message.toolCall.functionCalls) {
        console.log("Tool Call:", call.name, call.args);
        
        let result = { result: "ok" };
        if (this.onToolCall) {
          try {
             // Execute client-side tool logic
             const customResult = await this.onToolCall({ name: call.name as any, args: call.args as any });
             if (customResult) result = customResult;
          } catch (e) {
             result = { error: "Tool execution failed" } as any;
          }
        }

        // Send Response back to model
        this.sessionPromise?.then(session => {
          session.sendToolResponse({
            functionResponses: {
              id: call.id,
              name: call.name,
              response: result
            }
          });
        });
      }
    }
  }

  public sendVideoFrame(base64Data: string) {
    this.sessionPromise?.then(session => {
      session.sendRealtimeInput({
        media: {
          mimeType: 'image/jpeg',
          data: base64Data
        }
      });
    });
  }

  public clearAudioQueue() {
    this.scheduledSources.forEach(s => {
      try { s.stop(); } catch (e) {}
    });
    this.scheduledSources.clear();
    this.nextStartTime = this.audioContext?.currentTime || 0;
  }

  public disconnect() {
    this.inputSource?.disconnect();
    this.processor?.disconnect();
    this.clearAudioQueue();
    // No explicit close method on sessionPromise wrapper easily accessible, 
    // but stopping streams effectively kills interaction.
    // In a real app, we'd trigger the SDK close.
    if (this.onStateChange) this.onStateChange(false);
    this.sessionPromise = null;
  }
}

export const liveService = new LiveService();
