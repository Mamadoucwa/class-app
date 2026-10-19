const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
require('dotenv').config();
const mongoose = require('mongoose');
const Message = require('./models/Message');

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

// ===== CONNEXION MONGODB =====
mongoose
  .connect(process.env.MONGO_URI)
  .then(() => console.log('✅ MongoDB connecté'))
  .catch((err) => console.error('❌ MongoDB erreur:', err));

io.on('connection', (socket) => {
  console.log('🔌 Utilisateur connecté:', socket.id);

  // 1️⃣ Un utilisateur rejoint une classe
  socket.on('join-class', async ({ roomId, user }) => {
    if (!rooms[roomId]) {
      rooms[roomId] = { participants: [] };
    }

    rooms[roomId].participants.push({
      ...user,
      socketId: socket.id,
    });

    socket.join(roomId);

    console.log(`👤 ${user.name} (${user.role}) a rejoint ${roomId}`);
    console.log(`   Participants: ${rooms[roomId].participants.length}`);

    // 🔥 Charger l'historique depuis MongoDB
    try {
      const history = await Message.find({ roomId })
        .sort({ timestamp: 1 })
        .limit(100);

      socket.emit('chat-history', history);
      console.log(`📚 Historique envoyé : ${history.length} messages`);
    } catch (err) {
      console.error('❌ Erreur chargement historique:', err);
    }

    // Envoyer la liste à tous
    io.to(roomId).emit('participants-list', rooms[roomId].participants);

    // Notifier les autres
    socket.to(roomId).emit('user-joined', { user, socketId: socket.id });
  });

  // 2️⃣ Message de chat (avec sauvegarde MongoDB)
  socket.on('chat-message', async ({ roomId, text, user }) => {
    const messageData = {
      roomId,
      text,
      user,
      socketId: socket.id,
      timestamp: new Date(),
    };

    console.log(`💬 ${user.name}: ${text}`);

    try {
      const savedMessage = await Message.create(messageData);
      io.to(roomId).emit('chat-message', savedMessage);
    } catch (err) {
      console.error('❌ Erreur sauvegarde message:', err);
      // Si erreur, on envoie quand même le message sans sauvegarde
      io.to(roomId).emit('chat-message', messageData);
    }
  });

  // 3️⃣ Signalisation WebRTC
  socket.on('signal', ({ to, signal }) => {
    io.to(to).emit('signal', { from: socket.id, signal });
  });

  // 4️⃣ Tableau blanc : dessin
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

  // 7️⃣ Déconnexion
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

// ===== DÉMARRAGE DU SERVEUR (À LA FIN) =====
const PORT = 3001;
server.listen(PORT, () => {
  console.log(`🚀 Serveur sur http://localhost:${PORT}`);
});