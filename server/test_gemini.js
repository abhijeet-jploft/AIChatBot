require('dotenv').config(); const {sendMessage}=require('./services/geminiService'); sendMessage('c1', [{role:'user',content:'Hi'}]).then(console.log).catch(console.error);
