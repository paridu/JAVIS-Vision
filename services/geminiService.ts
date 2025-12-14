
import { GoogleGenAI, Chat, GenerateContentResponse, Part, Type } from "@google/genai";
import { MODELS, JARVIS_PERSONA } from "../constants";

export interface NonLiveConfig {
  image?: string; // base64
}

class GeminiService {
  private client: GoogleGenAI;

  constructor() {
    this.client = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  // Helper
  private base64ToPart(base64Data: string, mimeType: string = 'image/png'): Part {
    // Strip header if present
    const cleanBase64 = base64Data.includes(',') ? base64Data.split(',')[1] : base64Data;
    return {
      inlineData: {
        mimeType,
        data: cleanBase64
      }
    };
  }

  // Task 1: Image Generation / Editing (Flash Image)
  public async generateImage(prompt: string): Promise<{ text: string; image?: string }> {
    try {
      const response = await this.client.models.generateContent({
        model: MODELS.IMAGE_GEN,
        contents: { parts: [{ text: prompt }] },
        config: {
          imageConfig: { aspectRatio: "1:1" }
        }
      });

      let imageUrl: string | undefined;
      for (const part of response.candidates?.[0]?.content?.parts || []) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
        }
      }

      if (!imageUrl) return { text: "Failed to generate image." };
      return { text: "Rendering complete.", image: imageUrl };
    } catch (error) {
       console.error("Image Gen Error", error);
       return { text: "System Malfunction: Image Generation Failed" };
    }
  }

  // Task 2: Deep Thought (Pro Preview)
  public async deepThought(prompt: string): Promise<string> {
    try {
      const response = await this.client.models.generateContent({
        model: MODELS.THINKING,
        contents: { parts: [{ text: prompt }] },
        config: {
          systemInstruction: JARVIS_PERSONA.systemInstruction,
          thinkingConfig: { thinkingBudget: 4096 } // Enable Thinking
        }
      });
      return response.text || "No thoughts produced.";
    } catch (error) {
      console.error("Deep Thought Error", error);
      return "Thinking process interrupted.";
    }
  }

  // Task 3: Robotics Scan (Flash -> JSON)
  public async roboticsScan(base64Image: string): Promise<any> {
    try {
      const response = await this.client.models.generateContent({
        model: MODELS.ROBOTICS,
        contents: {
          parts: [
            this.base64ToPart(base64Image),
            { text: "Analyze this scene for robotic navigation. Return JSON with 'objects', 'hazards', and 'navigable_path' (boolean)." }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              objects: { type: Type.ARRAY, items: { type: Type.STRING } },
              hazards: { type: Type.ARRAY, items: { type: Type.STRING } },
              navigable_path: { type: Type.BOOLEAN }
            }
          }
        }
      });
      
      return JSON.parse(response.text || "{}");
    } catch (error) {
      console.error("Robotics Scan Error", error);
      return { error: "Scan Failed" };
    }
  }

  // Task 4: Face Analysis
  public async analyzeFace(base64Image: string): Promise<any> {
    try {
      const response = await this.client.models.generateContent({
        model: MODELS.ROBOTICS, // Flash is versatile enough
        contents: {
          parts: [
            this.base64ToPart(base64Image),
            { text: "Analyze the face in this image. Estimate age range, gender, and facial expression. If they look like a celebrity or specific character, mention it as 'identity_guess'. Return JSON." }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              age_range: { type: Type.STRING },
              gender: { type: Type.STRING },
              expression: { type: Type.STRING },
              identity_guess: { type: Type.STRING }
            }
          }
        }
      });
      return JSON.parse(response.text || "{}");
    } catch (error) {
      console.error("Face Analysis Error", error);
      return { error: "Face Scan Failed" };
    }
  }
}

export const geminiService = new GeminiService();
