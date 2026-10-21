const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Class = require('../models/Class');

const JWT_SECRET = process.env.JWT_SECRET || 'secret_temporaire_a_changer';

// 1️⃣ INSCRIPTION (Register)
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    
    const existingUser = await User.findOne({ email });
    if (existingUser) return res.status(400).json({ message: "Cet email est déjà utilisé." });

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashedPassword, role });

    res.status(201).json({ message: "Compte créé avec succès !", userId: user._id });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

// 2️⃣ CONNEXION (Login)
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "Email ou mot de passe incorrect." });

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) return res.status(401).json({ message: "Email ou mot de passe incorrect." });

    const token = jwt.sign(
      { userId: user._id, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    res.json({ token, user: { id: user._id, name: user.name, role: user.role } });
  } catch (err) {
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

// 3️⃣ CRÉER UNE CLASSE (Prof)
router.post('/create-class', async (req, res) => {
  try {
    const { name, teacherId } = req.body;
    const code = Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 5).toUpperCase();

    const newClass = await Class.create({ name, code, teacherId });
    res.status(201).json(newClass);
  } catch (err) {
    res.status(500).json({ message: "Erreur création classe", error: err.message });
  }
});

// 4️⃣ REJOINDRE UNE CLASSE (Élève)
router.post('/join-class', async (req, res) => {
  try {
    const { code, studentId } = req.body;

    const foundClass = await Class.findOne({ code });
    if (!foundClass) return res.status(404).json({ message: "Code de classe invalide." });

    if (!foundClass.students.includes(studentId)) {
      foundClass.students.push(studentId);
      await foundClass.save();
    }

    res.json({ message: "Classe rejointe avec succès !", class: foundClass });
  } catch (err) {
    res.status(500).json({ message: "Erreur", error: err.message });
  }
});

module.exports = router;