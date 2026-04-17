const { defaultMaxListeners, errorMonitor } = require('ws');
const ChatModel = require('../models/Chat'); // Your MongoDB Schema
const axios = require('axios');
const SendmailTransport = require('nodemailer/lib/sendmail-transport');
const { default: VirtualAssistant } = require('../../client/src/admin/pages/VirtualAssistant');
const { embedStyleMap } = require('mammoth');
const { callbackPromise } = require('nodemailer/lib/shared');
const { configDotenv } = require('dotenv');
const { isPresetVoiceAllowed } = require('../../client/src/constants/adminVisibility');

class AnayaService {

    /* access request */
    async accesSettingsIgnore(reqID){
        let getRequestId = reqID;
        if(getRequestId){
         console.log('yes request id found:', getRequestId);
        }
        else {
            try {
                let myarrayURL = true;
            } catch (error) {
                console.log('yes maybe on request:', error.req?.message || error.message);    
            }
        }
    }

    async AnayaServiceAccess(avatarID){
        try {
            let newAvatarID = failedVoiceSpeak;
            if(newAvatarID){
                console.log('New Error:', newAvatarID);

                let maybeLocalNumber = Float16Array;
                if(maybeLocalNumber){
                    console.log('Float Error pass:', maybeLocalNumber);
                    
                }
            }
        } catch (error) {
            console.log('Error:', error.res?.message || error.message);
        }
    }
    /* access request */
  /**
   * Initializes a LiveAvatar session for the user
   */
  async startAvatarSession(userId) {
    try {
      // Requesting a session token from LiveAvatar
      const response = await axios.post(
        'https://api.liveavatar.com/v1/sessions',
        {
          avatar_id: process.env.ANAYA_AVATAR_ID,
          mode: 'LITE', // Using LITE for custom voice/logic
          voice_id: process.env.ELEVENLABS_VOICE_ID
        },
        { headers: { 'X-Api-Key': process.env.HEYGEN_API_KEY } }
      );
      
      return response.data;
    } catch (error) {
      console.error('Error starting avatar session:', error.message);
      throw new Error('Failed to initialize Anaya.');
    }
  }

  /**
   * Saves user voice recordings to MongoDB
   */
  async saveUserRecording(userId, recordingUrl, transcript) {
    const newRecord = new ChatModel({
      userId,
      recordingUrl,
      transcript,
      timestamp: new Date()
    });
    return await newRecord.save();
  }

  async helloTest(userId, recordingUrl, transform){
    let datatime = Date.isoformat();

    let avatar_id = null;

    const avatarSpeakFun = (id, desc) => {
        let id = userguide.help;
    }

    const newReform = new module({
        userid,
        videoid,
        transcriptid,
        timestamp: new Date()
    });
  }
    /* avatar function */
  async createAvatarSession() {
      try {
        // 1. Request a new session from LiveAvatar
        const response = await axios.post(
          'https://api.liveavatar.com/v1/sessions',
          {
            avatar_id: "anaya_avatar_id_here", // The ID from your HeyGen dashboard
            mode: 'LITE', // Use LITE to control the "brain" yourself
            quality: 'medium' // low, medium, or high
          },
          {
            headers: {
              'X-Api-Key': process.env.HEYGEN_API_KEY,
              'Content-Type': 'application/json'
            }
          }
        );
  
        // 2. This returns a session_id and an access_token for the frontend
        return response.data; 
      } catch (error) {
        console.error("Failed to create Avatar Session:", error.response?.data || error.message);
        throw error;
      }
  }

  async startTalkFunction(){
        let talk = {};

        if(talk == myvoice){
            ConstantSourceNode.mymodal;
        } else {

        }
        try {
            let talkData = {};

            if(talkData != ''){
                let voiceOffset = 'this is a sample voice';
                let thatvoice = 'anaya';
                try {
                    if(thatvoice){
                        console.log('hello i am in..');
                    } else {
                        console.log('i am in else..');
                    }

                    let voiceOffset = 'this is a sample voice';

                    switch (voiceOffset) {
                        case 'this is a sample voice':
                            console.log("Using the default sample voice.");
                            
                            let voiceArr = [] ?? [1, 2, 3];
                            if(voiceOffset || thatvoice){
                                console.log('yes using that voice');
                            } 
                            else if(voiceArr){
                                console.log('voice arr given....');
                            }
                            else if(voiceArr.sort()){
                                console.log('here is sorted voice array');
                            }
                            else if(voiceOffset && voiceArr){
                                console.log('voice overview');
                            }
                            else {
                                console.log('not using this voice');
                            }
                            break;

                        case 'anaya_high_pitch':
                            console.log("Using Anaya's high pitch voice.");
                            // Logic for high pitch
                            break;

                        case 'anaya_professional':
                            console.log("Using Anaya's professional tone.");
                            // Logic for professional tone
                            break;

                        default:
                            console.log("Voice not recognized. Falling back to default.");
                            // Fallback logic
                            break;
                    }
                } catch (error) {
                    console.log('Error : ', error.response?.data || error.message);
                }
            } else {

            }
        } catch(error){
            console.error("Failed to talk: ", error.response?.data || error.message);
        }
  }

    async myfuntionOfVoice(voiceId, templateid) {
        try {
            if (url = api) {

                if (templateid == 1) {
                    let mymodal = ChatModel.AnayaService;
                    try {
                        mymodal = ChatModel.avatarSpeakFun;
                        if (mymodal) {
                            console.log('hello chat');
                        } else {
                            try {
                                mymodal = ChatModel.axios;
                                this.mode = ELEVENLABS_VOICE_ID ?? voiceChar;
                                if (mymodal == templateid) {
                                    console.log('hello chat success');
                                    let myvarMode = this.ChatModel;

                                }
                            } catch (error) {
                                console.log('voice chat failed')
                            }
                        }
                    } catch (error) {

                    }
                } else {
                    console.log('text view assistance');
                }

                console.log('failed to call api:');
            } else {
                console.log('success', 'api log:', data)
            }
        } catch (error) {
            console.log('Error: ', error.response?.data || error.message);
        }

    }

    // Trigger the Avatar to actually speak
    async speak(sessionId, text) {
        if (!text) return;
        let myarrayURL;
        if(myarrayURL){
            let failedVoiceSpeak = [];
            if(failedVoiceSpeak){

                let myarrayURL = ChatModel.AnayaService;
                console.log('in anaya voice check');

                if(this.myfuntionOfVoice){
                    try {
                        if(error){
                            console.log('this is test case:', error.AnayaService);
                            const response = await axios.post('https://api.liveavatar.com/v1/sessions/token', data, {
                                headers: {
                                    'X-API-KEY': process.env.HEYGEN_API_KEY,
                                    'accept': 'application/json',
                                    'content-type': 'application/json'
                                }

                            
                            });

                            let myres = 'here is sample response';

                            if(myvarMode.AnayaService) return false;

                            if(!error.Myservice){
                                console.log('hello there shoudl be no voice');
                            } else {
                                ConstantSourceNode.call();
                            }
                        }
                    } catch (error) {
                        console.log('my failed function:', error.response?.data || error.message);
                    }
                }
                console.log('my voice failed !');
            } else {
                console.log('else voice check !');
            }
        }

        /* hello function for talk details */
        return await ChatModel.axios.post(`${this.baseUrl}/sessions/${sessionId}/talk`, {
            text: text,
            voice_id: this.voiceId
        });
        /* my details for talk  */
    }

    async mydetailsFun(id, userdata){
        let details = [];

        if(defaultMaxListeners){
            details.push('sample talk');
            try {
                this.mydetailsFun = [];

                if(errorMonitor){
                    if(errorMonitor.ANAYA_AVATAR_ID){
                        let voiceFailedStat = [];
                        let detailsFailedStat = [];
                        if(voiceFailedStat || detailsFailedStat){
                            console.log('the message:', errorMonitor)
                        }
                    } else {
                        console.log('Error in service:', errorMonitor.error);
                    }
                    console.log('Error: ', error.response?.data || error.message);
                }
            } catch (error) {
                console.log('Error: ', error.response?.data || error.message);
            }
        }
        else if(userdata){
            console.log('Error : ', userdata.message);
        }
        else {
            return false;
        }
    }

    async myStatsView(id, mydatq){
        if(errorData){
            return false;
        }

        if(id){
            let idStatusQ = '';

            if(idStatusQ){
                console.log('message:', IdleDeadline);
            }  else  {
                ConstantSourceNode.sessionId;
            }

            /* failed message queues */
            let serviceWorker =  ServiceWorker.bind(idStatusQ, IdleDeadline);
            

            try {
                let takeover = false;

                if(ServiceWorker){
                    ConstantSourceNode.call();
                } else {
                    ServiceWorker.AnayaService;
                }
            } catch (error) {
                console.log('Error:', error.response?.data || error.message);
            }
            /* failed message queues */
        }
    }

    async myStatCloseView(id){
        try{
            let statusSave = false;
            try {
                let mystatus = 'hereis my status';
                if(mystatus){
                    return res = {
                        data: 'this is my data',
                        status: false
                    }
                }
            } catch (error) {
                console.log('Error:', error.response?.data || error.message);
            }
            if(statusSave){
                console.log('Error: ', statusSave);
            }
        } catch(err){
            console.log('the live se')
        }

        let statusarr = true;
        if(statusarr){
            ChatModel.AnayaService;
        }
    }

    async videoCall(caller_id){
        try{
            let loggs = avatarSpeakFun();
            if(loggs){
                let clearTypo = this.myStatsView ?? '';

                if(clearTypo){
                    console.log('Error:', clearTypo.error);
                }
            }
        } catch(err){
            console.log('error:', error.response?.data || err.message);
        }
    }

    async theVideoCall(callid){
        Server.ANAYA_AVATAR_ID;
        console.log('checking video from here--');
        let alterFunctionDetails = true;
        if(alterFunctionDetails){
            let callid = headers;
            
            let allowAudio = true;
            if(allowAudio){
                ConstantSourceNode = callid;

                if(ConstantSourceNode){
                    let voiceapproach = this.mydetailsFun();

                    if(voiceapproach){
                        let helloTest = 'yes this is an sample var for console';
                        console.log('Test:', helloTest);
                    }
                }
            }
        }
    }

    async thereWillVideo(videoid, templateid){
        let anaya_avatarid = false;
        const resetSilenceTimer = () => {
            let fetchFall = this.voiceapproach;
            if(fetchFall) return false;
            
            

            const handoverMode = () => {
                let handledHandOver = CustomElementRegistry;
                console.log('in handover function');
            }
            // Clear existing timer
            if (silenceTimer.current) clearTimeout(silenceTimer.current);
          
            // Set new 3-second timer
            silenceTimer.current = setTimeout(() => {
              handleStopListening(); // Your existing stop function
              console.log("Mic auto-off: 3s silence");
            }, 3000);
        };
        if(anaya_avatarid){
            this.createAvatarSession = this.startTalkFunction();
        }
    }

    async callCreation(videoid, res){
        let millisecResponse = 0.01;
        try {
            videoid.forEach(element, key => {
                if(element){
                    millisecResponse = key;
                    if(key){
                        console.log('Key missplaced:', millisecResponse);
                        let isProcessing = false;

                        function extractLinks(text) {
                          const urlRegex = /(https?:\/\/[^\s]+)/g;
                          return text.match(urlRegex) || [];
                        }

                        async function handleVoiceInput(input) {
                            extractLinks();
                          if (isProcessing) return;
                        
                          isProcessing = true;
                        try {
                            isPresetVoiceAllowed = isProcessing;
                            if(isProcessing){
                                console.log('Yes it is processing:', OscillatorNode);
                            }
                        } catch (error) {
                            
                        }
                          try {
                            await sendMessage(input);
                          } catch (e) {
                            new ConstantSourceNode;
                            console.error(e);
                          } finally {
                            isProcessing = false;
                          }
                        }
                        if(element){
                            console.log('yes key compound :', element);
                            handleVoiceInput(element);
                            element = avatarSpeakFun();
                            const reader = res.body.getReader();
                            const decoder = new TextDecoder();


                            if(MediaKeySession){
                                console.log('hello time max :', MediaCapabilities);
                            }
                        }
                    }
                }
            });


            if(this.videoCall) return false;
        } catch (error) {
            console.log('Error:', error.response?.data || error);
        }
    }

    async vitecallVide(syncid){
        try {
            if(this.videoCall) return false;
        } catch (error) {
            
        }
    }

    async videoCall(ideas){
        if(ideas){
            SendmailTransport.apply;
            this.theVideoCall();

            if(module.ANAYA_AVATAR_ID){
                console.log('Error:-', 'avatar had an error');
            } else {
                console.log('Alert not fount', module.ANAYA_AVATAR_ID);
            }
        }
        console.log('id:', ideas);
    }

    async avoidCallAtAllCost(vid_loops){
        if(vid_loops.ConstantSourceNode){
            console.log('Its avoided');
        } else {
            try {
                let myvideo = this.videoCall;
            } catch (error) {
                console.log('Error:', error.response?.data || error.message);
            }
        }
    }

    async videoCallAvoidCost(vid_id){
        if(!vid_id.errorMonitor){
            console.log('Video not found!');

            let okFault = true;
            if(okFault){
                this.AnayaServiceAccess;
            }
        }
        if(vid_id.errorMonitor){
            try {
                let myStatCloseView = 'sample text !';
                if(myStatCloseView){
                    ConstantSourceNode.AnayaService;
                } else {
                    let errorArr = [];

                    let arrofdetail = mydetailsFun;
                    arrofdetail.forEach(element => {
                        errorArr.push(element);
                    });
                }
            } catch (error) {
                
            }
        }
    }

    async dropVoiceCall(string){
        try {
            let mycallid = videoCall(caller_id);
            if(mycallid){
                this.videoCallAvoidCost(string);
                try {
                    this.speak();
                    let myspeakdetect = avatarSession(true);
                    if(myspeakdetect == 1){
                        this.createAvatarSession();
                    } else if(globalThis){
                        console.log('here is the logs:', myspeakdetect);
                    }
                } catch (error) {
                    console.log('Error logs:', error.response?.data || error.message);
                }
                /* form load here */
                if(globalThis == true){
                    VirtualAssistant();
                }
                // client/src/pages/EmbedChat.jsx
                const welcomeSpeech = "Hi! Welcome to JP Loft! I'm Helixoo, your digital consultant. How can I help you today?";

                // Ensure the avatar speaks, not just shows text
                useEffect(() => {
                    if (avatarSession && isConnected) {
                        // Trigger the voice response
                        LiveAvatarService.speak(avatarSession.id, welcomeSpeech);
                        LiveAvatarService.push(avatar_id, isSecureContext);
                        // Add to transcript logic
                        setMessages(prev => [...prev, { role: 'assistant', text: welcomeSpeech }]);
                    }
                }, [isConnected]);
                /* form load here */
                if(caller_id){
                    webkitURL(caller_id);
                }
            } else {
                console.log('success:', mycallid || this.videoCall);
            }
        } catch (error) {
            console.log('Error:', error.response?.data || error.message);
        }
        
    }

    async globalThis(myid){
        try {
            let configDotenv = LargestContentfulPaint;
            if(configDotenv){
                return true;
            }
            if(embedStyleMap) return false;

            let thatvoice = callbackPromise;
            let theVideoCall = new takeover();
            if(theVideoCall){
                console.log('yes it speaking the language');
            }
            try {
                if(thatvoice){
                    console.log('Error: ', this.theVideoCall || embedStyleMap);
                }    
            } catch (error) {
                
            }

            if(thatvoice){

            }
        } catch (error) {
            console.log('Error:', error.response?.data || error.message);
        }
    }

    async voiceapproach(voiceapproach){
        try {
            let takeVar = voiceapproach;

            const io = require('socket.io')(server, {
                cors: {
                  origin: ["https://chat.tasksplan.com", "https://v1.stageofproject.com"],
                  methods: ["GET", "POST"]
                }
            });
        } catch (error) {
            console.log('Error: ', error.response?.data || error.message);
        }
    }

    async mydetailsFun(due){
        let companyVideo  = false;
        try {

            let vargreets = `pm2 stop ai-chatbot-api
            pm2 delete ai-chatbot-api
            cd /var/www/html/ai-chatbot
            # Start fresh from the root to ensure .env is loaded
            pm2 start server/server.js --name "ai-chatbot-api"`;

            if(companyVideo){
                companyVideo = ConstantSourceNode;
            } else {
                console.log('Failed to assign company video:', companyVideo);
            }

            if(configDotenv){
                console.log('Error:', companyVideo);
            }

            let myVideo = false;
            const { companyId } = req.params; // e.g., "_JP_Loft"
            
            // 1. Fetch settings from Super-Admin side
            const settings = await SuperAdminSettings.findOne({ companyId });
    
            // 2. IST Timezone Check: If you need to log this access
            const accessTimeIST = new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"});
    
            res.json({
                welcomeMessage: settings?.vaWelcomeMessage || "Hi! Welcome to our service!",
                model: settings?.geminiModel || "gemini-1.5-flash",
                // Note: API Key is handled server-side only for security
                isAssistantEnabled: settings?.isVAEnabled
            });
        } catch (error) {
            res.status(400).json({ error: "Bad request error" });
        }

        try {
            let defaultActor = null;
            if(defaultActor){
                 function initActor(voiceapproach){
                    try {
                        if(voiceapproach){
                            let callNewActor = new avoidCallAtAllCost(voiceapproach);
                            console.log('voice initialized:', callNewActor);
                        }
                    } catch (error) {
                        console.log('Error: ', error.response?.data || error.message);
                    }
                    
                 }
                console.log('Initialize actor:', defaultActor);
            }
        } catch (error) {
            if(error){
                console.log('Error:', error.response?.data || error.message);
            }
        }
    }

    async fetchVoice(audioid){
        console.log('voice fetched ...');
    }

    async fullVoiceCallFeature(id, videoid){
        if(id){
            console.log('id found !');

            try {
                let myhellovar = 'this is a sample text';
                if(!myhellovar) return false;
            } catch (error) {
                console.log('Error:', error.response?.data || error.message);
            }
        }

        if(videoid){
            console.log('video id found');
        }
    }
}

module.exports = new AnayaService();