// test-google-login.js

const axios = require('axios');
const { OAuth2Client } = require('google-auth-library');

const CLIENT_ID = '661327745032-anho5bt9m8bneq164tooi9g2bdj4nc2c.apps.googleusercontent.com';
const CLIENT_SECRET = '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';
const REDIRECT_URI = 'http://localhost:3000/api/v1/auth/google/callback';

async function testGoogleLogin() {
  console.log('🔐 Test Google Login\n');

  // 1. Obtenir le code d'autorisation (manuel)
  console.log('📋 Étape 1: Ouvre cette URL dans ton navigateur:\n');
  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&response_type=code&scope=email%20profile&access_type=offline`;
  console.log(authUrl);
  console.log('\n👆 Connecte-toi et copie le "code" de l\'URL de callback\n');

  // 2. Demander le code (simulation)
  const readline = require('readline').createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  readline.question('Colle le code ici: ', async (code) => {
    readline.close();

    try {
      // 3. Échanger le code contre des tokens
      const tokenResponse = await axios.post('https://oauth2.googleapis.com/token', {
        code,
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        redirect_uri: REDIRECT_URI,
        grant_type: 'authorization_code',
      });

      const { id_token } = tokenResponse.data;

      console.log('\n✅ ID Token obtenu!\n');
      console.log('ID Token:', id_token.substring(0, 50) + '...\n');

      // 4. Tester l'endpoint backend
      console.log('🧪 Test de l\'endpoint backend...\n');

      const loginResponse = await axios.post('http://localhost:3000/api/v1/auth/google', {
        idToken: id_token,
      });

      console.log('✅ Connexion réussie!\n');
      console.log('User:', JSON.stringify(loginResponse.data.user, null, 2));
      console.log('\nJWT Token:', loginResponse.data.access_token.substring(0, 50) + '...');
    } catch (error) {
      console.error('❌ Erreur:', error.response?.data || error.message);
    }
  });
}

testGoogleLogin();