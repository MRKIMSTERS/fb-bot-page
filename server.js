const { execSync } = require("child_process");
const path = require("path");

// Auto-install dependencies
function installDependencies() {
  console.log("Checking and installing dependencies...");
  const nodeModulesPath = path.join(__dirname, "node_modules");

  // Install dependencies if node_modules doesn’t exist
  if (!fs.existsSync(nodeModulesPath)) {
    try {
      console.log("Installing dependencies...");
      execSync("npm install", { stdio: "inherit" });
      console.log("Dependencies installed successfully.");
    } catch (error) {
      console.error("Failed to install dependencies:", error.message);
      process.exit(1);
    }
  } else {
    console.log("Dependencies already installed.");
  }
}

// Run the install check before starting the server
installDependencies();

// Now load the server code
const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const request = require("request");
const fs = require("fs");

const app = express();
const PORT = process.env.PORT || 3000;

const VERIFY_TOKEN = "lorex";
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN || "your-page-access-token-here";
const AUTOCASS_URL = process.env.AUTOCASS || "https://cassredux-production.up.railway.app";
const PREF = "+";

// Initialize APIPage class
const apiPage = new APIPage(PAGE_ACCESS_TOKEN);

app.use(bodyParser.json());
app.use(express.static("public"));

// APIPage class definition
class APIPage {
  constructor(pageAccessToken) {
    this.token = pageAccessToken;
  }

  async sendMessage(content, senderID) {
    let body;
    if (typeof content === "string") {
      body = { text: content };
    } else {
      body = { text: content.body };
      if (content.attachment) {
        body.attachment = content.attachment;
      }
    }

    return new Promise((resolve, reject) => {
      request(
        {
          url: "https://graph.facebook.com/v20.0/me/messages",
          qs: { access_token: this.token },
          method: "POST",
          json: {
            recipient: { id: senderID },
            message: body,
          },
        },
        (error, response, responseBody) => {
          if (error) {
            console.error("SendMessage error:", error);
            reject(error);
          } else if (responseBody.error) {
            console.error("SendMessage API error:", responseBody.error);
            reject(new Error(responseBody.error.message));
          } else {
            console.log(`Message sent to ${senderID}:`, responseBody);
            resolve(responseBody);
          }
        }
      );
    });
  }
}

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
    for (const entry of body.entry) {
      let event = entry.messaging[0];
      let senderId = event.sender.id;

      if (event.message && event.message.text) {
        let userMessage = event.message.text;
        console.log(`Received message from ${senderId}: ${userMessage}`);
        await processAutocass(senderId, userMessage);
      }
    }
    res.status(200).send("EVENT_RECEIVED");
  } else {
    res.status(404).send();
  }
});

// Autocass processing function
async function processAutocass(senderId, message) {
  try {
    console.log(`Processing autocass for sender ${senderId} with message: ${message}`);
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
      },
      timeout: 10000
    });

    console.log("Autocass response:", res.data);
    const { result, status } = res.data;

    if (status !== "fail" && result && result.body) {
      await apiPage.sendMessage(result.body, senderId);
    } else {
      console.log(`No valid reply from autocass - status: ${status}, result: ${JSON.stringify(result)}`);
      await apiPage.sendMessage("", senderId);
    }
  } catch (error) {
    console.error("Error in autocass processing:", error.message, error.response?.data);
    await apiPage.sendMessage("An error occurred. Please try again.", senderId);
  }
}

// Serve the HTML file for uptime monitoring
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.listen(PORT, () => console.log(`Server is running on port ${PORT}`));
