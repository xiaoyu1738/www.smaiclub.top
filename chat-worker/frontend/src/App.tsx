import { useState, useEffect } from 'react';
import { ChatRoom } from './components/ChatRoom';
import { Landing } from './components/Landing';
import { CreateRoom } from './components/CreateRoom';
import { JoinRoom } from './components/JoinRoom';
import type { User, Room } from './types';
import './App.css';

function App() {
  const [view, setView] = useState("loading"); // loading, landing, create, join, chat
  const [user, setUser] = useState<User | null>(null);
  const [room, setRoom] = useState<Room | null>(null);
  const [joinId, setJoinId] = useState("");
  const [joinName, setJoinName] = useState("");

  useEffect(() => {
      fetch('https://login.smaiclub.top/api/me', { credentials: 'include' })
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
                  
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  if ((window as any).CommonAuth) {
                      // eslint-disable-next-line @typescript-eslint/no-explicit-any
                      (window as any).CommonAuth.init('auth-container-root');
                  }
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (view === 'landing' && (window as any).CommonAuth) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        setTimeout(() => (window as any).CommonAuth.init('auth-container-root'), 100);
    }
  }, [view]);

  if (view === 'loading') return (
      <div className="flex flex-col items-center gap-4 text-white">
          <i className="fas fa-spinner fa-spin text-3xl text-blue-500"></i>
          <div className="text-sm text-gray-500">Authenticating...</div>
      </div>
  );

  return (
    <div className="relative h-screen flex flex-col items-center justify-center p-4">
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
    </div>
  );
}

export default App;
