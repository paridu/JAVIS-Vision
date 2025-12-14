import React, { useState, useEffect, useRef } from 'react';
import JarvisFace from '../components/JarvisFace';
import { liveService } from '../services/liveService';
import { geminiService } from '../services/geminiService';
import { audioService } from '../services/audioService';
import { memoryService } from '../services/memoryService'; // Import Memory Service
import { AgentState, ToolCallData } from '../types';

const Assistant: React.FC = () => {
  const [isInitialized, setIsInitialized] = useState(false);
  const [state, setState] = useState<AgentState>(AgentState.IDLE);
  const [lastTranscript, setLastTranscript] = useState<string>("SYSTEM STANDBY");
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [roboticsData, setRoboticsData] = useState<any>(null);
  const [faceData, setFaceData] = useState<any>(null);
  const [isFaceLocked, setIsFaceLocked] = useState(false);
  const [isVideoActive, setIsVideoActive] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [liveVolume, setLiveVolume] = useState(0);

  // Refs for tracking state inside callbacks without triggering effects
  const stateRef = useRef(state);
  const isInitializedRef = useRef(isInitialized);

  // Hardware Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoIntervalRef = useRef<number | null>(null);

  // Sync refs with state
  useEffect(() => { stateRef.current = state; }, [state]);
  useEffect(() => { isInitializedRef.current = isInitialized; }, [isInitialized]);

  useEffect(() => {
    // Setup Live Service Handlers (Run once on mount)
    liveService.onStateChange = (isActive) => {
      // Keep state IDLE/LISTENING if active, otherwise ERROR/IDLE
      if (!isActive && isInitializedRef.current) setState(AgentState.IDLE);
    };

    liveService.onTranscript = (text, type) => {
      setLastTranscript(type === 'user' ? `USER: ${text}` : `JARVIS: ${text}`);
      if (type === 'model') setState(AgentState.SPEAKING);
      
      // Auto-revert to IDLE/LISTENING after speaking
      if (type === 'model') {
          setTimeout(() => {
              // Only revert if we haven't moved to another active state
              if (stateRef.current === AgentState.SPEAKING) {
                  setState(AgentState.IDLE);
              }
          }, 3000);
      }
    };

    liveService.onVolumeChange = (vol) => {
       setLiveVolume(vol);
       // Visual feedback for listening (Standby Mode)
       // Use Ref to check current state to avoid closure staleness
       if (vol > 10 && stateRef.current !== AgentState.SPEAKING && stateRef.current !== AgentState.THINKING) {
           setState(AgentState.LISTENING);
       } else if (vol <= 10 && stateRef.current === AgentState.LISTENING) {
           setState(AgentState.IDLE);
       }
    };

    liveService.onToolCall = async (tool: ToolCallData) => {
      setLastTranscript(`EXECUTING: ${tool.name.toUpperCase()}`);
      if (tool.name === 'switch_camera') {
        setLastTranscript("SWITCHING OPTICAL SENSORS...");
        return { result: "Camera switched" };
      }
      if (tool.name === 'play_youtube') {
         window.open(`https://www.youtube.com/results?search_query=${tool.args.query}`, '_blank');
         return { result: "Opened YouTube" };
      }
      return { result: "ok" };
    };

    return () => {
      // Cleanup only on unmount
      stopVideo();
      liveService.disconnect();
    };
  }, []); // Empty dependency array ensures this runs once and doesn't interrupt video on state change

  // --- Video Handling ---
  const startVideo = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        // Catch play errors (like interruption) to prevent unhandled promise rejections
        videoRef.current.play().catch(e => {
            console.log("Video playback handled:", e.message);
        });
        setIsVideoActive(true);
        
        // Start streaming frames to Live API
        if (videoIntervalRef.current) clearInterval(videoIntervalRef.current);
        videoIntervalRef.current = window.setInterval(() => {
          captureAndSendFrame();
        }, 1000); // 1 FPS for efficiency
      }
    } catch (e) {
      console.error("Camera Error", e);
      setLastTranscript("VISUAL SENSORS OFFLINE");
    }
  };

  const stopVideo = () => {
    if (videoIntervalRef.current) {
        clearInterval(videoIntervalRef.current);
        videoIntervalRef.current = null;
    }
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
      videoRef.current.srcObject = null;
    }
    setIsVideoActive(false);
  };

  const captureAndSendFrame = () => {
    if (!videoRef.current || !canvasRef.current) return;
    // Check if video is actually ready
    if (videoRef.current.readyState < 2) return; 

    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
       canvasRef.current.width = videoRef.current.videoWidth;
       canvasRef.current.height = videoRef.current.videoHeight;
       ctx.drawImage(videoRef.current, 0, 0);
       const base64 = canvasRef.current.toDataURL('image/jpeg', 0.6).split(',')[1];
       liveService.sendVideoFrame(base64);
    }
  };

  // --- System Controls ---
  
  const handleSystemStart = async () => {
    setLastTranscript("INITIALIZING PROTOCOLS...");
    try {
        // 1. Explicitly request permissions on user gesture
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
        // Stop initial stream, we just needed the permission grant
        stream.getTracks().forEach(t => t.stop());
        
        setIsInitialized(true);
        setState(AgentState.CONNECTING);
        
        // 2. Connect Live Service (Always On)
        await liveService.connect();
        
        // 3. Start Camera Background
        await startVideo();
        
        setState(AgentState.IDLE);
        setLastTranscript("SYSTEM ONLINE - LISTENING");
    } catch (e) {
        console.error("Init Error", e);
        setLastTranscript("ACCESS DENIED: PLEASE ALLOW CAMERA/MIC");
    }
  };

  const handleShutdown = () => {
    liveService.disconnect();
    stopVideo();
    setIsInitialized(false);
    setState(AgentState.IDLE);
    setLastTranscript("SYSTEM OFFLINE");
  };

  // --- Feature Triggers with Voice Dictation ---

  const executeVoiceCommand = (action: (text: string) => Promise<void>, label: string) => {
      // Mute Live Service so it doesn't process the command as a chat
      liveService.setMuted(true);
      setState(AgentState.LISTENING);
      setLastTranscript(`AWAITING ${label} COMMAND...`);

      audioService.startListening(
          async (text) => {
              setLastTranscript(`COMMAND RECEIVED: "${text}"`);
              liveService.setMuted(false); 
              await action(text);
          },
          () => {
              setTimeout(() => {
                  if (stateRef.current === AgentState.LISTENING) {
                      liveService.setMuted(false);
                      setState(AgentState.IDLE);
                  }
              }, 1000);
          },
          (error) => {
              console.error(error);
              setLastTranscript("COMMAND FAILED: VOICE NOT DETECTED");
              liveService.setMuted(false);
              setState(AgentState.ERROR);
              setTimeout(() => setState(AgentState.IDLE), 2000);
          }
      );
  };

  const handleDeepThought = () => {
    executeVoiceCommand(async (text) => {
        setState(AgentState.THINKING);
        setLastTranscript("ANALYZING COMPLEX QUERY...");
        const result = await geminiService.deepThought(text);
        setLastTranscript(result.slice(0, 100) + "...");
        setState(AgentState.IDLE);
    }, "DEEP THOUGHT");
  };

  const handleImageGen = () => {
    executeVoiceCommand(async (text) => {
        setState(AgentState.THINKING);
        setLastTranscript("GENERATING SCHEMATICS...");
        const result = await geminiService.generateImage(text);
        if (result.image) setGeneratedImage(result.image);
        else setLastTranscript(result.text);
        setState(AgentState.IDLE);
    }, "IMAGE GEN");
  };

  const handleRoboticsScan = async () => {
    if (!videoRef.current || !canvasRef.current) {
        setLastTranscript("NO VISUAL INPUT DETECTED.");
        return;
    }
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const base64 = canvasRef.current.toDataURL('image/jpeg', 0.8);
        setLastTranscript("SCANNING ENVIRONMENT...");
        const json = await geminiService.roboticsScan(base64);
        setRoboticsData(json);
        setLastTranscript("SCAN COMPLETE.");
    }
  };

  const handleFaceLock = async () => {
    if (isFaceLocked) {
        setIsFaceLocked(false);
        setFaceData(null);
        setLastTranscript("FACE TRACKING DISENGAGED");
        return;
    }

    if (!videoRef.current || !canvasRef.current) {
        setLastTranscript("NO VISUAL INPUT FOR FACE SCAN.");
        return;
    }

    setIsFaceLocked(true);
    setLastTranscript("ACQUIRING TARGET...");

    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
        ctx.drawImage(videoRef.current, 0, 0);
        const base64 = canvasRef.current.toDataURL('image/jpeg', 0.8);
        
        // Short delay to simulate "Locking" animation
        setTimeout(async () => {
            const json = await geminiService.analyzeFace(base64);
            setFaceData(json);
            
            // Save to Memory
            memoryService.saveFace(json);
            
            setLastTranscript(`IDENTITY LOGGED: ${json.identity_guess || "UNKNOWN"}`);
        }, 1500);
    }
  };

  // --- Render ---

  if (!isInitialized) {
      return (
          <div className="h-full flex flex-col items-center justify-center relative overflow-hidden text-center z-50">
               <div className="absolute inset-0 scanline opacity-20"></div>
               <button 
                  onClick={handleSystemStart}
                  className="w-64 h-64 border-4 border-stark-800 rounded-full flex items-center justify-center relative mb-8 group transition-all hover:border-stark-gold hover:shadow-[0_0_50px_rgba(251,191,36,0.3)] bg-stark-900"
               >
                  <div className="absolute inset-0 rounded-full border border-stark-500 opacity-20 animate-ping"></div>
                  <div className="absolute inset-2 rounded-full border border-dashed border-stark-500/50 animate-spin-slow"></div>
                  <div className="text-2xl font-bold text-stark-500 group-hover:text-stark-gold tracking-widest transition-colors">
                      START<br/>SYSTEM
                  </div>
               </button>
               <p className="text-stark-500 font-mono text-sm tracking-[0.2em] animate-pulse">
                  {lastTranscript === "SYSTEM STANDBY" ? "TOUCH TO INITIALIZE" : lastTranscript}
               </p>
          </div>
      );
  }

  return (
    <div className="h-full flex flex-col relative overflow-hidden">
      
      {/* Background Video/Camera Layer */}
      <div className={`fixed inset-0 z-0 transition-opacity duration-1000 ${isVideoActive ? 'opacity-100' : 'opacity-0'}`}>
        <video ref={videoRef} className="w-full h-full object-cover transform scale-x-[-1]" muted playsInline />
        <canvas ref={canvasRef} className="hidden" />
        <div className="absolute inset-0 bg-black/30"></div>
      </div>

      {/* Face Lock Overlay */}
      {isFaceLocked && (
          <div className="absolute inset-0 z-10 pointer-events-none flex items-center justify-center">
              {/* Reticle - Larger Area */}
              <div className={`relative w-[80vw] max-w-[500px] aspect-square transition-all duration-500 ${faceData ? 'border-green-500' : 'border-red-500'}`}>
                   {/* Corners */}
                   <div className={`absolute top-0 left-0 w-12 h-12 border-t-[6px] border-l-[6px] ${faceData ? 'border-green-500' : 'border-red-500'}`}></div>
                   <div className={`absolute top-0 right-0 w-12 h-12 border-t-[6px] border-r-[6px] ${faceData ? 'border-green-500' : 'border-red-500'}`}></div>
                   <div className={`absolute bottom-0 left-0 w-12 h-12 border-b-[6px] border-l-[6px] ${faceData ? 'border-green-500' : 'border-red-500'}`}></div>
                   <div className={`absolute bottom-0 right-0 w-12 h-12 border-b-[6px] border-r-[6px] ${faceData ? 'border-green-500' : 'border-red-500'}`}></div>
                   
                   {/* Center Crosshair */}
                   <div className={`absolute inset-0 flex items-center justify-center opacity-50`}>
                       <div className="w-6 h-6 bg-transparent border border-stark-gold rounded-full"></div>
                       <div className="absolute w-full h-[1px] bg-stark-gold/20"></div>
                       <div className="absolute h-full w-[1px] bg-stark-gold/20"></div>
                   </div>

                   {/* Scanning Bar */}
                   {!faceData && (
                       <div className="absolute inset-0 border-t-4 border-red-500/50 animate-scan"></div>
                   )}
              </div>

              {/* Data HUD */}
              {faceData && (
                  <div className="absolute left-[calc(50%+160px)] top-1/2 -translate-y-1/2 w-64 bg-black/80 border-2 border-green-500/50 p-4 text-sm font-mono text-green-400 backdrop-blur-md rounded-lg shadow-[0_0_20px_rgba(0,255,0,0.2)]">
                      <h3 className="border-b border-green-500/30 mb-2 font-bold tracking-widest text-white">TARGET LOCKED</h3>
                      <p className="mb-1">ID: <span className="text-white font-bold">{faceData.identity_guess || "UNKNOWN"}</span></p>
                      <p className="mb-1">AGE: <span className="text-white">{faceData.age_range || "N/A"}</span></p>
                      <p className="mb-1">EXP: <span className="text-white">{faceData.expression || "ANALYZING"}</span></p>
                      <div className="mt-2 text-xs text-stark-gold border-t border-green-500/30 pt-1">
                          RECORD SAVED TO MEMORY
                      </div>
                  </div>
              )}
          </div>
      )}

      {/* Main UI Layer (Face & Transcript) */}
      <div className="flex-1 flex flex-col items-center justify-center relative z-10 pointer-events-none mb-32">
        {/* Face - Enormous Size Update */}
        <div className={`w-[90vw] max-w-[500px] aspect-square relative transition-opacity duration-500 ${isFaceLocked ? 'opacity-20' : 'opacity-100'} pointer-events-auto`}>
          {generatedImage ? (
             <div className="relative h-full w-full border-2 border-stark-gold rounded-lg overflow-hidden shadow-[0_0_50px_rgba(251,191,36,0.5)]">
               <img src={generatedImage} onClick={() => setGeneratedImage(null)} className="w-full h-full object-cover cursor-pointer" />
               <div className="absolute bottom-0 bg-black/80 w-full text-center text-xs text-stark-gold py-1">CLICK TO DISMISS</div>
             </div>
          ) : (
             <JarvisFace state={state} />
          )}
        </div>

        {/* Status / Transcript */}
        <div className="mt-6 text-center px-4 max-w-3xl min-h-[60px] pointer-events-auto">
           <p className={`font-mono text-base md:text-lg tracking-widest transition-colors duration-300 ${
               state === AgentState.SPEAKING ? 'text-stark-gold font-bold drop-shadow-[0_0_15px_rgba(251,191,36,0.8)]' : 
               state === AgentState.LISTENING ? 'text-cyan-400 font-bold drop-shadow-[0_0_15px_rgba(34,211,238,0.8)]' : 'text-stark-500'
           }`}>
             {state === AgentState.LISTENING ? "DETECTING AUDIO INPUT..." : lastTranscript}
           </p>
           {/* Telemetry Popups */}
           {roboticsData && (
             <div className="mt-4 bg-stark-900/90 backdrop-blur border border-stark-500 p-4 text-left text-xs font-mono text-cyan-400 rounded-lg shadow-lg max-w-sm mx-auto pointer-events-auto">
                <div className="flex justify-between border-b border-cyan-500/30 pb-2 mb-2">
                    <span className="font-bold">TELEMETRY DATA</span>
                    <span className="animate-pulse">● LIVE</span>
                </div>
                <p>OBJECTS: <span className="text-white">{roboticsData.objects?.join(', ') || 'NONE'}</span></p>
                <p>HAZARDS: <span className="text-red-400">{roboticsData.hazards?.join(', ') || 'NONE'}</span></p>
                <button onClick={() => setRoboticsData(null)} className="mt-3 w-full text-center text-stark-gold hover:text-white border border-stark-gold/30 hover:bg-stark-gold/10 py-1 rounded transition-all">DISMISS</button>
             </div>
           )}
        </div>
      </div>

      {/* Bottom Controls Overlay - BIGGER BUTTONS */}
      <div className="fixed bottom-8 left-0 right-0 z-30 flex flex-col items-center gap-4 pointer-events-auto px-4">
        
        {/* Utility Buttons Row */}
        <div className="flex flex-wrap justify-center gap-3 bg-black/60 p-4 rounded-3xl border border-stark-800 backdrop-blur-xl shadow-2xl">
           <ActionButton label="FACE ID" onClick={handleFaceLock} color={isFaceLocked ? "red" : "cyan"} active={isFaceLocked} />
           <ActionButton label="DEEP THINK" onClick={handleDeepThought} color="purple" />
           <ActionButton label="IMG GEN" onClick={handleImageGen} color="pink" />
           <ActionButton label="ROBO SCAN" onClick={handleRoboticsScan} color="cyan" disabled={!isVideoActive} />
        </div>

        {/* Shutdown / Master Control */}
        <button 
          onClick={handleShutdown}
          className="w-14 h-14 rounded-full border-2 border-red-500/30 bg-red-900/40 text-red-500 flex items-center justify-center transition-all hover:bg-red-900/80 hover:scale-110 hover:shadow-[0_0_20px_rgba(239,68,68,0.6)]"
          title="SHUTDOWN SYSTEM"
        >
             <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor" className="w-6 h-6"><path strokeLinecap="round" strokeLinejoin="round" d="M5.636 5.636a9 9 0 1012.728 0M12 3v9" /></svg>
        </button>

      </div>
    </div>
  );
};

const ActionButton = ({ label, onClick, color, disabled, active }: any) => {
    const colors: any = {
        purple: 'border-purple-500 text-purple-400 hover:bg-purple-900/50 shadow-[0_0_15px_rgba(168,85,247,0.2)]',
        pink: 'border-pink-500 text-pink-400 hover:bg-pink-900/50 shadow-[0_0_15px_rgba(236,72,153,0.2)]',
        cyan: 'border-cyan-500 text-cyan-400 hover:bg-cyan-900/50 shadow-[0_0_15px_rgba(6,182,212,0.2)]',
        red: 'border-red-500 text-red-100 bg-red-600 shadow-[0_0_25px_rgba(239,68,68,0.6)] animate-pulse'
    };
    return (
        <button 
          onClick={onClick} 
          disabled={disabled}
          // UPDATED STYLES: Larger padding, larger font, rounded corners
          className={`px-6 py-4 border-2 rounded-2xl text-xs md:text-sm font-bold tracking-widest transition-all duration-200 ${active ? colors['red'] : colors[color]} disabled:opacity-30 disabled:cursor-not-allowed transform active:scale-95 bg-black/40 backdrop-blur-md`}
        >
            {label}
        </button>
    );
}

export default Assistant;