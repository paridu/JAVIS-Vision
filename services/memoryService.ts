
export interface FaceRecord {
  id: string;
  identity: string;
  age: string;
  expression: string;
  timestamp: number;
}

const STORAGE_KEY = 'jarvis_face_memory';

class MemoryService {
  public saveFace(data: any): FaceRecord {
    const records = this.getFaces();
    
    const newRecord: FaceRecord = {
      id: crypto.randomUUID(),
      identity: data.identity_guess || "Unknown Subject",
      age: data.age_range || "Unknown",
      expression: data.expression || "Neutral",
      timestamp: Date.now()
    };

    // Prepend to list (newest first)
    records.unshift(newRecord);
    
    // Keep only last 50 records to save space
    if (records.length > 50) records.pop();

    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
    return newRecord;
  }

  public getFaces(): FaceRecord[] {
    try {
      const data = localStorage.getItem(STORAGE_KEY);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error("Memory Read Error", e);
      return [];
    }
  }

  public clearMemory() {
    localStorage.removeItem(STORAGE_KEY);
  }
}

export const memoryService = new MemoryService();
