# Backend React Application

Ce projet est le backend de l'application React de gestion de recettes et de courses.

## Installation

```bash
# Installer les dépendances
npm install

# Démarrer le serveur en mode développement
npm run dev

# Démarrer le serveur en mode production
npm start
```

## Variables d'environnement

Créez un fichier `.env` à la racine du projet avec les variables suivantes :

```env
PORT=3001
MONGODB_URI=votre_uri_mongodb
JWT_SECRET=votre_secret_jwt
GMAIL_EMAIL=votre_email_gmail
GMAIL_PASSWORD=votre_mot_de_passe_gmail
GEMINI_APIKEY=votre_cle_api_gemini
```

## API Endpoints

- `GET /api/recipes` - Récupérer toutes les recettes
- `POST /api/recipes` - Créer une nouvelle recette
- `GET /api/recipes/:id` - Récupérer une recette spécifique
- `PUT /api/recipes/:id` - Mettre à jour une recette
- `DELETE /api/recipes/:id` - Supprimer une recette

## Technologies utilisées

- Node.js
- Express
- Firebase
- Nodemailer
- Google Gemini AI
- CORS 