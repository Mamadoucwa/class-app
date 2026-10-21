import { useState, useEffect, useRef } from 'react';
import { socket } from './socket';
import { useWebRTC } from './useWebRTC';
import Whiteboard from './Whiteboard';

// 🔑 URL de l'API (locale ou production selon la variable d'environnement)
const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001';

function App() {
  // --- ÉTATS D'AUTHENTIFICATION ---
  const [isLoginView, setIsLoginView] = useState(true);
  const [authError, setAuthError] = useState('');
  const [user, setUser] = useState(null); // { id, name, role }
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('student');

  // --- ÉTATS POUR LES CLASSES ---
  const [classCode, setClassCode] = useState('');
  const [className, setClassName] = useState('');
  const [myClasses, setMyClasses] = useState([]);
  const [createError, setCreateError] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  // --- ÉTATS DE CLASSE EN COURS ---
  const [inClass, setInClass] = useState(false);
  const [connected, setConnected] = useState(false);
  const [participants, setParticipants] = useState([]);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [isScreenSharing, setIsScreenSharing] = useState(false);
  const [handRaised, setHandRaised] = useState(false);
  const [showWhiteboard, setShowWhiteboard] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  const { peers, myStream } = useWebRTC({
    roomId: classCode,
    user: { name: user?.name, role: user?.role },
    inClass,
  });

  // --- AUTHENTIFICATION ---
  const handleAuth = async (e) => {
    e.preventDefault();
    setAuthError('');

    const endpoint = isLoginView ? '/login' : '/register';
    const body = isLoginView
      ? { email, password }
      : { name, email, password, role };

    try {
      const res = await fetch(`${API_URL}/api/auth${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setAuthError(data.message || 'Erreur inconnue');
        return;
      }

      if (isLoginView) {
        setUser(data.user);
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
      } else {
        alert('Compte créé ! Connecte-toi maintenant.');
        setIsLoginView(true);
      }
    } catch (err) {
      setAuthError('Impossible de contacter le serveur.');
    }
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem('token');
    localStorage.removeItem('user');
  };

  // --- CRÉER UNE CLASSE (Prof) ---
  const handleCreateClass = async (e) => {
    e.preventDefault();
    setCreateError('');
    if (!className.trim()) return;

    try {
      const res = await fetch(`${API_URL}/api/auth/create-class`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: className, teacherId: user.id }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Erreur');

      setMyClasses((prev) => [...prev, data]);
      setClassName('');
      setIsCreating(false);
      alert(`Classe créée ! Code : ${data.code}\nPartage ce code avec tes élèves.`);
    } catch (err) {
      setCreateError(err.message);
    }
  };

  // --- REJOINDRE UNE CLASSE (Élève) ---
  const handleJoinClass = async (e) => {
    e.preventDefault();
    if (!classCode) return;

    try {
      const res = await fetch(`${API_URL}/api/auth/join-class`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: classCode, studentId: user.id }),
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.message || 'Code invalide');
        return;
      }

      socket.connect();
      socket.emit('join-class', {
        roomId: classCode,
        user: { name: user.name, role: user.role },
      });
      setInClass(true);
    } catch (err) {
      alert('Impossible de rejoindre la classe.');
    }
  };

  // --- DÉMARRER UNE CLASSE (Prof, depuis sa liste) ---
  const startClass = (code) => {
    setClassCode(code);
    socket.connect();
    socket.emit('join-class', {
      roomId: code,
      user: { name: user.name, role: user.role },
    });
    setInClass(true);
  };

  const handleLeave = () => {
    socket.disconnect();
    setInClass(false);
    setParticipants([]);
    setMessages([]);
  };

  // --- SOCKET ---
  useEffect(() => {
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('participants-list', (list) => setParticipants(list));
    socket.on('chat-message', (message) => setMessages((prev) => [...prev, message]));
    socket.on('chat-history', (history) => setMessages(history));

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('participants-list');
      socket.off('chat-message');
      socket.off('chat-history');
    };
  }, []);

  // --- CHAT ---
  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    socket.emit('chat-message', {
      roomId: classCode,
      text: newMessage,
      user: { name: user.name, role: user.role },
    });
    setNewMessage('');
  };

  // --- CONTRÔLES ---
  const toggleMic = () => {
    if (!myStream) return;
    const audioTrack = myStream.getAudioTracks()[0];
    if (audioTrack) { audioTrack.enabled = !micOn; setMicOn(!micOn); }
  };

  const toggleCam = () => {
    if (!myStream) return;
    const videoTrack = myStream.getVideoTracks()[0];
    if (videoTrack) { videoTrack.enabled = !camOn; setCamOn(!camOn); }
  };

  const toggleHand = () => {
    const newState = !handRaised;
    setHandRaised(newState);
    socket.emit('raise-hand', {
      roomId: classCode,
      raised: newState,
      user: { name: user.name, role: user.role },
    });
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const screenTrack = screenStream.getVideoTracks()[0];
        if (myStream) {
          const videoTrack = myStream.getVideoTracks()[0];
          if (videoTrack) { myStream.removeTrack(videoTrack); videoTrack.stop(); }
          myStream.addTrack(screenTrack);
        }
        screenTrack.onended = () => stopScreenShare();
        setIsScreenSharing(true);
      } else {
        stopScreenShare();
      }
    } catch (err) { console.error(err); }
  };

  const stopScreenShare = async () => {
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      if (myStream) {
        const screenTrack = myStream.getVideoTracks()[0];
        if (screenTrack) { myStream.removeTrack(screenTrack); screenTrack.stop(); }
        myStream.addTrack(cameraStream.getVideoTracks()[0]);
      }
      setIsScreenSharing(false);
    } catch (err) { console.error(err); }
  };

  const startRecording = () => {
    if (!myStream) return alert('Caméra non disponible');
    try {
      recordedChunksRef.current = [];
      const options = { mimeType: 'video/webm;codecs=vp9,opus' };
      let recorder;
      try { recorder = new MediaRecorder(myStream, options); } catch (e) { recorder = new MediaRecorder(myStream); }
      recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) recordedChunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `classe-${classCode}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
        document.body.appendChild(a); a.click();
        setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 100);
      };
      recorder.start(1000); mediaRecorderRef.current = recorder; setIsRecording(true);
    } catch (err) { alert('Erreur enregistrement : ' + err.message); }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop(); setIsRecording(false);
    }
  };

  // ===== 1. ÉCRAN DE CONNEXION =====
  if (!user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center p-3">
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
          <h1 className="text-3xl font-bold text-gray-800 text-center mb-2">🎓 Classes en Ligne</h1>
          <p className="text-gray-500 text-center mb-6">{isLoginView ? 'Connecte-toi' : 'Crée un compte'}</p>
          {authError && <div className="bg-red-100 text-red-700 p-3 rounded-lg mb-4 text-sm">{authError}</div>}
          <form onSubmit={handleAuth} className="space-y-4">
            {!isLoginView && <input type="text" placeholder="Nom complet" value={name} onChange={(e) => setName(e.target.value)} required className="w-full px-4 py-3 border-2 rounded-xl" />}
            <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required className="w-full px-4 py-3 border-2 rounded-xl" />
            <input type="password" placeholder="Mot de passe" value={password} onChange={(e) => setPassword(e.target.value)} required className="w-full px-4 py-3 border-2 rounded-xl" />
            {!isLoginView && (
              <select value={role} onChange={(e) => setRole(e.target.value)} className="w-full px-4 py-3 border-2 rounded-xl bg-white">
                <option value="student">👨‍🎓 Élève</option>
                <option value="teacher">👨‍🏫 Enseignant</option>
              </select>
            )}
            <button type="submit" className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-xl">{isLoginView ? 'Se connecter' : "S'inscrire"}</button>
          </form>
          <p className="text-center mt-6 text-sm text-gray-600">
            {isLoginView ? "Pas encore de compte ? " : "Déjà un compte ? "}
            <button onClick={() => { setIsLoginView(!isLoginView); setAuthError(''); }} className="text-purple-600 font-bold hover:underline">
              {isLoginView ? "S'inscrire" : 'Se connecter'}
            </button>
          </p>
        </div>
      </div>
    );
  }

  // ===== 2. ÉCRAN PROF / ÉLÈVE (Si connecté mais pas en classe) =====
  if (!inClass) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center p-3">
        <div className="bg-white rounded-3xl shadow-2xl p-8 w-full max-w-md">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-xl font-bold text-gray-800">Bonjour, {user.name} !</h1>
            <button onClick={handleLogout} className="text-sm text-red-500 hover:underline">Déconnexion</button>
          </div>

          {user.role === 'teacher' ? (
            <div>
              <h2 className="text-lg font-bold text-gray-700 mb-4">👨‍🏫 Mes classes</h2>
              {myClasses.length === 0 && !isCreating && <p className="text-gray-500 mb-4">Tu n'as pas encore de classe.</p>}
              {myClasses.map((c) => (
                <div key={c._id} className="bg-gray-100 p-4 rounded-xl mb-3 flex justify-between items-center">
                  <div>
                    <p className="font-bold">{c.name}</p>
                    <p className="text-sm text-gray-600">Code : <span className="font-mono bg-white px-2 py-1 rounded">{c.code}</span></p>
                  </div>
                  <button onClick={() => startClass(c.code)} className="bg-green-500 text-white px-4 py-2 rounded-lg text-sm font-bold hover:bg-green-600">Démarrer</button>
                </div>
              ))}
              {isCreating ? (
                <form onSubmit={handleCreateClass} className="space-y-3 mt-4">
                  <input type="text" placeholder="Nom de la classe (ex: Maths 3ème)" value={className} onChange={(e) => setClassName(e.target.value)} required className="w-full px-4 py-3 border-2 rounded-xl" />
                  {createError && <p className="text-red-500 text-sm">{createError}</p>}
                  <div className="flex gap-2">
                    <button type="submit" className="flex-1 bg-purple-600 text-white font-bold py-3 rounded-xl">Créer</button>
                    <button type="button" onClick={() => setIsCreating(false)} className="px-4 text-gray-600">Annuler</button>
                  </div>
                </form>
              ) : (
                <button onClick={() => setIsCreating(true)} className="w-full bg-purple-600 hover:bg-purple-700 text-white font-bold py-4 rounded-xl mt-4">+ Créer une nouvelle classe</button>
              )}
            </div>
          ) : (
            <div>
              <h2 className="text-lg font-bold text-gray-700 mb-4">👨‍🎓 Rejoindre une classe</h2>
              <form onSubmit={handleJoinClass} className="space-y-4">
                <input type="text" placeholder="Code de la classe (ex: MATH-X7B)" value={classCode} onChange={(e) => setClassCode(e.target.value.toUpperCase())} required className="w-full px-4 py-3 border-2 rounded-xl text-center text-xl font-bold uppercase" />
                <button type="submit" className="w-full bg-green-500 hover:bg-green-600 text-white font-bold py-4 rounded-xl">Rejoindre la classe →</button>
              </form>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== 3. ÉCRAN DE CLASSE =====
  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white flex flex-col">
      <header className="bg-white/5 backdrop-blur-lg border-b border-white/10 px-3 md:px-6 py-2 md:py-3 flex justify-between items-center gap-2">
        <div className="flex items-center gap-2 md:gap-4 flex-wrap">
          <h1 className="text-base md:text-xl font-bold">📚 {classCode}</h1>
          <span className="text-xs md:text-sm text-gray-400">👥 {participants.length}</span>
          <span className={`text-xs md:text-sm ${connected ? 'text-green-400' : 'text-red-400'}`}>●</span>
          {isRecording && <span className="text-xs bg-red-500/20 border border-red-400/50 px-2 py-0.5 rounded-full font-bold text-red-300 animate-pulse">🔴</span>}
        </div>
        <button onClick={handleLeave} className="bg-red-500 hover:bg-red-600 px-3 md:px-4 py-1.5 md:py-2 rounded-lg text-xs md:text-sm font-semibold transition-colors">Quitter</button>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row gap-2 md:gap-4 p-2 md:p-4 overflow-hidden">
        <div className="flex-1 flex flex-col gap-2 md:gap-4 overflow-hidden h-[40vh] lg:h-auto">
          {showWhiteboard ? (
            <div className="flex-1 overflow-hidden"><Whiteboard roomId={classCode} /></div>
          ) : (
            <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-2 auto-rows-min overflow-auto content-start">
              {myStream && <VideoTile key="my-video" stream={myStream} name={`${user.name} (Vous)`} muted />}
              {Object.entries(peers).map(([socketId, { stream, user: peerUser }]) => (
                <VideoTile key={`peer-${socketId}`} stream={stream} name={peerUser?.name || 'Participant'} />
              ))}
            </div>
          )}
        </div>

        <div className="w-full lg:w-80 flex flex-col gap-2 md:gap-4 overflow-hidden flex-1 lg:flex-none lg:h-auto">
          <div className="flex-1 bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 flex flex-col overflow-hidden">
            <div className="px-4 py-3 border-b border-white/10"><h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide">💬 Chat</h2></div>
            <div className="flex-1 overflow-y-auto p-3 space-y-2">
              {messages.length === 0 && <p className="text-center text-gray-500 text-sm mt-8">Aucun message pour l'instant...</p>}
              {messages.map((msg, i) => (
                <div key={i} className={`rounded-lg px-3 py-2 text-sm ${msg.socketId === socket.id ? 'bg-purple-500/30 border border-purple-400/30 ml-6' : 'bg-white/5 border border-white/10 mr-6'}`}>
                  <div className="text-xs font-bold text-purple-300 mb-0.5">{msg.user.name}</div>
                  <div className="text-white break-words">{msg.text}</div>
                </div>
              ))}
            </div>
            <form onSubmit={handleSendMessage} className="p-3 border-t border-white/10 flex gap-2">
              <input type="text" value={newMessage} onChange={(e) => setNewMessage(e.target.value)} placeholder="Votre message..." className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-purple-400 transition-colors" />
              <button type="submit" className="bg-purple-500 hover:bg-purple-600 px-3 rounded-lg font-bold transition-colors">➤</button>
            </form>
          </div>
        </div>
      </div>

      <footer className="bg-white/5 backdrop-blur-lg border-t border-white/10 px-2 md:px-6 pt-2 pb-4 md:py-4 flex justify-center gap-1 md:gap-3 flex-wrap">
        <ControlButton onClick={toggleMic} active={micOn} icon={micOn ? '🎤' : '🔇'} label={micOn ? 'Micro' : 'Muet'} />
        <ControlButton onClick={toggleCam} active={camOn} icon={camOn ? '📹' : '🚫'} label={camOn ? 'Caméra' : 'Off'} />
        <ControlButton onClick={toggleScreenShare} active={!isScreenSharing} color={isScreenSharing ? 'orange' : 'blue'} icon={isScreenSharing ? '🛑' : '🖥️'} label={isScreenSharing ? 'Arrêter' : 'Partager'} />
        <ControlButton onClick={toggleHand} active={!handRaised} color={handRaised ? 'orange' : 'gray'} icon="✋" label={handRaised ? 'Main levée' : 'Lever main'} />
        <ControlButton onClick={() => setShowWhiteboard(!showWhiteboard)} active={!showWhiteboard} color={showWhiteboard ? 'orange' : 'gray'} icon="📝" label={showWhiteboard ? 'Fermer' : 'Tableau'} />
        <ControlButton onClick={isRecording ? stopRecording : startRecording} active={!isRecording} color={isRecording ? 'red' : 'gray'} icon={isRecording ? '⏹️' : '🔴'} label={isRecording ? 'Arrêter' : 'Enregistrer'} />
      </footer>
    </div>
  );
}

function VideoTile({ stream, name, muted = false }) {
  const videoRef = useRef();
  useEffect(() => { if (videoRef.current && stream) videoRef.current.srcObject = stream; }, [stream]);
  return (
    <div className="relative bg-black rounded-2xl overflow-hidden aspect-video shadow-lg border border-white/10">
      <video ref={videoRef} autoPlay playsInline muted={muted} className="w-full h-full object-cover" />
      <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm text-white px-3 py-1 rounded-lg text-sm font-semibold">{name}</div>
    </div>
  );
}

function ControlButton({ onClick, active, icon, label, color = 'green' }) {
  const colorClasses = {
    green: active ? 'bg-green-500/20 border-green-400/50 hover:bg-green-500/30' : 'bg-red-500/20 border-red-400/50 hover:bg-red-500/30',
    blue: 'bg-blue-500/20 border-blue-400/50 hover:bg-blue-500/30',
    orange: 'bg-orange-500/20 border-orange-400/50 hover:bg-orange-500/30',
    red: 'bg-red-500/30 border-red-400/60 hover:bg-red-500/40 animate-pulse',
    gray: 'bg-gray-500/20 border-gray-400/50 hover:bg-gray-500/30',
  };
  return (
    <button onClick={onClick} className={`px-2 md:px-5 py-2 md:py-3 rounded-lg md:rounded-xl border-2 font-semibold text-xs md:text-sm transition-all flex items-center gap-1 md:gap-2 backdrop-blur-sm ${colorClasses[color]}`}>
      <span className="text-base md:text-xl">{icon}</span>
      <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

export default App;