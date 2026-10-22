const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Class = require('../models/Class');

const JWT_SECRET = process.env.JWT_SECRET || 'secret_temporaire_a_changer';

// 1️⃣ INSCRIPTION (Register)
router.post('/register', async (req, res) => {
  console.log('🚀 Requête register reçue:', req.body);
  
  try {
    const { name, email, password, role } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Tous les champs sont obligatoires." });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "Cet email est déjà utilisé." });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await User.create({ 
      name, 
      email, 
      password: hashedPassword, 
      role: role || 'student' 
    });

    console.log('✅ Utilisateur créé:', user.email);
    res.status(201).json({ message: "Compte créé avec succès !", userId: user._id });
  } catch (err) {
    console.error('❌ ERREUR REGISTER:', err);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

// 2️⃣ CONNEXION (Login)
router.post('/login', async (req, res) => {
  console.log('🚀 Requête login reçue:', req.body.email);
  
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ message: "Email et mot de passe obligatoires." });
    }

    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ message: "Email ou mot de passe incorrect." });
    }

    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: "Email ou mot de passe incorrect." });
    }

    const token = jwt.sign(
      { userId: user._id, role: user.role, name: user.name },
      JWT_SECRET,
      { expiresIn: '24h' }
    );

    console.log('✅ Connexion réussie:', user.email);
    res.json({ token, user: { id: user._id, name: user.name, role: user.role } });
  } catch (err) {
    console.error('❌ ERREUR LOGIN:', err);
    res.status(500).json({ message: "Erreur serveur", error: err.message });
  }
});

// 3️⃣ CRÉER UNE CLASSE (Prof)
router.post('/create-class', async (req, res) => {
  console.log('🚀 Requête create-class reçue:', req.body);
  
  try {
    const { name, teacherId } = req.body;

    if (!name || !teacherId) {
      return res.status(400).json({ message: "Nom de classe et teacherId obligatoires." });
    }

    const code = Math.random().toString(36).substring(2, 6).toUpperCase() + '-' + Math.random().toString(36).substring(2, 5).toUpperCase();

    const newClass = await Class.create({ name, code, teacherId });
    console.log('✅ Classe créée:', newClass.code);
    res.status(201).json(newClass);
  } catch (err) {
    console.error('❌ ERREUR CREATE-CLASS:', err);
    res.status(500).json({ message: "Erreur création classe", error: err.message });
  }
});

// 4️⃣ REJOINDRE UNE CLASSE (Élève)
router.post('/join-class', async (req, res) => {
  console.log('🚀 Requête join-class reçue:', req.body);
  
  try {
    const { code, studentId } = req.body;

    if (!code || !studentId) {
      return res.status(400).json({ message: "Code et studentId obligatoires." });
    }

    const foundClass = await Class.findOne({ code });
    if (!foundClass) {
      return res.status(404).json({ message: "Code de classe invalide." });
    }

    if (!foundClass.students.includes(studentId)) {
      foundClass.students.push(studentId);
      await foundClass.save();
    }

    console.log('✅ Élève a rejoint la classe:', foundClass.code);
    res.json({ message: "Classe rejointe avec succès !", class: foundClass });
  } catch (err) {
    console.error('❌ ERREUR JOIN-CLASS:', err);
    res.status(500).json({ message: "Erreur", error: err.message });
  }
});

// 5️⃣ RÉCUPÉRER LES CLASSES D'UN PROF
router.get('/my-classes/:teacherId', async (req, res) => {
  console.log('🚀 Requête my-classes pour:', req.params.teacherId);
  
  try {
    const classes = await Class.find({ teacherId: req.params.teacherId });
    console.log(`✅ ${classes.length} classes trouvées`);
    res.json(classes);
  } catch (err) {
    console.error('❌ ERREUR MY-CLASSES:', err);
    res.status(500).json({ message: "Erreur", error: err.message });
  }
});

module.exports = router;