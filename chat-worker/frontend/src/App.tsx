import { useState, useEffect, useRef } from 'react';
import { ChatRoom } from './components/ChatRoom';
import { Landing } from './components/Landing';
import { CreateRoom } from './components/CreateRoom';
import { JoinRoom } from './components/JoinRoom';
import type { User, Room } from './types';
import './App.css';

function BannedModal({ user, onEmergency }: { user: User, onEmergency: () => void }) {
    if (!user.isBanned) return null;
    return (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="bg-zinc-900 border border-red-500/30 p-8 rounded-2xl max-w-md w-full text-center shadow-2xl">
                <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i className="fas fa-ban text-3xl text-red-500"></i>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">账号已被封禁</h2>
                <p className="text-gray-400 mb-6">
                    您的账号因违反社区规定已被封禁。<br/>
                    解封时间: {user.bannedUntil ? new Date(user.bannedUntil).toLocaleString() : '永久'}
                </p>
                <button
                    onClick={onEmergency}
                    className="w-full py-3 bg-red-600 hover:bg-red-500 text-white rounded-xl font-medium transition flex items-center justify-center gap-2"
                >
                    <i className="fas fa-life-ring"></i>
                    前往申诉 (Emergency Room)
                </button>
            </div>
        </div>
    );
}

function App() {
  const [view, setView] = useState("loading"); // loading, landing, create, join, chat
  const [user, setUser] = useState<User | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [joinId, setJoinId] = useState("");
  const [joinName, setJoinName] = useState("");
  const authInitialized = useRef(false);

  useEffect(() => {
      fetch('/api/me', { credentials: 'include' })
          .then(res => res.json())
          .then(data => {
              if (data.loggedIn) {
                  setUser({
                      username: data.username,
                      role: data.role,
                      isBanned: data.isBanned,
                      bannedUntil: data.bannedUntil,
                      avatarUrl: data.avatarUrl || null
                  });
                  setView("landing");
              } else {
                  const returnUrl = window.location.href;
                  window.location.href = "https://login.smaiclub.top?redirect=" + encodeURIComponent(returnUrl);
              }
          })
          .catch(() => {
              const returnUrl = window.location.href;
              window.location.href = "https://login.smaiclub.top?redirect=" + encodeURIComponent(returnUrl);
          });
  }, []);

  useEffect(() => {
    if (authInitialized.current) return;

    const initAuth = () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        if ((window as any).CommonAuth && !authInitialized.current) {
            authInitialized.current = true;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (window as any).CommonAuth.init('auth-container-root');
        }
    };

    // Try immediately
    initAuth();

    // If not loaded yet, wait a bit or listen for load (if possible, but setTimeout loop is simpler for now)
    // Actually, the script is blocking in head, so it should be available.
    // But DOM element might need a tick.
    const timer = setTimeout(initAuth, 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative h-screen flex flex-col items-center justify-center p-4">
        <div className="absolute top-6 right-6 z-50">
            <div id="auth-container-root"></div>
        </div>
        
        {view === 'loading' ? (
          <div className="flex flex-col items-center gap-4 text-white">
              <i className="fas fa-spinner fa-spin text-3xl text-blue-500"></i>
              <div className="text-sm text-gray-500">Authenticating...</div>
          </div>
        ) : (
          <>
            {user && user.isBanned && (
                <BannedModal
                    user={user}
                    onEmergency={() => {
                        setRoom({ id: '000001', key: 'smaiclub_issues', name: 'Emergency Channel' });
                        setView('chat');
                    }}
                />
            )}
            {view === 'landing' && (
                <Landing
                    user={user}
                    onCreate={() => setView('create')}
                    onJoin={() => { setJoinId(""); setJoinName(""); setView('join'); }}
                    onEnterRoom={(r: Room) => { setJoinId(r.id.toString()); setJoinName(r.name); setView('join'); }}
                    onEmergency={() => {
                        setRoom({ id: '000001', key: 'smaiclub_issues', name: 'Emergency Channel' });
                        setView('chat');
                    }}
                />
            )}
            {view === 'create' && (
                <CreateRoom
                    onBack={() => setView('landing')}
                    onCreated={(r: Room) => {
                        localStorage.setItem(`room_key_${r.id}`, r.key);
                        setRoom(r);
                        setView('chat');
                    }}
                />
            )}
            {view === 'join' && (
                <JoinRoom
                    initialRoomId={joinId}
                    initialRoomName={joinName}
                    onBack={() => setView('landing')}
                    onJoined={(r: Room) => { setRoom(r); setView('chat'); }}
                />
            )}
            {view === 'chat' && room && user && (
                <ChatRoom
                    roomId={parseInt(room.id.toString())}
                    roomKey={room.key}
                    roomName={room.name}
                    user={user}
                    onLeave={() => { setRoom(null); setView('landing'); }}
                />
            )}
          </>
        )}
    </div>
  );
}

export default App;
