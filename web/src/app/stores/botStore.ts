import { create } from 'zustand';
import { BotStatus as BotStatusConst } from '../constants';

export interface VersionInfo {
  app_name: string;
  protocol_version: string;
  app_version: string;
}

export interface BotStatus {
  online: boolean;
  good: boolean;
  stat?: {
    message_received: number;
    message_sent: number;
    last_message_time: number;
    startup_time: number;
  };
}

export interface Bot {
  self_id: string;
  nickname: string;
  custom_name: string;
  status: 'online' | 'offline';
  last_connect: string;
  msg_count_today: number;
  friend_count: number;
  group_count: number;
  plugin_count?: number;
  avatar: string;
  version_info?: VersionInfo;
  bot_status?: BotStatus;
}

interface BotState {
  bots: Bot[];
  selectedBotId: string | null;
  selectedBot: Bot | null;
  setBots: (bots: Bot[]) => void;
  selectBot: (id: string) => void;
  updateBotStatus: (id: string, status: 'online' | 'offline') => void;
}

export const useBotStore = create<BotState>((set, get) => ({
  bots: [],
  selectedBotId: null,
  get selectedBot() {
    const state = get();
    return state.bots.find((bot) => bot.self_id === state.selectedBotId) || null;
  },
  setBots: (bots) => set({ bots }),
  selectBot: (id) => set({ selectedBotId: id }),
  updateBotStatus: (id, status) =>
    set((state) => ({
      bots: state.bots.map((bot) =>
        bot.self_id === id ? { ...bot, status } : bot
      ),
    })),
}));
