import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MessageCircle, TrendingUp, HelpCircle, Volume2, VolumeX, Palette } from "lucide-react";

// ===================== Types =====================
type Suit = "♠" | "♥" | "♦" | "♣";
type Rank = "A" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K";
type Card = { id: string; suit: Suit; rank: Rank };
type Theme = "classic" | "neon" | "dark" | "luxury";

interface Player {
  id: string;
  name: string;
  stack: number;
  bet: number;
  insuranceBet?: number;
  ready: boolean;
  cards: Card[];
  status: string;
  result?: string;
}

interface GameState {
  code: string;
  players: Player[];
  dealer: { cards: Card[] };
  phase: "LOBBY" | "SHUFFLING" | "DEALING" | "INSURANCE" | "PLAYER" | "DEALER" | "RESULT";
  turnIdx: number;
}

interface ChatMessage {
  id: string;
  player: string;
  message: string;
  timestamp: number;
}

interface Stats {
  gamesPlayed: number;
  wins: number;
  losses: number;
  pushes: number;
  blackjacks: number;
  currentStreak: number;
  bestStreak: number;
}

// ===================== Sound Hook =====================
function useSounds() {
  const [muted, setMuted] = useState(false);
  
  const playBeep = (freq: number, duration: number, delay: number = 0) => {
    if (muted) return;
    setTimeout(() => {
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = freq;
        gain.gain.value = 0.15;
        osc.start();
        osc.stop(ctx.currentTime + duration);
      } catch (e) {
        console.log("Audio not supported");
      }
    }, delay);
  };

  const playMelody = (notes: number[]) => {
    notes.forEach((note, i) => playBeep(note, 0.15, i * 120));
  };

  const playCardSlide = () => {
    if (muted) return;
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const filter = ctx.createBiquadFilter();
      
      osc.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      
      filter.type = "lowpass";
      filter.frequency.value = 2000;
      
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(100, ctx.currentTime + 0.15);
      
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
  };

  const playChipStack = () => {
    if (muted) return;
    try {
      const ctx = new AudioContext();
      const times = [0, 0.05, 0.1];
      
      times.forEach((time, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        gain.connect(ctx.destination);
        
        osc.frequency.value = 1000 + (i * 200);
        gain.gain.setValueAtTime(0.15, ctx.currentTime + time);
        gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + time + 0.08);
        
        osc.start(ctx.currentTime + time);
        osc.stop(ctx.currentTime + time + 0.08);
      });
    } catch (e) {}
  };

  const playShuffle = () => {
    if (muted) return;
    try {
      const ctx = new AudioContext();
      
      // Multiple card sliding sounds in quick succession
      for (let i = 0; i < 8; i++) {
        setTimeout(() => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const filter = ctx.createBiquadFilter();
          
          osc.connect(filter);
          filter.connect(gain);
          gain.connect(ctx.destination);
          
          filter.type = "bandpass";
          filter.frequency.value = 800 + Math.random() * 400;
          
          osc.frequency.value = 200 + Math.random() * 100;
          gain.gain.setValueAtTime(0.1, ctx.currentTime);
          gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.1);
          
          osc.start();
          osc.stop(ctx.currentTime + 0.1);
        }, i * 80);
      }
    } catch (e) {}
  };

  const sounds = {
    cardDeal: playCardSlide,
    chipBet: playChipStack,
    win: () => playMelody([523, 659, 784]),
    lose: () => playBeep(150, 0.5),
    blackjack: () => playMelody([523, 659, 784, 1047, 1319]),
    tick: () => playBeep(900, 0.05, 0),
    shuffle: playShuffle,
  };

  return { sounds, muted, setMuted };
}

// ===================== WS Hook =====================
function useWs(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [state, setState] = useState<GameState | null>(null);
  const [reconnecting, setReconnecting] = useState(false);

  const connect = () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    setReconnecting(true);
    const ws = new WebSocket(url);
    wsRef.current = ws;
    
    ws.onopen = () => {
      console.log("✅ Connected");
      setConnected(true);
      setReconnecting(false);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };
    
    ws.onclose = () => {
      console.log("❌ Disconnected");
      setConnected(false);
      setReconnecting(true);
      
      reconnectTimeoutRef.current = window.setTimeout(() => {
        console.log("🔄 Reconnecting...");
        connect();
      }, 2000);
    };
    
    ws.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.type === "state") setState(data.state);
      } catch (err) {
        console.error("Parse error:", err);
      }
    };
    
    ws.onerror = () => setReconnecting(true);
  };

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      wsRef.current?.close();
    };
  }, [url]);

  const send = (type: string, payload?: any) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type, payload }));
  };

  const joinRoom = (roomId: string, playerName: string) => {
    if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(JSON.stringify({ type: "join", roomId, payload: { name: playerName } }));
  };

  return { connected, state, send, joinRoom, reconnecting };
}

// ===================== Utils =====================
const generateRoomCode = () => Math.random().toString(36).substring(2, 8).toUpperCase();

const calculateValue = (cards: Card[]): number => {
  let sum = 0, aces = 0;
  for (const c of cards) {
    if (c.rank === "A") { aces++; sum += 11; }
    else if (["J", "Q", "K"].includes(c.rank)) sum += 10;
    else sum += parseInt(c.rank);
  }
  while (sum > 21 && aces > 0) { sum -= 10; aces--; }
  return sum;
};

const themes = {
  classic: "from-green-800 via-green-900 to-green-950",
  neon: "from-purple-900 via-pink-900 to-blue-900",
  dark: "from-gray-900 via-gray-950 to-black",
  luxury: "from-amber-900 via-yellow-900 to-orange-950"
};

// ===================== Components =====================
function ResultOverlay({ result }: { result: string }) {
  const config = {
    BLACKJACK: {
      emoji: "🎉",
      text: "BLACKJACK!",
      color: "from-yellow-500 to-orange-500",
      animation: "animate-bounce"
    },
    WIN: {
      emoji: "✨",
      text: "YOU WIN!",
      color: "from-green-500 to-emerald-500",
      animation: "animate-pulse"
    },
    LOSE: {
      emoji: "💔",
      text: "YOU LOSE",
      color: "from-red-500 to-rose-500",
      animation: "animate-pulse"
    },
    BUST: {
      emoji: "💥",
      text: "BUST!",
      color: "from-red-600 to-red-800",
      animation: "animate-bounce"
    },
    PUSH: {
      emoji: "🤝",
      text: "PUSH",
      color: "from-blue-500 to-cyan-500",
      animation: "animate-pulse"
    }
  };

  const current = config[result as keyof typeof config] || config.PUSH;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.5 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.5 }}
      transition={{ type: "spring", stiffness: 200 }}
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 pointer-events-none"
    >
      <div className={`text-center ${current.animation}`}>
        <motion.div
          animate={{ rotate: [0, -10, 10, -10, 10, 0] }}
          transition={{ duration: 0.5, repeat: 2 }}
          className="text-9xl mb-4"
        >
          {current.emoji}
        </motion.div>
        <div className={`text-7xl font-black bg-gradient-to-r ${current.color} bg-clip-text text-transparent drop-shadow-2xl`}>
          {current.text}
        </div>
        {result === "BLACKJACK" && (
          <div className="text-3xl text-yellow-300 mt-4 font-bold">
            2.5x Payout! 💰
          </div>
        )}
      </div>
    </motion.div>
  );
}

function ShuffleAnimation({ sounds }: { sounds: any }) {
  useEffect(() => {
    sounds.shuffle();
  }, []);

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
      <div className="text-center">
        <motion.div
          animate={{
            rotateY: [0, 180, 360, 540, 720],
            scale: [1, 1.2, 1, 1.2, 1],
          }}
          transition={{ duration: 2, ease: "easeInOut" }}
          className="text-9xl mb-4"
        >
          🎴
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-3xl font-bold"
        >
          Shuffling Deck...
        </motion.div>
      </div>
    </div>
  );
}

function Confetti() {
  return (
    <div className="fixed inset-0 pointer-events-none z-50">
      {[...Array(50)].map((_, i) => (
        <motion.div
          key={i}
          className="absolute w-2 h-2 bg-yellow-400 rounded-full"
          initial={{ x: "50vw", y: "50vh", opacity: 1 }}
          animate={{
            x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1000),
            y: (typeof window !== 'undefined' ? window.innerHeight : 1000) + 100,
            opacity: 0,
            rotate: Math.random() * 360
          }}
          transition={{ duration: 2, delay: Math.random() * 0.5 }}
        />
      ))}
    </div>
  );
}

function CardComponent({ card, hidden = false, flip = false, playSound = false }: { card: Card; hidden?: boolean; flip?: boolean; playSound?: boolean }) {
  const isRed = card.suit === "♥" || card.suit === "♦";
  const { sounds } = useSounds();
  const hasPlayedRef = useRef(false);
  
  useEffect(() => {
    if (playSound && !hidden && !hasPlayedRef.current) {
      sounds.cardDeal();
      hasPlayedRef.current = true;
    }
  }, [playSound, hidden]);
  
  if (hidden && !flip) {
    return (
      <motion.div
        initial={{ scale: 0, rotateY: 180 }}
        animate={{ scale: 1, rotateY: 0 }}
        className="bg-blue-900 rounded-lg shadow-lg w-16 h-24 sm:w-20 sm:h-28 flex items-center justify-center border-2 border-blue-700"
      >
        <div className="text-4xl">🂠</div>
      </motion.div>
    );
  }
  
  return (
    <motion.div
      initial={{ scale: 0, rotateY: flip ? 180 : 180, x: -100 }}
      animate={{ scale: 1, rotateY: 0, x: 0 }}
      transition={{ type: "spring", stiffness: 200, delay: flip ? 0.5 : 0 }}
      className="bg-white rounded-lg shadow-lg w-16 h-24 sm:w-20 sm:h-28 flex flex-col items-center justify-center border-2 border-gray-300"
    >
      <div className={`text-2xl sm:text-3xl ${isRed ? "text-red-600" : "text-gray-900"}`}>
        {card.suit}
      </div>
      <div className={`text-xl sm:text-2xl font-bold ${isRed ? "text-red-600" : "text-gray-900"}`}>
        {card.rank}
      </div>
    </motion.div>
  );
}

function TurnTimer({ 
  isActive, 
  currentPlayer, 
  duration = 20,
  sounds
}: { 
  isActive: boolean; 
  currentPlayer: string | null; 
  duration?: number;
  sounds: any;
}) {
  const [timeLeft, setTimeLeft] = useState(duration);
  const intervalRef = useRef<number | null>(null);

  useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    setTimeLeft(duration);
    if (!isActive || !currentPlayer) return;

    intervalRef.current = window.setInterval(() => {
      setTimeLeft((t) => {
        const newTime = t - 1;
        if (newTime <= 5 && newTime > 0) sounds.tick();
        if (newTime <= 0) {
          if (intervalRef.current) {
            clearInterval(intervalRef.current);
            intervalRef.current = null;
          }
          return 0;
        }
        return newTime;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isActive, currentPlayer, duration]);

  if (!isActive || !currentPlayer) return null;

  const percentage = (timeLeft / duration) * 100;
  const isLow = timeLeft <= 5;

  return (
    <div className="flex flex-col items-center gap-2">
      <div className={`text-2xl font-bold ${isLow ? "text-red-500 animate-pulse" : "text-yellow-400"}`}>
        {timeLeft}s
      </div>
      <div className="w-32 h-2 bg-gray-700 rounded-full overflow-hidden">
        <motion.div
          className={`h-full ${isLow ? "bg-red-500" : "bg-yellow-400"}`}
          style={{ width: `${percentage}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </div>
  );
}

function PlayerSpot({ 
  player, 
  isActive, 
  isMe, 
  showWin,
  sounds
}: { 
  player: Player; 
  isActive: boolean; 
  isMe: boolean; 
  showWin: boolean;
  sounds: any;
}) {
  const handValue = calculateValue(player.cards);
  const isBust = handValue > 21;
  const isWin = player.result === "WIN" || player.result === "BLACKJACK";

  useEffect(() => {
    if (showWin && isWin) {
      if (player.result === "BLACKJACK") sounds.blackjack();
      else sounds.win();
    } else if (showWin && player.result === "LOSE") {
      sounds.lose();
    }
  }, [showWin]);

  return (
    <div className={`relative ${isActive ? "ring-4 ring-yellow-400 ring-offset-4 ring-offset-green-900" : ""} rounded-2xl`}>
      <motion.div
        animate={isActive ? { scale: [1, 1.02, 1] } : isBust ? { x: [-5, 5, -5, 5, 0] } : {}}
        transition={{ repeat: isActive ? Infinity : 0, duration: isActive ? 1.5 : 0.3 }}
        className={`bg-green-800/80 backdrop-blur-xl rounded-2xl p-4 shadow-2xl ${isMe ? "border-2 border-yellow-400" : ""} ${
          showWin && isWin ? "ring-4 ring-green-400 shadow-green-500/50" : ""
        }`}
      >
        <div className="text-center mb-3">
          <div className="font-bold text-lg">{player.name}</div>
          <div className="text-sm opacity-80">${player.stack}</div>
        </div>

        <div className="flex justify-center gap-2 mb-3 min-h-[7rem]">
          {player.cards.map((card) => (
            <CardComponent key={card.id} card={card} playSound={true} />
          ))}
        </div>

        {player.cards.length > 0 && (
          <div className={`text-center font-bold text-lg mb-2 ${isBust ? "text-red-400" : ""}`}>
            {handValue} {isBust && "BUST!"}
          </div>
        )}

        {player.bet > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="bg-red-600 rounded-full w-20 h-20 mx-auto flex flex-col items-center justify-center font-bold shadow-lg"
          >
            <div className="text-xs">BET</div>
            <div className="text-lg">${player.bet}</div>
          </motion.div>
        )}

        {player.status && (
          <div className="text-center mt-2 text-sm text-yellow-300 font-semibold">
            {player.status}
          </div>
        )}

        {isActive && (
          <motion.div
            animate={{ y: [-5, 5, -5] }}
            transition={{ repeat: Infinity, duration: 1 }}
            className="absolute -top-8 left-1/2 transform -translate-x-1/2 text-4xl"
          >
            👇
          </motion.div>
        )}

        {showWin && player.result === "BLACKJACK" && <Confetti />}
      </motion.div>
    </div>
  );
}

function ChatPanel({ messages, onSend }: { messages: ChatMessage[]; onSend: (msg: string) => void }) {
  const [input, setInput] = useState("");
  const emojis = ["👍", "🎉", "😅", "🔥", "💰", "😎"];

  const handleSend = () => {
    if (input.trim()) {
      onSend(input.trim());
      setInput("");
    }
  };

  return (
    <div className="bg-green-800/60 backdrop-blur-xl rounded-xl p-4 h-64 flex flex-col">
      <h3 className="font-bold mb-2 flex items-center gap-2">
        <MessageCircle size={18} /> Chat
      </h3>
      <div className="flex-1 overflow-y-auto space-y-2 mb-2">
        {messages.map((msg) => (
          <div key={msg.id} className="text-sm">
            <span className="font-semibold">{msg.player}:</span> {msg.message}
          </div>
        ))}
      </div>
      <div className="flex gap-2 mb-2">
        {emojis.map((emoji) => (
          <button
            key={emoji}
            onClick={() => onSend(emoji)}
            className="text-xl hover:scale-125 transition"
          >
            {emoji}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyPress={(e) => e.key === "Enter" && handleSend()}
          placeholder="Type message..."
          className="flex-1 px-3 py-2 rounded-lg text-black text-sm"
          maxLength={100}
        />
        <button
          onClick={handleSend}
          className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded-lg font-semibold"
        >
          Send
        </button>
      </div>
    </div>
  );
}

function StatsPanel({ stats }: { stats: Stats }) {
  const winRate = stats.gamesPlayed > 0 ? ((stats.wins / stats.gamesPlayed) * 100).toFixed(1) : "0.0";

  return (
    <div className="bg-green-800/60 backdrop-blur-xl rounded-xl p-4">
      <h3 className="font-bold mb-3 flex items-center gap-2">
        <TrendingUp size={18} /> Statistics
      </h3>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="opacity-80">Win Rate</div>
          <div className="text-2xl font-bold text-green-400">{winRate}%</div>
        </div>
        <div>
          <div className="opacity-80">Games</div>
          <div className="text-2xl font-bold">{stats.gamesPlayed}</div>
        </div>
        <div>
          <div className="opacity-80">Blackjacks</div>
          <div className="text-xl font-bold text-yellow-400">{stats.blackjacks}</div>
        </div>
        <div>
          <div className="opacity-80">Best Streak</div>
          <div className="text-xl font-bold text-blue-400">{stats.bestStreak}</div>
        </div>
      </div>
    </div>
  );
}

function HelpOverlay({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9 }}
        animate={{ scale: 1 }}
        className="bg-green-800 rounded-2xl p-8 max-w-2xl max-h-[80vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-3xl font-bold mb-6">🎰 How to Play</h2>
        
        <div className="space-y-4 text-sm">
          <section>
            <h3 className="font-bold text-lg mb-2">🎯 Objective</h3>
            <p>Beat the dealer by getting closer to 21 without going over.</p>
          </section>

          <section>
            <h3 className="font-bold text-lg mb-2">🎴 Card Values</h3>
            <ul className="list-disc list-inside space-y-1">
              <li>Number cards: Face value</li>
              <li>J, Q, K: 10 points</li>
              <li>Ace: 1 or 11 (whichever is better)</li>
            </ul>
          </section>

          <section>
            <h3 className="font-bold text-lg mb-2">🎮 Actions</h3>
            <ul className="list-disc list-inside space-y-1">
              <li><b>Hit:</b> Draw another card</li>
              <li><b>Stand:</b> Keep your current hand</li>
              <li><b>Double:</b> Double bet, get one card, then stand</li>
              <li><b>Insurance:</b> Side bet when dealer shows Ace</li>
            </ul>
          </section>

          <section>
            <h3 className="font-bold text-lg mb-2">💰 Payouts</h3>
            <ul className="list-disc list-inside space-y-1">
              <li><b>Blackjack (21 with 2 cards):</b> 2.5x bet</li>
              <li><b>Win:</b> 2x bet</li>
              <li><b>Push (tie):</b> Bet returned</li>
              <li><b>Lose:</b> Lose bet</li>
            </ul>
          </section>

          <section>
            <h3 className="font-bold text-lg mb-2">⌨️ Keyboard Shortcuts</h3>
            <ul className="list-disc list-inside space-y-1">
              <li><b>H:</b> Hit</li>
              <li><b>S:</b> Stand</li>
              <li><b>D:</b> Double</li>
            </ul>
          </section>
        </div>

        <button
          onClick={onClose}
          className="mt-6 w-full bg-blue-600 hover:bg-blue-700 py-3 rounded-lg font-bold"
        >
          Got it!
        </button>
      </motion.div>
    </motion.div>
  );
}

// ===================== Main App =====================
export default function App() {
  const WS_URL = "ws://localhost:8080";
  const { connected, state, send, joinRoom, reconnecting } = useWs(WS_URL);
  const { sounds, muted, setMuted } = useSounds();
  
  const [name, setName] = useState("");
  const [roomCode, setRoomCode] = useState("");
  const [joined, setJoined] = useState(false);
  const [theme, setTheme] = useState<Theme>("classic");
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [stats, setStats] = useState<Stats>({
    gamesPlayed: 0,
    wins: 0,
    losses: 0,
    pushes: 0,
    blackjacks: 0,
    currentStreak: 0,
    bestStreak: 0
  });
  const [showHelp, setShowHelp] = useState(false);
  const [lastBet, setLastBet] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [myResult, setMyResult] = useState<string | null>(null);

  const prevPhaseRef = useRef<string | null>(null);

  useEffect(() => {
    const savedName = localStorage.getItem("bj_name");
    const savedTheme = localStorage.getItem("bj_theme") as Theme;
    const savedStats = localStorage.getItem("bj_stats");
    
    if (savedName) setName(savedName);
    if (savedTheme) setTheme(savedTheme);
    if (savedStats) setStats(JSON.parse(savedStats));
  }, []);

  useEffect(() => {
    localStorage.setItem("bj_theme", theme);
  }, [theme]);

  useEffect(() => {
    if (name) localStorage.setItem("bj_name", name);
  }, [name]);

  useEffect(() => {
    localStorage.setItem("bj_stats", JSON.stringify(stats));
  }, [stats]);

  useEffect(() => {
    if (state?.phase === "RESULT" && prevPhaseRef.current !== "RESULT") {
      const me = state.players.find(p => p.name === name);
      if (me?.result) {
        // Show result overlay
        setMyResult(me.result);
        setShowResult(true);
        
        // Hide after 3 seconds
        setTimeout(() => {
          setShowResult(false);
        }, 3000);

        // Update stats
        const newStats = { ...stats };
        newStats.gamesPlayed++;
        if (me.result === "WIN" || me.result === "BLACKJACK") {
          newStats.wins++;
          newStats.currentStreak++;
          if (newStats.currentStreak > newStats.bestStreak) {
            newStats.bestStreak = newStats.currentStreak;
          }
          if (me.result === "BLACKJACK") newStats.blackjacks++;
        } else if (me.result === "LOSE" || me.result === "BUST") {
          newStats.losses++;
          newStats.currentStreak = 0;
        } else {
          newStats.pushes++;
        }
        setStats(newStats);
      }
    }
    prevPhaseRef.current = state?.phase || null;
  }, [state?.phase]);

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (!isMyTurn) return;
      if (e.key === "h" || e.key === "H") handleHit();
      if (e.key === "s" || e.key === "S") handleStand();
      if (e.key === "d" || e.key === "D") handleDouble();
    };
    window.addEventListener("keypress", handleKeyPress);
    return () => window.removeEventListener("keypress", handleKeyPress);
  }, [state]);

  const handleCreateRoom = () => {
    if (!name.trim()) { alert("Enter your name!"); return; }
    const newCode = generateRoomCode();
    setRoomCode(newCode);
    joinRoom(newCode, name.trim());
    setJoined(true);
  };

  const handleJoinRoom = () => {
    if (!name.trim() || !roomCode.trim()) { alert("Enter name and room code!"); return; }
    joinRoom(roomCode.toUpperCase(), name.trim());
    setJoined(true);
  };

  const handleReady = () => {
    const me = state?.players.find(p => p.name === name);
    send("ready", { ready: !me?.ready });
  };

  const handleBet = (amount: number) => {
    sounds.chipBet();
    send("bet", { value: amount });
    setLastBet(amount);
  };

  const handleRepeatBet = () => {
    if (lastBet > 0) handleBet(lastBet);
  };

  const handleAllIn = () => {
    const me = state?.players.find(p => p.name === name);
    if (me) handleBet(me.stack);
  };

  const handleStart = () => send("start");
  const handleHit = () => { sounds.cardDeal(); send("hit"); };
  const handleStand = () => send("stand");
  const handleDouble = () => { sounds.cardDeal(); send("double"); };
  const handleInsurance = () => send("insurance");

  const handleLeave = () => {
    send("leave");
    setJoined(false);
    setRoomCode("");
  };

  const handleSendChat = (message: string) => {
    const newMsg: ChatMessage = {
      id: Math.random().toString(36),
      player: name,
      message,
      timestamp: Date.now()
    };
    setChatMessages((prev) => [...prev, newMsg].slice(-50));
  };

  const me = state?.players.find(p => p.name === name);
  const currentPlayer = state?.turnIdx >= 0 ? state?.players[state.turnIdx] : null;
  const isMyTurn = state?.phase === "PLAYER" && currentPlayer?.name === name;
  const dealerValue = calculateValue(state?.dealer.cards || []);
  const showDealerSecondCard = state?.phase === "DEALER" || state?.phase === "RESULT";
  const canInsure = state?.phase === "INSURANCE" && state.dealer.cards[0]?.rank === "A";

  return (
    <div className={`min-h-screen bg-gradient-to-br ${themes[theme]} text-white font-sans p-4 relative`}>
      {/* Reconnecting Overlay */}
      <AnimatePresence>
        {reconnecting && !connected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50"
          >
            <div className="bg-green-800 rounded-2xl p-8 text-center">
              <div className="text-4xl mb-4">🔄</div>
              <div className="text-xl font-bold">Reconnecting...</div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Help Overlay */}
      <AnimatePresence>
        {showHelp && <HelpOverlay onClose={() => setShowHelp(false)} />}
      </AnimatePresence>

      {/* Shuffle Animation */}
      <AnimatePresence>
        {state?.phase === "SHUFFLING" && <ShuffleAnimation sounds={sounds} />}
      </AnimatePresence>

      {/* Result Overlay */}
      <AnimatePresence>
        {showResult && myResult && <ResultOverlay result={myResult} />}
      </AnimatePresence>

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h1 className="text-2xl sm:text-3xl font-bold">🃏 Blackjack Pro</h1>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowHelp(true)} className="p-2 hover:bg-white/10 rounded-lg">
              <HelpCircle size={20} />
            </button>
            <button onClick={() => setMuted(!muted)} className="p-2 hover:bg-white/10 rounded-lg">
              {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
            </button>
            <button
              onClick={() => setTheme(t => t === "classic" ? "neon" : t === "neon" ? "dark" : t === "dark" ? "luxury" : "classic")}
              className="p-2 hover:bg-white/10 rounded-lg"
            >
              <Palette size={20} />
            </button>
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${connected ? "bg-green-400" : "bg-red-500"}`} />
              <span className="text-sm">{connected ? "Online" : "Offline"}</span>
            </div>
          </div>
        </div>

        {/* Lobby */}
        {!joined ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-green-800/80 backdrop-blur-xl rounded-2xl p-8 shadow-2xl max-w-md mx-auto mt-20"
          >
            <h2 className="text-2xl font-bold mb-6 text-center">Welcome! 🎰</h2>
            
            <div className="space-y-4">
              <input
                type="text"
                placeholder="Your Name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full px-4 py-3 rounded-lg text-black text-center font-semibold text-lg"
                maxLength={12}
              />

              <div className="border-t border-green-600 pt-4 mt-4">
                <button
                  onClick={handleCreateRoom}
                  disabled={!connected}
                  className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-bold text-lg transition shadow-lg"
                >
                  🎲 Create Room
                </button>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex-1 h-px bg-green-600" />
                <span className="text-sm opacity-70">OR</span>
                <div className="flex-1 h-px bg-green-600" />
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Room Code"
                  value={roomCode}
                  onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
                  className="w-full px-4 py-3 rounded-lg text-black text-center font-mono text-lg uppercase"
                  maxLength={8}
                />
                <button
                  onClick={handleJoinRoom}
                  disabled={!connected}
                  className="w-full bg-green-600 hover:bg-green-700 disabled:bg-gray-600 disabled:cursor-not-allowed px-6 py-3 rounded-lg font-bold text-lg transition shadow-lg"
                >
                  ➡️ Join Room
                </button>
              </div>
            </div>
          </motion.div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Sidebar */}
            <div className="space-y-4">
              <ChatPanel messages={chatMessages} onSend={handleSendChat} />
              <StatsPanel stats={stats} />
            </div>

            {/* Main Game Area */}
            <div className="lg:col-span-3 space-y-6">
              {/* Room Info */}
              <div className="bg-green-800/60 backdrop-blur-xl rounded-xl p-4 flex justify-between items-center">
                <div>
                  <span className="text-sm opacity-80">Room:</span>
                  <span className="font-mono font-bold text-xl ml-2">{state?.code || roomCode}</span>
                </div>
                <div>
                  <span className="text-sm opacity-80">Phase:</span>
                  <span className="font-bold ml-2">{state?.phase || "LOBBY"}</span>
                </div>
                <button
                  onClick={handleLeave}
                  className="bg-red-600 hover:bg-red-700 px-4 py-2 rounded-lg font-semibold transition"
                >
                  Leave
                </button>
              </div>

              {/* Dealer Section */}
              <div className="bg-green-800/60 backdrop-blur-xl rounded-2xl p-6 shadow-2xl border-4 border-green-700/50">
                <div className="text-center mb-4">
                  <h3 className="font-bold text-xl mb-2">🎩 DEALER</h3>
                  {state?.dealer.cards && state.dealer.cards.length > 0 && showDealerSecondCard && (
                    <div className="text-2xl font-bold">{dealerValue}</div>
                  )}
                </div>
                <div className="flex justify-center gap-2 flex-wrap min-h-[8rem] items-center">
                  {state?.dealer.cards.map((card, idx) => (
                    <CardComponent 
                      key={card.id} 
                      card={card} 
                      hidden={idx === 1 && !showDealerSecondCard}
                      flip={idx === 1 && showDealerSecondCard && state.phase === "DEALER"}
                      playSound={true}
                    />
                  ))}
                </div>
              </div>

              {/* Pot & Timer */}
              <div className="flex flex-col items-center gap-4 my-8">
                {state?.players && state.players.some(p => p.bet > 0) && (
                  <motion.div
                    initial={{ scale: 0, y: 50 }}
                    animate={{ scale: 1, y: 0 }}
                    className="bg-gradient-to-br from-yellow-500 to-yellow-600 rounded-full w-32 h-32 flex flex-col items-center justify-center font-bold shadow-2xl border-4 border-yellow-400"
                  >
                    <div className="text-sm text-yellow-900">POT</div>
                    <div className="text-2xl text-yellow-900">
                      ${state.players.reduce((sum, p) => sum + p.bet, 0)}
                    </div>
                  </motion.div>
                )}

                <TurnTimer 
                  isActive={state?.phase === "PLAYER"} 
                  currentPlayer={currentPlayer?.name || null}
                  duration={20}
                  sounds={sounds}
                />
              </div>

              {/* Players */}
              <div className={`grid gap-4 ${state?.players.length === 1 ? "grid-cols-1 max-w-md mx-auto" : state?.players.length === 2 ? "grid-cols-2" : "grid-cols-2 lg:grid-cols-3"}`}>
                {state?.players.map((player, idx) => (
                  <PlayerSpot
                    key={player.id}
                    player={player}
                    isActive={state.phase === "PLAYER" && state.turnIdx === idx}
                    isMe={player.name === name}
                    showWin={state.phase === "RESULT"}
                    sounds={sounds}
                  />
                ))}
              </div>

              {/* Controls */}
              <div className="bg-green-800/60 backdrop-blur-xl rounded-2xl p-6 shadow-2xl">
                {state?.phase === "LOBBY" && (
                  <div className="space-y-6">
                    <div className="flex justify-center gap-4">
                      <button
                        onClick={handleReady}
                        className={`px-8 py-4 rounded-lg font-bold text-xl transition shadow-lg ${
                          me?.ready ? "bg-yellow-600 hover:bg-yellow-700" : "bg-green-600 hover:bg-green-700"
                        }`}
                      >
                        {me?.ready ? "✓ Ready!" : "Ready?"}
                      </button>
                    </div>

                    <div>
                      <div className="flex justify-between items-center mb-3">
                        <h3 className="font-semibold">Place Your Bet</h3>
                        <div className="flex gap-2">
                          {lastBet > 0 && (
                            <button
                              onClick={handleRepeatBet}
                              className="text-sm bg-purple-600 hover:bg-purple-700 px-3 py-1 rounded-lg"
                            >
                              🔁 Repeat ${lastBet}
                            </button>
                          )}
                          <button
                            onClick={handleAllIn}
                            className="text-sm bg-orange-600 hover:bg-orange-700 px-3 py-1 rounded-lg"
                          >
                            💥 All In
                          </button>
                        </div>
                      </div>
                      <div className="flex justify-center gap-3 flex-wrap">
                        {[5, 25, 100, 500, 1000].map((chip) => (
                          <motion.button
                            key={chip}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => handleBet(chip)}
                            disabled={!me || me.stack < chip}
                            className="w-20 h-20 rounded-full bg-gradient-to-br from-red-500 to-red-700 hover:from-red-600 hover:to-red-800 disabled:from-gray-600 disabled:to-gray-700 disabled:cursor-not-allowed font-bold text-xl shadow-2xl transition border-4 border-white/30"
                          >
                            ${chip}
                          </motion.button>
                        ))}
                      </div>
                    </div>

                    {state.players.length > 0 && state.players.every(p => p.ready && p.bet > 0) && (
                      <motion.div
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        className="flex justify-center"
                      >
                        <button
                          onClick={handleStart}
                          className="bg-blue-600 hover:bg-blue-700 px-12 py-4 rounded-lg font-bold text-xl transition shadow-lg animate-pulse"
                        >
                          🎲 START GAME
                        </button>
                      </motion.div>
                    )}
                  </div>
                )}

                {state?.phase === "INSURANCE" && canInsure && isMyTurn && (
                  <div className="text-center space-y-4">
                    <div className="text-xl font-bold animate-pulse">Insurance Available!</div>
                    <div className="text-sm opacity-80">Dealer showing Ace</div>
                    <div className="flex justify-center gap-4">
                      <button
                        onClick={handleInsurance}
                        className="bg-yellow-600 hover:bg-yellow-700 px-8 py-4 rounded-lg font-bold text-lg"
                      >
                        💰 Buy Insurance
                      </button>
                      <button
                        onClick={handleStand}
                        className="bg-gray-600 hover:bg-gray-700 px-8 py-4 rounded-lg font-bold text-lg"
                      >
                        ❌ No Thanks
                      </button>
                    </div>
                  </div>
                )}

                {state?.phase === "PLAYER" && isMyTurn && (
                  <div className="space-y-4">
                    <div className="text-center text-lg font-semibold mb-4">Your Turn!</div>
                    <div className="flex justify-center gap-4 flex-wrap">
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleHit}
                        className="bg-blue-600 hover:bg-blue-700 px-8 py-4 rounded-lg font-bold text-xl transition shadow-lg"
                      >
                        👆 HIT <span className="text-sm opacity-70">(H)</span>
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.05 }}
                        whileTap={{ scale: 0.95 }}
                        onClick={handleStand}
                        className="bg-yellow-600 hover:bg-yellow-700 px-8 py-4 rounded-lg font-bold text-xl transition shadow-lg"
                      >
                        ✋ STAND <span className="text-sm opacity-70">(S)</span>
                      </motion.button>
                      {me?.cards.length === 2 && me.stack >= me.bet && (
                        <motion.button
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={handleDouble}
                          className="bg-purple-600 hover:bg-purple-700 px-8 py-4 rounded-lg font-bold text-xl transition shadow-lg"
                        >
                          ⚡ DOUBLE <span className="text-sm opacity-70">(D)</span>
                        </motion.button>
                      )}
                    </div>
                  </div>
                )}

                {state?.phase === "SHUFFLING" && (
                  <div className="text-center text-2xl font-bold animate-pulse">
                    🔀 Shuffling deck...
                  </div>
                )}

                {state?.phase === "DEALING" && (
                  <div className="text-center text-2xl font-bold animate-pulse">
                    🎴 Dealing cards...
                  </div>
                )}

                {state?.phase === "DEALER" && (
                  <div className="text-center text-2xl font-bold animate-pulse">
                    🎩 Dealer's turn...
                  </div>
                )}

                {state?.phase === "RESULT" && (
                  <div className="text-center space-y-4">
                    <div className="text-lg opacity-80">Round complete! Next round starting soon...</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}