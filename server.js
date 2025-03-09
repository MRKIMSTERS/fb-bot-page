const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 3000;

const VERIFY_TOKEN = "lorex";
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

app.use(bodyParser.json());
app.use(express.static("public")); // Serve static files from "public" folder

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

                // Forward to external API
                try {
                    let response = await axios.get(`https://gpt4o.gleeze.com/pagebot?prompt=${encodeURIComponent(userMessage)}&uid=${senderId}`);
                    let botReply = response.data.response;

                    // Send response back to user
                    await sendMessage(senderId, botReply);
                } catch (error) {
                    console.error("Error forwarding message:", error);
                }
            }
        });

        res.status(200).send("EVENT_RECEIVED");
    } else {
        res.status(404).send();
    }
});

// Send message to user
async function sendMessage(senderId, text) {
    let url = `https://graph.facebook.com/v17.0/me/messages?access_token=${PAGE_ACCESS_TOKEN}`;
    
    let messageData = {
        recipient: { id: senderId },
        message: { text: text },
    };

    await axios.post(url, messageData).catch((error) => console.error("Error sending message:", error.response.data));
}

// Serve the HTML file for uptime monitoring
app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));