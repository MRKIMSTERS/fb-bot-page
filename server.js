const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const VERIFY_TOKEN = "lorex";
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const AUTOCASS_URL = process.env.AUTOCASS || "https://cassidynica.onrender.com";
const PREF = "!";

// Store autocass status for each sender (similar to threadID mapping)
const mappings = new Map();

app.use(bodyParser.json());
app.use(express.static("public"));

// Webhook verification
app.get("/webhook", (req, res) => {
    let mode = req.query["hub.mode"];
    let token = req.query["hub.verify_token"];
    let challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("Webhook verified successfully.");
        res.status(200).send(challenge);
    } else {
        res.status(403).send("Verification failed.");
    }
});

// Handle messages
app.post("/webhook", async (req, res) => {
    let body = req.body;

    if (body.object === "page") {
        body.entry.forEach(async (entry) => {
            let event = entry.messaging[0];
            let senderId = event.sender.id;

            if (event.message && event.message.text) {
                let userMessage = event.message.text;

                // Handle autocass toggle command
                if (userMessage.startsWith(`${PREF}autocass`)) {
                    const args = userMessage.split(" ");
                    let choice = args[1] === "on" 
                        ? true 
                        : args[1] === "off" 
                        ? false 
                        : mappings.get(senderId) 
                        ? !mappings.get(senderId) 
                        : true;
                    
                    mappings.set(senderId, choice);
                    await sendMessage(senderId, `✅ ${choice ? "Enabled" : "Disabled"} successfully!`);
                }
                // Process message if autocass is enabled
                else if (mappings.get(senderId)) {
                    await processAutocass(senderId, userMessage);
                }
            }
        });

        res.status(200).send("EVENT_RECEIVED");
    } else {
        res.status(404).send();
    }
});

// Autocass processing function
async function processAutocass(senderId, message) {
    try {
        const res = await axios.get(`${AUTOCASS_URL}/postWReply`, {
            params: {
                body: message,
                senderID: senderId,
                prefixes: [PREF],
                password: null,
            },
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36",
                "Accept-Language": "en-US,en;q=0.9",
                "Cache-Control": "no-cache",
                Pragma: "no-cache",
                Referer: AUTOCASS_URL,
                Connection: "keep-alive",
                DNT: "1",
                "Sec-Fetch-Dest": "document",
                "Sec-Fetch-Mode": "navigate",
                "Sec-Fetch-Site": "none",
                "Upgrade-Insecure-Requests": "1",
            }
        });

        const { result, status } = res.data;
        
        if (status !== "fail" && result.body) {
            await sendMessage(senderId, result.body);
        }
    } catch (error) {
        console.error("Error in autocass processing:", error);
    }
}

// Send message to user
async function sendMessage(senderId, text) {
    let url = `https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
    
    let messageData = {
        recipient: { id: senderId },
        message: { text: text },
    };

    await axios.post(url, messageData).catch((error) => 
        console.error("Error sending message:", error.response?.data || error)
    );
}

// Serve the HTML file for uptime monitoring
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
