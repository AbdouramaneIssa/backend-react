import express from 'express';
import nodemailer from 'nodemailer';
import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import cors from 'cors';
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, getDocs, getDoc, doc } from 'firebase/firestore';

dotenv.config();

const app = express();
const port = process.env.PORT || 3001;

app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Configuration Firebase
const firebaseConfig = {
  apiKey: "AIzaSyDJrnZfQAAvSXsOu83Fd9ugq-Wb81YhAnc",
  authDomain: "projet-react-39b1f.firebaseapp.com",
  projectId: "projet-react-39b1f",
  storageBucket: "projet-react-39b1f.firebasestorage.app",
  messagingSenderId: "261519078244",
  appId: "1:261519078244:web:8c3e3459c9bca55ba5c071",
  measurementId: "G-W9EDT6RLZ7"
};
const firebaseApp = initializeApp(firebaseConfig);
const db = getFirestore(firebaseApp);

// Configure Nodemailer transporter
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_EMAIL,
    pass: process.env.GMAIL_PASSWORD,
  },
});

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_APIKEY);

// Generate email content
async function generateEmailContent(member, detailedMealPlan) {
  const daysOfWeek = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const mealTypes = ['Petit-déjeuner', 'Déjeuner', 'Dîner'];

  console.log(`[generateEmailContent] Génération pour ${member.fullName}`);

  let mealPlanSummaryForGemini = '';
  daysOfWeek.forEach(day => {
    mealPlanSummaryForGemini += `${day}:\n`;
    mealTypes.forEach(mealType => {
      const dishName = detailedMealPlan[day]?.[mealType]?.name || 'Non planifié';
      mealPlanSummaryForGemini += `    - ${mealType}: ${dishName}\n`;
    });
  });
  let tone = 'professionnel';
  let greeting = `Bonjour ${member.fullName},`;
  let emojis = '';
  if (member.age < 12) {
    tone = 'ludique';
    greeting = `Salut ${member.fullName} ! 😊`;
    emojis = '🌟🍽️';
  } else if (member.age >= 12 && member.age < 18) {
    tone = 'décontracté';
    greeting = `Hey ${member.fullName} ! 👋`;
    emojis = '😎👍';
  }

  const prompt = `
    Générez un message d'email pour un plan de repas hebdomadaire destiné à ${member.fullName}, une personne de ${member.age} ans (${member.gender}).
    Adaptez le ton :
    - Enfant (< 12 ans) : ludique, simple, avec des emojis.
    - Adolescent (12-17 ans) : décontracté, motivant.
    - Adulte (≥ 18 ans) : professionnel, informatif.
    Le message doit inclure :
    - Une salutation personnalisée.
    - Une introduction expliquant le plan de repas.
    - Une conclusion encourageante.
    - Utilisez des emojis pour les enfants et adolescents.
    Le plan de repas détaillé sera inséré dans un tableau HTML après votre message.
    Voici un aperçu pour adapter le ton :
    ${mealPlanSummaryForGemini}

    Retournez uniquement le corps HTML (sans \`\`\`html\`\`\`, sans l'objet, sans le tableau).
  `;

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    let message = result.response.text().replace(/\n/g, '<br/>');

    const mealPlanTable = `
      <table style="width:100%; border-collapse: collapse; margin: 20px 0; font-family: Arial, sans-serif;">
        <thead>
          <tr style="background-color: #4CAF50; color: white;">
            <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Jour</th>
            <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Petit-déjeuner</th>
            <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Déjeuner</th>
            <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Dîner</th>
          </tr>
        </thead>
        <tbody>
          ${daysOfWeek.map(day => {
      const rowColor = (day === 'Samedi' || day === 'Dimanche') ? '#f0f8ff' : '#ffffff';
      const breakfast = detailedMealPlan[day]?.['Petit-déjeuner']?.name || 'Non planifié';
      const lunch = detailedMealPlan[day]?.['Déjeuner']?.name || 'Non planifié';
      const dinner = detailedMealPlan[day]?.['Dîner']?.name || 'Non planifié';
      return `
              <tr style="background-color:${rowColor};">
                <td style="border: 1px solid #ddd; padding: 12px;">${day}</td>
                <td style="border: 1px solid #ddd; padding: 12px;">${breakfast}</td>
                <td style="border: 1px solid #ddd; padding: 12px;">${lunch}</td>
                <td style="border: 1px solid #ddd; padding: 12px;">${dinner}</td>
              </tr>
            `;
    }).join('')}
        </tbody>
      </table>
    `;
    return `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #4CAF50;">${greeting}</h2>
        ${message}
        <p style="font-size: 16px; font-weight: bold;">Votre plan de repas pour la semaine ${emojis} :</p>
        ${mealPlanTable}
        <p style="margin-top: 20px;">${tone === 'ludique' ?
        'Amuse-toi bien à table !' : tone === 'décontracté' ? 'Régale-toi cette semaine !'
          : 'Bon appétit et bonne semaine !'}</p>
        <p style="color: #777;">Cordialement,<br>L'Équipe MealBloom</p>
      </div>
    `;
  } catch (error) {
    console.error(`Erreur Gemini pour ${member.email}:`, error.stack);
    return `
      <div style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h2 style="color: #4CAF50;">Bonjour ${member.fullName},</h2>
        <p>Voici votre plan de repas pour la semaine. Nous avons rencontré un souci technique, mais voici le planning !</p>
        <p style="font-size: 16px; font-weight: bold;">Votre plan de repas pour la semaine :</p>
        <table style="width:100%; border-collapse: collapse; margin: 20px 0; font-family: Arial, sans-serif;">
          <thead>
            <tr style="background-color: #4CAF50; color: white;">
              <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Jour</th>
              <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Petit-déjeuner</th>
              <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Déjeuner</th>
              <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Dîner</th>
            </tr>
          </thead>
          <tbody>
            ${daysOfWeek.map(day => {
      const breakfast = detailedMealPlan[day]?.['Petit-déjeuner']?.name || 'Non planifié';
      const lunch = detailedMealPlan[day]?.['Déjeuner']?.name || 'Non planifié';
      const dinner = detailedMealPlan[day]?.['Dîner']?.name || 'Non planifié';
      return `
                <tr>
                  <td style="border: 1px solid #ddd; padding: 12px;">${day}</td>
                  <td style="border: 1px solid #ddd; padding: 12px;">${breakfast}</td>
                  <td style="border: 1px solid #ddd; padding: 12px;">${lunch}</td>
                  <td style="border: 1px solid #ddd; padding: 12px;">${dinner}</td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
        <p>Bon appétit et bonne semaine !</p>
        <p style="color: #777;">Cordialement,<br>L'Équipe MealBloom</p>
      </div>
    `;
  }
}

// Generate WhatsApp message
async function generateWhatsAppMessage(content) {
  const { member, detailedMealPlan } = content;
  const daysOfWeek = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
  const mealTypes = ['Petit-déjeuner', 'Déjeuner', 'Dîner'];

  let mealPlanSummaryForGemini = '';
  daysOfWeek.forEach(day => {
    mealPlanSummaryForGemini += `${day}:\n`;
    mealTypes.forEach(mealType => {
      const dishName = detailedMealPlan?.[day]?.[mealType]?.name || 'Non planifié';
      mealPlanSummaryForGemini += `  - ${mealType}: ${dishName}\n`;
    });
  });

  if (!member) {
    // Message pour le groupe
    console.log('[generateWhatsAppMessage] Génération pour un groupe');

    const prompt = `
      Générez un message WhatsApp pour un plan de repas hebdomadaire destiné à un groupe familial.
      Le ton doit être :
      - Amical, inclusif et engageant, adapté à une audience mixte (adultes et enfants).
      - Utilisez des emojis pour rendre le message chaleureux et visuel (par exemple 🍽️, 😊, 📅).
      Le message doit inclure :
      - Une salutation générique (e.g., "Bonjour la famille !").
      - Une introduction expliquant que c'est le planning des repas de la semaine.
      - Le plan de repas structuré par jour et type de repas (petit-déjeuner, déjeuner, dîner).
      - Une conclusion encourageante invitant à profiter des repas ensemble.
      Voici le plan de repas pour référence :
      ${mealPlanSummaryForGemini}

      Retournez uniquement le texte du message (pas de HTML, sans \`\`\`).
    `;

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(prompt);
      let message = result.response.text().trim();

      // Append meal plan in a clean text format
      message += `\n\n📅 *Planning des repas de la semaine* 😊\n`;
      daysOfWeek.forEach(day => {
        message += `\n*${day}*:\n`;
        mealTypes.forEach(mealType => {
          const dishName = detailedMealPlan[day]?.[mealType]?.name || 'Non planifié';
          message += `  - ${mealType}: ${dishName}\n`;
        });
      });
      message += `\nBon appétit à tous et bonne semaine en famille ! 🍽️✨`;
      return message;
    } catch (error) {
      console.error('Erreur Gemini pour le message de groupe:', error.stack);
      let fallbackMessage = `Bonjour la famille ! 😊\n\nVoici le planning des repas de la semaine :\n`;
      daysOfWeek.forEach(day => {
        fallbackMessage += `\n${day}:\n`;
        mealTypes.forEach(mealType => {
          const dishName = detailedMealPlan[day]?.[mealType]?.name || 'Non planifié';
          fallbackMessage += `  - ${mealType}: ${dishName}\n`;
        });
      });
      fallbackMessage += `\nBon appétit à tous !`;
      return fallbackMessage;
    }
  } else {
    // Message personnalisé pour un membre
    console.log(`[generateWhatsAppMessage] Génération pour ${member.fullName || member.email}`);

    let tone = 'professionnel';
    let greeting = `Bonjour ${member.fullName || 'Utilisateur'},`;
    let emojis = '😋';
    if (member.age < 12) {
      tone = 'ludique';
      greeting = `Salut ${member.fullName || 'Utilisateur'} 😊`;
      emojis = '🌟🍽️';
    } else if (member.age >= 12 && member.age < 18) {
      tone = 'décontracté';
      greeting = `Hey ${member.fullName || 'Utilisateur'} 👋`;
      emojis = '😎👍';
    }

    const prompt = `
      Générez un message WhatsApp pour un plan de repas hebdomadaire destiné à ${member.fullName || 'un utilisateur'}, une personne de ${member.age || 'âge inconnu'} ans (${member.gender || 'genre inconnu'}).
      Adaptez le ton :
      - Enfant (< 12 ans) : ludique, simple, avec beaucoup d'emojis amusants et mignons.
      - Adolescent (12-17 ans) : décontracté, motivant, avec quelques emojis.
      - Adulte (≥ 18 ans) : professionnel, informatif, sans emojis inutiles.
      Le message doit inclure :
      - Une salutation personnalisée adressée à la personne.
      - Une introduction explicite le plan de la nourriture.
      - Le plan de repas structuré par jour (jours et repas).
      - Une conclusion encourageante.
      - Utilisez des emojis pour les enfants et adolescents, adaptés au ton.
      Voici le plan de repas pour référence :
      ${mealPlanSummaryForGemini}

      Retournez uniquement le texte du message (pas de HTML, pas de \`\`\`).
    `;

    try {
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      const result = await model.generateContent(prompt);
      let message = result.response.text().trim();

      // Append meal plan in a clean text format
      message += `\n\n📅 *Plan de repas de la semaine* ${emojis}\n`;
      daysOfWeek.forEach(day => {
        message += `\n*${day}*:\n`;
        mealTypes.forEach(mealType => {
          const dishName = detailedMealPlan[day]?.[mealType]?.name || 'Non planifié';
          message += `  - ${mealType}: ${dishName}\n`;
        });
      });
      message += `\n${tone === 'ludique' ? 'Régale-toi, petit chef ! 🥐✨' : tone === 'décontracté' ?
        'Bon appétit, éclate-toi ! 😋' : 'Bon appétit et bonne semaine !'}`;
      return message;
    } catch (error) {
      console.error(`Erreur Gemini pour ${member.fullName || 'utilisateur'}:`, error.stack);
      let fallbackMessage = `${greeting}\n\nVoici ton plan de repas pour la semaine :\n`;
      daysOfWeek.forEach(day => {
        fallbackMessage += `\n${day}:\n`;
        mealTypes.forEach(mealType => {
          const dishName = detailedMealPlan[day]?.[mealType]?.name || 'Non planifié';
          fallbackMessage += `  - ${mealType}: ${dishName}\n`;
        });
      });
      fallbackMessage += `\nBon appétit et bonne semaine !`;
      return fallbackMessage;
    }
  }
}

// Send meal plan emails
app.post('/send-meal-plan-emails', async (req, res) => {
  console.log('Requête /send-meal-plan-emails reçue');
  const { userId, members, mealPlan } = req.body;

  if (!userId || !Array.isArray(members) || !mealPlan || typeof mealPlan !== 'object') {
    console.error('Données invalides:', { userId, members, mealPlan });
    return res.status(400).json({ error: 'Données manquantes ou invalides.' });
  }

  try {
    const validMembers = members.filter(member =>
      member.email &&
      typeof member.email === 'string' &&
      member.fullName &&
      typeof member.age === 'number' &&
      member.age >= 5 &&
      member.gender
    );

    if (validMembers.length === 0) {
      console.warn('Aucun membre valide pour l\'envoi d\'emails.');
      return res.status(400).json({ error: 'Aucun membre valide avec email et âge ≥ 5 ans.' });
    }

    for (const member of validMembers) {
      console.log(`Génération de contenu pour ${member.email}`);
      const emailContent = await generateEmailContent(member, mealPlan);
      const mailOptions = {
        from: process.env.GMAIL_EMAIL,
        to: member.email,
        subject: `Votre Plan de Repas Hebdomadaire, ${member.fullName} !`,
        html: emailContent,
      };
      console.log(`Envoi d'email à ${member.email}`);
      await transporter.sendMail(mailOptions);
      console.log(`Email envoyé à ${member.email}`);
    }

    return res.status(200).json({ message: 'Emails envoyés avec succès.' });
  } catch (error) {
    console.error('Erreur lors de l\'envoi des emails:', error.stack);
    return res.status(500).json({ error: 'Erreur lors de l\'envoi des emails.' });
  }
});

// Generate WhatsApp message endpoint
app.post('/generate-whatsapp-message', async (req, res) => {
  console.log('Requête /generate-whatsapp-message reçue');
  const { userId, member, mealPlan } = req.body;

  if (!userId || !mealPlan || typeof mealPlan !== 'object') {
    console.error('Données invalides:', { userId, member, mealPlan });
    return res.status(400).json({ error: 'Données manquantes ou invalides.' });
  }

  try {
    const message = await generateWhatsAppMessage({ member, detailedMealPlan: mealPlan });
    return res.status(200).json({ message });
  } catch (error) {
    console.error('Erreur lors de la génération du message WhatsApp:', error.stack);
    return res.status(500).json({ error: 'Erreur lors de la génération du message.' });
  }
});

// Chatbot endpoint
app.post('/chatbot', async (req, res) => {
  console.log('Requête /chatbot reçue');
  const { userId, appId, prompt, conversationHistory } = req.body;

  if (!userId || !appId || !prompt) {
    console.error('Données invalides:', { userId, appId, prompt });
    return res.status(400).json({ error: 'Données manquantes ou invalides.' });
  }

  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    let dataSummary = '';
    let responseFormat = 'text';
    let imageUrl = null;
    let specificDataRequested = false; // Indicateur si des données spécifiques ont été demandées

    // Convertir le prompt en minuscules pour une comparaison insensible à la casse
    const lowerPrompt = prompt.toLowerCase();

    // Fonction utilitaire pour récupérer des données d'une collection
    const fetchData = async (collectionName) => {
      const q = query(collection(db, `artifacts/${appId}/users/${userId}/${collectionName}`));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    };

    // --- Récupération globale des données pour un contexte riche ---
    const stockItems = await fetchData('stock');
    const shoppingItems = await fetchData('shoppingList');
    const profiles = await fetchData('profiles');
    const recipes = await fetchData('recipes');
    const mealPlans = await fetchData('mealPlans');

    // --- Préparation des données pour Gemini ---
    const formattedData = {
      stock: stockItems,
      shoppingList: shoppingItems,
      profiles: profiles,
      recipes: recipes,
      mealPlans: mealPlans,
    };

    // Construction du summary pour Gemini
    dataSummary += `
    Informations disponibles pour l'utilisateur (à utiliser pour répondre à la question) :
    
    --- Détails du Stock (${stockItems.length} éléments) ---
    ${stockItems.length === 0 ? 'Aucun élément en stock.' : stockItems.map(item => `- ${item.name}: ${item.quantity} ${item.unit}` + (item.expirationDate ? ` (expire le ${new Date(item.expirationDate).toLocaleDateString('fr-FR')})` : '')).join('\n')}
    
    --- Liste de courses (${shoppingItems.length} éléments) ---
    ${shoppingItems.length === 0 ? 'Aucun élément dans la liste de courses.' : shoppingItems.map(item => `- ${item.name}: ${item.quantity} ${item.unit}`).join('\n')}
    
    --- Membres de la famille (${profiles.length} profils) ---
    ${profiles.length === 0 ? 'Aucun membre de la famille enregistré.' : profiles.map(profile => {
      const medicalHistory = profile.medicalHistory?.length ? profile.medicalHistory.join(', ') : 'Aucun antécédent médical connu.';
      const otherMedicalHistory = profile.otherMedicalHistory ? `, autres: ${profile.otherMedicalHistory}` : '';
      return `- Nom: ${profile.fullName}, Âge: ${profile.age} ans, Sexe: ${profile.gender}, Rôle: ${profile.role.join(', ')}, Antécédents médicaux/restrictions: ${medicalHistory}${otherMedicalHistory}`;
    }).join('\n')}
    
    --- Plats / Recettes privées (${recipes.length} recettes) ---
    ${recipes.length === 0 ? 'Aucune recette privée enregistrée.' : recipes.map(recipe => {
      const ingredients = recipe.ingredients.map(ing => `${ing.name} (${ing.quantity} ${ing.unit})`).join(', ');
      const steps = recipe.steps?.length ? recipe.steps.map((step, index) => `${index + 1}. ${step}`).join('\n') : 'Pas d\'étapes détaillées.';
      return `
      - Nom du plat: ${recipe.name}
        Description: ${recipe.description || 'N/A'}
        Ingrédients: ${ingredients}
        Temps de préparation: ${recipe.preparationTime || 'N/A'}
        Temps de cuisson: ${recipe.cookingTime || 'N/A'}
        Portions: ${recipe.servings || 'N/A'}
        Catégorie: ${recipe.category || 'N/A'}
        Étapes: ${steps}
        ${recipe.image ? `Image URL: ${recipe.image}` : ''}
      `;
    }).join('\n')}
    
    --- Planning des repas (${mealPlans.length} jours planifiés) ---
    ${mealPlans.length === 0 ? 'Aucun plat configuré dans le planning.' : mealPlans.map(plan => {
      const date = new Date(plan.id); // Assuming id is a date string
      const breakfast = plan.breakfast?.name || 'Non planifié';
      const lunch = plan.lunch?.name || 'Non planifié';
      const dinner = plan.dinner?.name || 'Non planifié';
      return `- Date: ${date.toLocaleDateString('fr-FR')}, Petit-déjeuner: ${breakfast}, Déjeuner: ${lunch}, Dîner: ${dinner}`;
    }).join('\n')}
    `;

    // --- Détection des intentions et ajustement du prompt ---
    let intentPromptModifier = '';
    let relevantProfiles = [];
    let relevantRecipes = [];
    let medicalRestrictions = [];
    let namesMentioned = [];

    // Tente de trouver les noms des membres de la famille dans le prompt
    profiles.forEach(profile => {
      if (lowerPrompt.includes(profile.fullName.toLowerCase()) || (profile.otherNames && lowerPrompt.includes(profile.otherNames.toLowerCase()))) {
        namesMentioned.push(profile.fullName);
        relevantProfiles.push(profile);
      }
    });

    if (namesMentioned.length > 0) {
      specificDataRequested = true;
      intentPromptModifier += `L'utilisateur s'intéresse aux informations concernant : ${namesMentioned.join(', ')}.`;
      // Collecter les antécédents médicaux de tous les membres mentionnés
      relevantProfiles.forEach(profile => {
        if (profile.medicalHistory && profile.medicalHistory.length > 0) {
          medicalRestrictions = medicalRestrictions.concat(profile.medicalHistory);
        }
        if (profile.otherMedicalHistory) {
          medicalRestrictions.push(profile.otherMedicalHistory);
        }
      });
      medicalRestrictions = [...new Set(medicalRestrictions)]; // Supprimer les doublons
      if (medicalRestrictions.length > 0) {
        intentPromptModifier += ` Leurs antécédents médicaux/restrictions comprennent : ${medicalRestrictions.join(', ')}.`;
      }
    }

    if (lowerPrompt.includes('stock')) {
      specificDataRequested = true;
      intentPromptModifier += ` L'utilisateur demande des informations sur le stock.`;
    }

    if (lowerPrompt.includes('liste de courses') || lowerPrompt.includes('shopping list')) {
      specificDataRequested = true;
      intentPromptModifier += ` L'utilisateur demande des informations sur la liste de courses.`;
    }

    if (lowerPrompt.includes('antécédents médicaux') || lowerPrompt.includes('santé') || lowerPrompt.includes('restrictions')) {
      specificDataRequested = true;
      if (relevantProfiles.length === 0) { // Si pas de noms mentionnés mais demande d'antécédents
        intentPromptModifier += ` L'utilisateur demande des informations sur les antécédents médicaux des membres de la famille.`;
        profiles.forEach(profile => {
          if (profile.medicalHistory && profile.medicalHistory.length > 0) {
            medicalRestrictions = medicalRestrictions.concat(profile.medicalHistory);
          }
          if (profile.otherMedicalHistory) {
            medicalRestrictions.push(profile.otherMedicalHistory);
          }
        });
        medicalRestrictions = [...new Set(medicalRestrictions)];
      }
    }

    if (lowerPrompt.includes('plats') || lowerPrompt.includes('recettes') || lowerPrompt.includes('repas')) {
      specificDataRequested = true;
      intentPromptModifier += ` L'utilisateur demande des informations sur les plats/recettes.`;

      if (lowerPrompt.includes('conseillerais tu') || lowerPrompt.includes('suggérerais tu')) {
        intentPromptModifier += ` L'utilisateur cherche des recommandations de plats.`;

        // Filtrer les recettes en fonction des antécédents médicaux détectés
        relevantRecipes = recipes.filter(recipe => {
          // Si aucune restriction n'est présente, toutes les recettes sont compatibles
          if (medicalRestrictions.length === 0) return true;

          // Vérifier si la recette est compatible avec toutes les restrictions
          return !medicalRestrictions.some(restriction => {
            const lowerRestriction = restriction.toLowerCase();
            const lowerRecipeName = recipe.name.toLowerCase();
            const lowerRecipeIngredients = recipe.ingredients.map(ing => ing.name.toLowerCase()).join(' ');

            // Logique de compatibilité (à étendre selon vos besoins)
            if (lowerRestriction.includes('végétarien') && (lowerRecipeName.includes('viande') || lowerRecipeName.includes('poulet') || lowerRecipeName.includes('bœuf') || lowerRecipeName.includes('porc') || lowerRecipeName.includes('poisson') || lowerRecipeIngredients.includes('viande') || lowerRecipeIngredients.includes('poulet') || lowerRecipeIngredients.includes('bœuf') || lowerRecipeIngredients.includes('porc') || lowerRecipeIngredients.includes('poisson'))) {
              return true; // La recette est incompatible
            }
            if (lowerRestriction.includes('diabète') && (lowerRecipeName.includes('sucre') || lowerRecipeIngredients.includes('sucre') || lowerRecipeIngredients.includes('miel') || lowerRecipeIngredients.includes('sirop'))) {
              return true; // La recette est incompatible
            }
            return false;
          });
        });

        // Si des recettes spécifiques sont demandées (par exemple, "montre-moi une recette")
        if (lowerPrompt.includes('détails') || lowerPrompt.includes('montre-moi une recette') || lowerPrompt.includes('une recette aléatoire')) {
          if (relevantRecipes.length > 0) {
            const randomRecipe = relevantRecipes[Math.floor(Math.random() * relevantRecipes.length)];
            dataSummary = `Voici une recette de votre collection privée compatible avec les restrictions :
            Nom du plat: ${randomRecipe.name}
            Description: ${randomRecipe.description || 'N/A'}
            Ingrédients: ${randomRecipe.ingredients.map(ing => `${ing.name} (${ing.quantity} ${ing.unit})`).join(', ')}
            Temps de préparation: ${randomRecipe.preparationTime || 'N/A'}
            Temps de cuisson: ${randomRecipe.cookingTime || 'N/A'}
            Portions: ${randomRecipe.servings || 'N/A'}
            Catégorie: ${randomRecipe.category || 'N/A'}
            Étapes: ${randomRecipe.steps?.length ? randomRecipe.steps.map((step, index) => `${index + 1}. ${step}`).join('\n') : 'Pas d\'étapes détaillées.'}
            `;
            if (randomRecipe.image) {
              imageUrl = randomRecipe.image;
              responseFormat = 'recipe';
            }
          } else {
            dataSummary = `Aucune recette compatible trouvée dans votre collection privée avec les restrictions spécifiées (${medicalRestrictions.join(', ')}).`;
          }
        } else {
          // Pour les requêtes de conseil plus générales
          dataSummary += `\nRecettes compatibles avec les antécédents médicaux/restrictions de ${namesMentioned.join(', ')} (${medicalRestrictions.join(', ')}) :
          ${relevantRecipes.length === 0 ? 'Aucune recette compatible trouvée.' : relevantRecipes.map(recipe => `- ${recipe.name}`).join('\n')}
          `;
        }
      }
    }

    if (lowerPrompt.includes('planning') || lowerPrompt.includes('plan de repas') || lowerPrompt.includes('menu')) {
      specificDataRequested = true;
      intentPromptModifier += ` L'utilisateur demande des informations sur le planning des repas.`;
    }

    // Si aucune intention spécifique n'a été détectée mais que des noms ont été mentionnés
    if (!specificDataRequested && namesMentioned.length > 0) {
      intentPromptModifier += ` La question semble concerner les membres de la famille mentionnés (${namesMentioned.join(', ')}).`;
    }

    // Prompt pour Gemini
    const geminiPrompt = `
      Tu es un assistant culinaire intelligent et serviable pour l'application MealBloom, conçu pour aider les utilisateurs à gérer leur planification de repas familiale.
      Réponds en français avec un ton amical, clair, concis et engageant.
      Utilise des emojis si approprié (ex. 😋 pour la nourriture, 🛒 pour les courses, 👨‍👩‍👧‍👦 pour la famille, 🏥 pour la santé).
      Reformule les données que je te fournis en une réponse naturelle et conviviale, en te basant sur la question de l'utilisateur.

      Instructions spécifiques basées sur la détection d'intention :
      ${intentPromptModifier}
      Si l'utilisateur demande des conseils de plats ou des recommandations, utilise les "Plats / Recettes privées" et les "Membres de la famille" (en particulier leurs antécédents médicaux/restrictions) pour proposer des options adaptées. Ne propose que des plats qui ne contiennent pas les ingrédients ou ne sont pas incompatibles avec les restrictions indiquées. Si aucune restriction n'est mentionnée, tu peux proposer n'importe quel plat. Si aucune recette compatible n'est trouvée, indique-le clairement.
      Si une image est disponible (pour une recette), mentionne qu'elle est affichée.
      Si la question de l'utilisateur est très générale ou ne correspond à aucun mot-clé spécifique, utilise toutes les "informations supplémentaires disponibles" que je te fournis pour donner une réponse utile ou proposer de l'aide sur ces sujets.
      N'invente pas d'informations qui ne sont pas dans les données fournies. Si une information n'est pas disponible ou si tu ne peux pas répondre avec les données actuelles, indique-le clairement et poliment, et propose d'autres aides.

      Données complètes disponibles pour l'utilisateur :
      ${dataSummary}

      Question de l'utilisateur : ${prompt}

      Historique de la conversation (pour le contexte) :
      ${(conversationHistory || []).map(msg => `${msg.user ? 'Utilisateur: ' + msg.user : 'Assistant: ' + msg.bot}`).join('\n')}

      Réponse :
    `;
    const result = await model.generateContent(geminiPrompt);
    const message = result.response.text();

    return res.status(200).json({ message, format: responseFormat, imageUrl });
  } catch (error) {
    console.error('Erreur lors du traitement du prompt:', error.stack);
    return res.status(500).json({ error: 'Erreur lors du traitement du prompt.' });
  }
});

// Route pour la génération d'étapes de préparation
app.post('/generate-recipe-steps', async (req, res) => {
  try {
    const { recipeName, ingredients, description } = req.body;

    const prompt = `
      Générez des étapes de préparation détaillées pour la recette suivante :
      Nom : ${recipeName}
      Description : ${description}
      Ingrédients :
      ${ingredients.map(ing => `- ${ing.quantity} ${ing.unit} de ${ing.name}`).join('\n')}

      Format de réponse souhaité :
      1. Étape 1
      2. Étape 2
      etc.

      Les étapes doivent être :
      - Claires et précises
      - Dans un ordre logique
      - Inclure les temps de cuisson si nécessaire
      - Mentionner les températures si nécessaire
      - Inclure des conseils utiles pour la réussite de la recette

      Retournez uniquement les étapes numérotées, sans introduction ni conclusion.
    `;

    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent(prompt);
    const steps = result.response.text();

    res.json({ steps });
  } catch (error) {
    console.error('Erreur lors de la génération des étapes:', error);
    res.status(500).json({ error: 'Erreur lors de la génération des étapes de préparation' });
  }
});

// Test routes
app.get('/', (req, res) => {
  res.send('Backend for MealBloom is running!');
});

app.get('/test-email', async (req, res) => {
  try {
    const mailOptions = {
      from: process.env.GMAIL_EMAIL,
      to: process.env.GMAIL_EMAIL,
      subject: 'Test Email from MealBloom',
      text: 'Ceci est un test depuis Nodemailer.',
    };
    await transporter.sendMail(mailOptions);
    console.log('Email de test envoyé');
    res.json({ message: 'Email de test envoyé' });
  } catch (error) {
    console.error('Erreur test email:', error.stack);
    return res.status(500).json({ error: error.message });
  }
});

app.get('/test-gemini', async (req, res) => {
  try {
    const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
    const result = await model.generateContent('Test de l\'API Gemini.');
    console.log('Réponse Gemini:', result.response.text());
    res.json({ message: 'Test Gemini réussi', response: result.response.text() });
  } catch (error) {
    console.error('Erreur test Gemini:', error.stack);
    return res.status(500).json({ error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});