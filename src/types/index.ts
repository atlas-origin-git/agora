export type DialogueRole = 'socrates' | 'oracle' | 'commentary' | 'user-redirect' | 'user-context';

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
  commentary: string;
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
    | 'commentary_complete'
    | 'round_complete'
    | 'synthesis_thinking'
    | 'synthesis_delta'
    | 'synthesis_complete'
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
