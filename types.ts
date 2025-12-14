
export enum AgentState {
  IDLE = 'IDLE',
  CONNECTING = 'CONNECTING',
  LISTENING = 'LISTENING',
  THINKING = 'THINKING',
  SPEAKING = 'SPEAKING',
  ERROR = 'ERROR'
}

export interface Message {
  id: string;
  role: 'user' | 'model';
  content: string;
  timestamp: number;
}

export interface PersonaConfig {
  name: string;
  tone: 'calm' | 'alert' | 'empathic';
  systemInstruction: string;
}

export interface AudioVisualizerData {
  frequencyData: Uint8Array;
  volume: number;
}

export interface LiveConfig {
  enableVideo?: boolean;
}

// Custom Tool Types
export type ToolName = 'switch_camera' | 'play_youtube' | 'reset_mirror';

export interface ToolCallData {
  name: ToolName;
  args: Record<string, any>;
}
