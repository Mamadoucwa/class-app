const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Route de test
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Le serveur fonctionne !' });
});

// Stockage des salles en mémoire
const rooms = {};

io.on('connection', (socket) => {
  console.log('🔌 Utilisateur connecté:', socket.id);

  // 1️⃣ Un utilisateur rejoint une classe
  socket.on('join-class', ({ roomId, user }) => {
    // Créer la salle si elle n'existe pas
    if (!rooms[roomId]) {
      rooms[roomId] = { participants: [] };
    }

    // Ajouter le participant
    rooms[roomId].participants.push({
      ...user,
      socketId: socket.id,
    });

    // Rejoindre la "room" Socket.io
    socket.join(roomId);

    console.log(`👤 ${user.name} (${user.role}) a rejoint ${roomId}`);
    console.log(`   Participants: ${rooms[roomId].participants.length}`);

    // Envoyer la liste à TOUS les participants de la salle
    io.to(roomId).emit('participants-list', rooms[roomId].participants);

    // Notifier les autres qu'un nouveau est arrivé (sauf lui-même)
    socket.to(roomId).emit('user-joined', { user, socketId: socket.id });
    
        // Envoyer aussi la liste des participants actuels au nouvel arrivant
    socket.emit('existing-participants', rooms[roomId].participants);
  });

  // 2️⃣ Message de chat
  socket.on('chat-message', ({ roomId, text, user }) => {
    const message = {
      text,
      user,
      socketId: socket.id,
      timestamp: Date.now(),
    };

    console.log(`💬 ${user.name}: ${text}`);

    // Envoyer à TOUS les participants de la salle (y compris l'expéditeur)
    io.to(roomId).emit('chat-message', message);
  });

  // 3️⃣ Signalisation WebRTC
  socket.on('signal', ({ to, signal }) => {
    console.log(`📡 Signal de ${socket.id} vers ${to}`);
    io.to(to).emit('signal', { from: socket.id, signal });
  });

  // 4️⃣ Tableau blanc : dessin en temps réel
  socket.on('draw', ({ roomId, drawData }) => {
    socket.to(roomId).emit('draw', drawData);
  });

  // 5️⃣ Tableau blanc : effacer
  socket.on('clear-board', ({ roomId }) => {
    socket.to(roomId).emit('clear-board');
  });

  // 6️⃣ Lever / baisser la main
  socket.on('raise-hand', ({ roomId, raised, user }) => {
    console.log(`✋ ${user.name} ${raised ? 'lève' : 'baisse'} la main`);

    if (rooms[roomId]) {
      const participant = rooms[roomId].participants.find(
        (p) => p.socketId === socket.id
      );
      if (participant) {
        participant.handRaised = raised;
      }

      io.to(roomId).emit('participants-list', rooms[roomId].participants);
    }
  });

  // 7️⃣ Un utilisateur se déconnecte
  socket.on('disconnect', () => {
    console.log('❌ Déconnecté:', socket.id);

    for (const roomId in rooms) {
      const before = rooms[roomId].participants.length;
      rooms[roomId].participants = rooms[roomId].participants.filter(
        (p) => p.socketId !== socket.id
      );
      const after = rooms[roomId].participants.length;

      if (before !== after) {
        io.to(roomId).emit('participants-list', rooms[roomId].participants);
        io.to(roomId).emit('user-left', socket.id);
        console.log(`👋 Un participant a quitté ${roomId}`);
      }
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log('🚀 Serveur sur http://localhost:3001');
});