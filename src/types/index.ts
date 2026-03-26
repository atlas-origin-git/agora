export type DialogueRole = 'socrates' | 'oracle' | 'synthesis' | 'user-redirect' | 'user-context';

export interface Message {
  id: string;
  role: DialogueRole;
  content: string;
  timestamp: number;
  round?: number;
}

export interface Round {
  roundNumber: number;
  socratesQuestion: string;
  oracleAnswer: string;
  synthesisUpdate: string;
  quickTake?: string;
}

export interface SessionState {
  id: string;
  question: string;
  domain: string;
  rounds: Round[];
  currentRound: number;
  totalRounds: number;
  isPaused: boolean;
  isEnded: boolean;
  isComplete: boolean;
  messages: Message[];
  pendingRedirect: string | null;
  pendingContext: string | null;
}

export interface SSEEvent {
  type:
    | 'session_started'
    | 'socrates_streaming'
    | 'socrates_complete'
    | 'oracle_streaming'
    | 'oracle_complete'
    | 'synthesis_update'
    | 'round_complete'
    | 'user_injection_acknowledged'
    | 'session_complete'
    | 'error'
    | 'off_topic';
  data: string;
  round?: number;
}

export interface OffTopicResult {
  isOffTopic: boolean;
  reason?: string;
  suggestions?: string[];
}
