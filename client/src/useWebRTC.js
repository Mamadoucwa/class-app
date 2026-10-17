import { useEffect, useRef, useState } from 'react';
import Peer from 'simple-peer';
import { socket } from './socket';

export function useWebRTC({ roomId, user, inClass }) {
  const [peers, setPeers] = useState({});
  const [myStream, setMyStream] = useState(null);
  const peersRef = useRef({});
  const streamRef = useRef(null); // 🔒 Référence unique au flux

  // 1️⃣ Activer la caméra et le micro quand on entre en classe
  useEffect(() => {
    if (!inClass) return;

    // 🔒 Si un flux existe déjà, on le réutilise
    if (streamRef.current) {
      console.log('♻️ Réutilisation du flux existant');
      setMyStream(streamRef.current);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        // 🔒 Nettoyer tout ancien flux résiduel
        if (streamRef.current) {
          streamRef.current.getTracks().forEach((t) => t.stop());
          streamRef.current = null;
        }

        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: 320, height: 240 },
          audio: true,
        });

        // 🔒 Si le composant a été démonté pendant l'attente, on arrête
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        streamRef.current = stream;
        setMyStream(stream);
        console.log('✅ Caméra activée (une seule fois)');
        console.log('  Nombre de pistes vidéo:', stream.getVideoTracks().length);
      } catch (err) {
        console.error('❌ Caméra:', err);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [inClass]);

  // 2️⃣ Gérer les connexions P2P
  useEffect(() => {
    if (!myStream || !inClass) return;

    const handleUserJoined = ({ socketId, user: newUser }) => {
      if (socketId === socket.id) return;

      const peer = new Peer({
        initiator: true,
        trickle: false,
        stream: myStream,
      });

      peer.on('signal', (signal) => {
        socket.emit('signal', { to: socketId, signal });
      });

      peer.on('stream', (remoteStream) => {
        setPeers((prev) => ({
          ...prev,
          [socketId]: { stream: remoteStream, user: newUser },
        }));
      });

      peer.on('error', (err) => console.error('Erreur peer:', err));
      peersRef.current[socketId] = peer;
    };

    const handleSignal = ({ from, signal }) => {
      if (from === socket.id) return;

      if (peersRef.current[from]) {
        peersRef.current[from].signal(signal);
        return;
      }

      const peer = new Peer({
        initiator: false,
        trickle: false,
        stream: myStream,
      });

      peer.on('signal', (s) => {
        socket.emit('signal', { to: from, signal: s });
      });

      peer.on('stream', (remoteStream) => {
        setPeers((prev) => ({
          ...prev,
          [from]: { stream: remoteStream, user: { name: 'Participant' } },
        }));
      });

      peer.on('error', (err) => console.error('Erreur peer:', err));
      peer.signal(signal);
      peersRef.current[from] = peer;
    };

    const handleUserLeft = (socketId) => {
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