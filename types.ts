
export interface RodState {
  id: number;
  value: number; // Calculated value of the rod
  activeHeavenCount: number; // 0-2 (Number of heaven beads DOWN/Active)
  activeEarthCount: number; // 0-5 (Number of earth beads UP/Active)
}

export enum AppMode {
  Free = 'FREE', // 自由练习
  Training = 'TRAINING', // 智能训练
  Exam = 'EXAM', // 模拟考试 (Mental Math)
}

export interface Formula {
  action: string;
  koujue: string; // Chinese Koujue
  description: string;
}

export type ProblemType = 'ADD' | 'SUB' | 'MUL' | 'DIV' | 'MIXED';

export interface Challenge {
  id: string;
  type: ProblemType;
  question: string;
  targetValue: number;
  steps: number[];
  currentStepIndex: number;
  ruleDescription?: string; // Explanation for positioning (Ding Wei)
}

export interface UserStats {
  totalOperations: number;
  correctAnswers: number;
  accuracyHistory: { time: string; accuracy: number }[];
}

export interface AppSettings {
  soundEnabled: boolean;
  voiceEnabled: boolean;
  showHints: boolean;
  mentalMode: boolean; // Hides the beads
}
