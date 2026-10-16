import { useEffect, useRef, useState } from 'react';
import Peer from 'simple-peer';
import { socket } from './socket';

export function useWebRTC({ roomId, user, inClass }) {
  const [peers, setPeers] = useState({});
  const [myStream, setMyStream] = useState(null);
  const peersRef = useRef({}); // Stockage stable des peers

  // 1️⃣ Activer la caméra et le micro quand on entre en classe
  useEffect(() => {
    if (!inClass) return;

    let stream;

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240 },
          audio: true,
        });
        setMyStream(stream);
        console.log('✅ Caméra activée');
      } catch (err) {
        console.error('❌ Impossible d\'accéder à la caméra:', err);
        alert('Caméra refusée. Tu ne pourras pas être vu.');
      }
    })();

    return () => {
      if (stream) {
        stream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [inClass]);

  // 2️⃣ Gérer les connexions P2P
  useEffect(() => {
    if (!myStream || !inClass) return;

    // --- Un nouvel utilisateur arrive : JE l'appelle (initiator) ---
    const handleUserJoined = ({ socketId, user: newUser }) => {
      console.log(`👤 ${newUser.name} a rejoint, création du peer...`);

      const peer = new Peer({
        initiator: true,
        trickle: false,
        stream: myStream,
      });

      peer.on('signal', (signal) => {
        // Envoyer mon "offre" à ce participant via le serveur
        socket.emit('signal', { to: socketId, signal });
      });

      peer.on('stream', (remoteStream) => {
        console.log(`📹 Stream reçu de ${newUser.name}`);
        setPeers((prev) => ({
          ...prev,
          [socketId]: { stream: remoteStream, user: newUser },
        }));
      });

      peer.on('error', (err) => {
        console.error('Erreur peer:', err);
      });

      peersRef.current[socketId] = peer;
    };

    // --- Je reçois un signal (offre ou réponse) ---
    const handleSignal = ({ from, signal }) => {
      // Cas A : peer déjà créé → c'est une réponse à mon offre
      if (peersRef.current[from]) {
        console.log(`📡 Signal reçu de ${from} (peer existant)`);
        peersRef.current[from].signal(signal);
        return;
      }

      // Cas B : peer inconnu → c'est une offre, je réponds
      console.log(`📡 Signal reçu de ${from} (nouveau peer)`);

      const peer = new Peer({
        initiator: false,
        trickle: false,
        stream: myStream,
      });

      peer.on('signal', (s) => {
        socket.emit('signal', { to: from, signal: s });
      });

      peer.on('stream', (remoteStream) => {
        console.log(`📹 Stream reçu de ${from}`);
        setPeers((prev) => ({
          ...prev,
          [from]: { stream: remoteStream, user: { name: 'Participant' } },
        }));
      });

      peer.on('error', (err) => {
        console.error('Erreur peer:', err);
      });

      peer.signal(signal);
      peersRef.current[from] = peer;
    };

    // --- Un utilisateur part ---
    const handleUserLeft = (socketId) => {
      console.log(`👋 ${socketId} a quitté`);
      if (peersRef.current[socketId]) {
        peersRef.current[socketId].destroy();
        delete peersRef.current[socketId];
      }
      setPeers((prev) => {
        const copy = { ...prev };
        delete copy[socketId];
        return copy;
      });
    };

    socket.on('user-joined', handleUserJoined);
    socket.on('signal', handleSignal);
    socket.on('user-left', handleUserLeft);

    return () => {
      socket.off('user-joined', handleUserJoined);
      socket.off('signal', handleSignal);
      socket.off('user-left', handleUserLeft);
    };
  }, [myStream, inClass]);

  return { peers, myStream };
}