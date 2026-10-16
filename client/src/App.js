import { useState, useEffect, useRef } from 'react';
import { socket } from './socket';
import { useWebRTC } from './useWebRTC';
import Whiteboard from './Whiteboard';

function App() {
  const [name, setName] = useState('');
  const [role, setRole] = useState('student');
  const [roomCode, setRoomCode] = useState('');
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
  const { peers, myStream } = useWebRTC({
    roomId: roomCode,
    user: { name, role },
    inClass,
  });

const [isRecording, setIsRecording] = useState(false);
const mediaRecorderRef = useRef(null);
const recordedChunksRef = useRef([]);

  useEffect(() => {
    socket.on('connect', () => setConnected(true));
    socket.on('disconnect', () => setConnected(false));
    socket.on('participants-list', (list) => setParticipants(list));
    socket.on('user-joined', ({ user }) =>
      console.log(`👋 ${user.name} a rejoint`)
    );
    socket.on('chat-message', (message) =>
      setMessages((prev) => [...prev, message])
    );

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('participants-list');
      socket.off('user-joined');
      socket.off('chat-message');
    };
  }, []);

  const handleJoin = (e) => {
    e.preventDefault();
    if (!name || !roomCode) {
      alert('Remplis ton nom et le code de la classe');
      return;
    }
    socket.connect();
    socket.emit('join-class', {
      roomId: roomCode,
      user: { name, role },
    });
    setInClass(true);
  };

  const handleLeave = () => {
    socket.disconnect();
    setInClass(false);
    setParticipants([]);
    setMessages([]);
  };

  const handleSendMessage = (e) => {
    e.preventDefault();
    if (!newMessage.trim()) return;
    socket.emit('chat-message', {
      roomId: roomCode,
      text: newMessage,
      user: { name, role },
    });
    setNewMessage('');
  };

  const toggleMic = () => {
    if (!myStream) return;
    const audioTrack = myStream.getAudioTracks()[0];
    if (audioTrack) {
      audioTrack.enabled = !micOn;
      setMicOn(!micOn);
    }
  };

  const toggleCam = () => {
    if (!myStream) return;
    const videoTrack = myStream.getVideoTracks()[0];
    if (videoTrack) {
      videoTrack.enabled = !camOn;
      setCamOn(!camOn);
    }
  };

  const toggleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        const screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: false,
        });
        const screenTrack = screenStream.getVideoTracks()[0];
        if (myStream) {
          const videoTrack = myStream.getVideoTracks()[0];
          if (videoTrack) {
            myStream.removeTrack(videoTrack);
            videoTrack.stop();
          }
          myStream.addTrack(screenTrack);
        }
        screenTrack.onended = () => stopScreenShare();
        setIsScreenSharing(true);
      } else {
        stopScreenShare();
      }
    } catch (err) {
      console.error('❌ Erreur partage écran:', err);
    }
  };

  const stopScreenShare = async () => {
    try {
      const cameraStream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: false,
      });
      if (myStream) {
        const screenTrack = myStream.getVideoTracks()[0];
        if (screenTrack) {
          myStream.removeTrack(screenTrack);
          screenTrack.stop();
        }
        myStream.addTrack(cameraStream.getVideoTracks()[0]);
      }
      setIsScreenSharing(false);
    } catch (err) {
      console.error('❌ Erreur arrêt partage:', err);
    }
  };

  const toggleHand = () => {
    const newState = !handRaised;
    setHandRaised(newState);
    socket.emit('raise-hand', {
      roomId: roomCode,
      raised: newState,
      user: { name, role },
    });
  };

  // 🔴 Démarrer l'enregistrement
const startRecording = () => {
  if (!myStream) {
    alert('Caméra non disponible');
    return;
  }

  try {
    // Réinitialiser les chunks
    recordedChunksRef.current = [];

    // Choisir le meilleur format supporté
    const options = { mimeType: 'video/webm;codecs=vp9,opus' };
    let recorder;
    try {
      recorder = new MediaRecorder(myStream, options);
    } catch (e) {
      // Fallback si vp9 n'est pas supporté
      recorder = new MediaRecorder(myStream);
    }

    // À chaque donnée disponible, on la stocke
    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunksRef.current.push(e.data);
      }
    };

    // À l'arrêt, on télécharge le fichier
    recorder.onstop = () => {
      const blob = new Blob(recordedChunksRef.current, {
        type: 'video/webm',
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `classe-${roomCode}-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.webm`;
      document.body.appendChild(a);
      a.click();
      setTimeout(() => {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 100);
    };

    // Démarrer l'enregistrement
    recorder.start(1000); // Un chunk par seconde
    mediaRecorderRef.current = recorder;
    setIsRecording(true);
    console.log('🔴 Enregistrement démarré');
  } catch (err) {
    console.error('❌ Erreur enregistrement:', err);
    alert('Impossible de démarrer l\'enregistrement : ' + err.message);
  }
};

// ⏹️ Arrêter l'enregistrement
const stopRecording = () => {
  if (mediaRecorderRef.current && isRecording) {
    mediaRecorderRef.current.stop();
    setIsRecording(false);
    console.log('⏹️ Enregistrement arrêté, téléchargement en cours...');
  }
};

  // ===== ÉCRAN DE CLASSE =====
  if (inClass) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900 text-white flex flex-col">
        {/* Header */}
        <header className="bg-white/5 backdrop-blur-lg border-b border-white/10 px-6 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold">📚 Classe {roomCode}</h1>
            <span className="text-sm text-gray-400">
              👥 {participants.length} participant{participants.length > 1 ? 's' : ''}
            </span>
            <span className={`text-sm ${connected ? 'text-green-400' : 'text-red-400'}`}>
              ● {connected ? 'En ligne' : 'Hors ligne'}
            </span>
          {isRecording && (
  <span className="text-sm bg-red-500/20 border border-red-400/50 px-3 py-1 rounded-full font-bold text-red-300 animate-pulse">
    🔴 REC
  </span>
)}
          
          </div>
          <button
            onClick={handleLeave}
            className="bg-red-500 hover:bg-red-600 px-4 py-2 rounded-lg text-sm font-semibold transition-colors"
          >
            Quitter
          </button>
        </header>

        {/* Contenu principal */}
        
        <div className="flex-1 flex gap-4 p-4 overflow-hidden">
          {/* Zone vidéo */}
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
            <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 auto-rows-fr overflow-auto">
              {myStream && (
                <VideoTile stream={myStream} name={`${name} (Vous)`} muted />
              )}
              {Object.entries(peers).map(([socketId, { stream, user }]) => (
                <VideoTile
                  key={socketId}
                  stream={stream}
                  name={user?.name || 'Participant'}
                />
              ))}
            </div>
          </div>

          {/* Colonne de droite */}
         
          <div className="flex-1 flex flex-col gap-4 overflow-hidden">
  {showWhiteboard ? (
    <div className="flex-1 overflow-hidden">
      <Whiteboard roomId={roomCode} />
    </div>
  ) : (
    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 gap-3 auto-rows-fr overflow-auto">
      {myStream && (
        <VideoTile stream={myStream} name={`${name} (Vous)`} muted />
      )}
      {Object.entries(peers).map(([socketId, { stream, user }]) => (
        <VideoTile
          key={socketId}
          stream={stream}
          name={user?.name || 'Participant'}
        />
      ))}
    </div>
  )}
</div>


            {/* Chat */}
            <div className="flex-1 bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 flex flex-col overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10">
                <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide">
                  💬 Chat
                </h2>
              </div>
              <div className="flex-1 overflow-y-auto p-3 space-y-2">
                {messages.length === 0 && (
                  <p className="text-center text-gray-500 text-sm mt-8">
                    Aucun message pour l'instant...
                  </p>
                )}
                {messages.map((msg, i) => (
                  <div
                    key={i}
                    className={`rounded-lg px-3 py-2 text-sm ${
                      msg.socketId === socket.id
                        ? 'bg-purple-500/30 border border-purple-400/30 ml-6'
                        : 'bg-white/5 border border-white/10 mr-6'
                    }`}
                  >
                    <div className="text-xs font-bold text-purple-300 mb-0.5">
                      {msg.user.name}
                    </div>
                    <div className="text-white break-words">{msg.text}</div>
                  </div>
                ))}
              </div>
              <form
                onSubmit={handleSendMessage}
                className="p-3 border-t border-white/10 flex gap-2"
              >
                <input
                  type="text"
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Votre message..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 outline-none focus:border-purple-400 transition-colors"
                />
                <button
                  type="submit"
                  className="bg-purple-500 hover:bg-purple-600 px-3 rounded-lg font-bold transition-colors"
                >
                  ➤
                </button>
              </form>
            </div>
          </div>
        

       {/* Barre de contrôles */}
        <footer className="bg-white/5 backdrop-blur-lg border-t border-white/10 px-6 py-4 flex justify-center gap-3 flex-wrap">
          <ControlButton
            onClick={toggleMic}
            active={micOn}
            icon={micOn ? '🎤' : '🔇'}
            label={micOn ? 'Micro' : 'Muet'}
          />
          <ControlButton
            onClick={toggleCam}
            active={camOn}
            icon={camOn ? '📹' : '🚫'}
            label={camOn ? 'Caméra' : 'Off'}
          />
          <ControlButton
            onClick={toggleScreenShare}
            active={!isScreenSharing}
            color={isScreenSharing ? 'orange' : 'blue'}
            icon={isScreenSharing ? '🛑' : '🖥️'}
            label={isScreenSharing ? 'Arrêter' : 'Partager'}
          />
          <ControlButton
            onClick={toggleHand}
            active={!handRaised}
            color={handRaised ? 'orange' : 'gray'}
            icon="✋"
            label={handRaised ? 'Main levée' : 'Lever main'}
          />
        <ControlButton
  onClick={() => setShowWhiteboard(!showWhiteboard)}
  active={!showWhiteboard}
  color={showWhiteboard ? 'orange' : 'gray'}
  icon="📝"
  label={showWhiteboard ? 'Fermer' : 'Tableau'}
/>

<ControlButton
  onClick={isRecording ? stopRecording : startRecording}
  active={!isRecording}
  color={isRecording ? 'red' : 'gray'}
  icon={isRecording ? '⏹️' : '🔴'}
  label={isRecording ? 'Arrêter' : 'Enregistrer'}
/>
        </footer>
      </div>
    );
  }

  // ===== ÉCRAN DE CONNEXION =====
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-600 via-purple-600 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2">
            🎓 Classes en Ligne
          </h1>
          <p className="text-gray-500">Rejoins ta classe virtuelle</p>
        </div>

        <form onSubmit={handleJoin} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Ton nom
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Marie Dupont"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 outline-none transition-colors text-gray-800"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Ton rôle
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 outline-none transition-colors text-gray-800 bg-white"
            >
              <option value="student">👨‍🎓 Élève</option>
              <option value="teacher">👨‍🏫 Enseignant</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">
              Code de la classe
            </label>
            <input
              type="text"
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="Ex: MATH101"
              className="w-full px-4 py-3 border-2 border-gray-200 rounded-xl focus:border-purple-500 outline-none transition-colors text-gray-800 uppercase"
            />
          </div>

          <button
            type="submit"
            className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-bold py-4 rounded-xl transition-all transform hover:scale-[1.02] shadow-lg"
          >
            Rejoindre la classe →
          </button>
        </form>
      </div>
    </div>
  );
}

// 📹 Composant tuile vidéo
function VideoTile({ stream, name, muted = false }) {
  const videoRef = useRef();

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  return (
    <div className="relative bg-black rounded-2xl overflow-hidden aspect-video shadow-lg border border-white/10">
      <video
        ref={videoRef}
        autoPlay
        playsInline
        muted={muted}
        className="w-full h-full object-cover"
      />
      <div className="absolute bottom-2 left-2 bg-black/60 backdrop-blur-sm text-white px-3 py-1 rounded-lg text-sm font-semibold">
        {name}
      </div>
    </div>
  );
}

// 🎛️ Bouton de contrôle
function ControlButton({ onClick, active, icon, label, color = 'green' }) {
  const colorClasses = {
    green: active
      ? 'bg-green-500/20 border-green-400/50 hover:bg-green-500/30'
      : 'bg-red-500/20 border-red-400/50 hover:bg-red-500/30',
    blue: 'bg-blue-500/20 border-blue-400/50 hover:bg-blue-500/30',
    orange: 'bg-orange-500/20 border-orange-400/50 hover:bg-orange-500/30',
    red: 'bg-red-500/30 border-red-400/60 hover:bg-red-500/40 animate-pulse',
    gray: 'bg-gray-500/20 border-gray-400/50 hover:bg-gray-500/30',

  };

  return (
    <button
      onClick={onClick}
      className={`px-5 py-3 rounded-xl border-2 font-semibold text-sm transition-all flex items-center gap-2 backdrop-blur-sm ${colorClasses[color]}`}
    >
      <span className="text-xl">{icon}</span>
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

export default App;