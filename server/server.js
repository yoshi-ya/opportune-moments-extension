const express = require('express');
const cors = require('cors')
const axios = require('axios');
const url = require('url');
const {MongoClient} = require('mongodb');
const {OpenAI} = require("openai");
const directory = require('./2fa_directory.json');

const dbUri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.egjedqq.mongodb.net/?retryWrites=true&w=majority`;
const app = express();
const port = 3000;

const logger = (req, res, next) => {
    const timestamp = new Date().toLocaleString();
    const method = req.method;
    const url = req.url;
    console.log(`[${timestamp}] ${method} ${url}`);
    next();
}
// middleware
app.use(cors())
app.use(logger)
app.use(express.json());


const client = new MongoClient(dbUri, {});
const openai = new OpenAI();

const connectDb = async () => {
    try {
        await client.connect();
        console.log("Database connected.");
    } catch (error) {
        console.log("Could not connect to DB.")
        await client.close();
    }
}

const check2FA = (domain) => {
    let isAvailable = directory.some((entry) => {
        return domain.includes(entry[1].domain);
    });
    if (!isAvailable) {
        isAvailable = directory.some((entry) => {
            if (!entry[1]["additional-domains"]) return false;
            return entry[1]["additional-domains"].some((additionalDomain) => {
                return domain.includes(additionalDomain);
            });
        });
    }
    return isAvailable;
}

const getCompromisedAccounts = async (email) => {
    const url = `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}`;
    const headers = {
        headers: {
            'hibp-api-key': process.env.HIBP_API_KEY,
            'Content-Type': 'application/json',
        },
        params: {
            'truncateResponse': 'false',
        }
    }

    let breaches = [];
    try {
        const response = await axios.get(url, headers);
        if (response.status !== 404) {
            for (const breach of response.data) {
                breaches.push({name: breach.Name, domain: breach.Domain});
            }
        }
    } catch (error) {
        console.log('No breaches found.');
    }
    return breaches;
}

const createCompromisedPwTask = async (email, accounts) => {
    const collection = client.db("app").collection("users");
    try {
        for (const account of accounts) {
            await collection.findOneAndUpdate({email: email}, {
                $push: {
                    tasks: {
                        type: "pw",
                        domain: account.domain,
                        state: "PENDING",
                    }
                }
            });
        }
    } catch (err) {
        console.log('Could not create compromised password task.');
    }
}

const initializeUser = async (email) => {
    const collection = client.db("app").collection("users");
    console.log("Creating new user...");
    await collection.insertOne({email: email});
    const compromisedAccounts = await getCompromisedAccounts(email);
    await createCompromisedPwTask(email, compromisedAccounts);
}

const getNextCompromisedPwTask = async (email) => {
    const collection = client.db("app").collection("users");
    let user;
    try {
        user = await collection.findOne({email: email});
    } catch (err) {
        console.log(`Could not find user in DB.`);
        return;
    }
    const now = new Date();
    const lastPwNotificationDate = user.lastPwNotificationDate || now;
    const timeDiff = Math.abs(now - lastPwNotificationDate) / 1000;
    if (!timeDiff > 60 * 60 * 24) {
        return;
    }

    try {
        const tasks = user.tasks;
        const pwTasks = tasks.filter((task) => {
            return task.type === "pw" && task.state === "PENDING";
        });
        if (pwTasks.length > 0) {
            return pwTasks[0];
        }
    } catch (err) {
        return undefined;
    }
}

const updateLastPwNotificationDate = async (email) => {
    const collection = client.db("app").collection("users");
    try {
        await collection.updateOne({email: email}, {$set: {lastPwNotificationDate: new Date()}});
    } catch (err) {
        console.log(`Could not update last compromised password notification date.`);
    }
}

const updateLastPwNotificationState = async (email, domain) => {
    const collection = client.db("app").collection("users");
    try {
        await collection.updateOne({email: email, "tasks.domain": domain}, {$set: {"tasks.$": {
            type: "pw",
            domain: domain,
            state: "FINISHED"
        }}});
    } catch (err) {
        console.log(`Could not update compromised password task state.`);
    }
}

// routes
app.post('/task', async (req, res) => {
    const collection = client.db("app").collection("users");
    const userEmail = req.body.email;
    if (!userEmail) {
        return res.sendStatus(400);
    }

    const domain = url.parse(req.body.url).hostname;

    let user;
    try {
        user = await collection.findOne({email: userEmail});
    } catch (err) {
        console.log(`Could not find user in DB.`);
    }

    if (!user) {
        await initializeUser(userEmail);
    }

    const is2FAvailable = check2FA(domain, userEmail);
    let isRelevant = false;
    try {
        isRelevant = !user.interactions.some((interaction) => {
        return interaction.domain === domain;
    });
    } catch (err) {
        isRelevant = true;
    }

    if (is2FAvailable && isRelevant) {
        return res.send({type: "2fa", domain: domain});
    }

    const createdCompromisedPwTask = await getNextCompromisedPwTask(userEmail);
    if (createdCompromisedPwTask) {
        return res.send(createdCompromisedPwTask);
    }

    return res.sendStatus(200);
});

app.get("/instructions/:type/:url", async (req, res) => {
    const type = req.params.type;
    const url = req.params.url;
    const openAiRequestText = type === "pw" ? `Give a very short summary on how to change your password for ${url}` : `Give a very short summary on how to enable 2FA for ${url}`;
    const completion = await openai.chat.completions.create({
        messages: [{role: "system", content: openAiRequestText}],
        model: "gpt-3.5-turbo",
    });
    const instructions = completion.choices[0].message?.content;
    res.send({data: instructions});
});

app.post("/feedback", async (req, res) => {
    const collection = client.db("app").collection("users");
    try {
        await collection.findOne({email: req.body.email});
    } catch (err) {
        console.log('Could not find user in DB.');
        return res.sendStatus(400);
    }

    try {
        await collection.findOneAndUpdate({email: req.body.email}, {
            $push: {
                interactions: {
                    date: new Date(),
                    type: req.body.taskType,
                    domain: req.body.domain,
                    feedback: req.body.feedback || "",
                    affirmative: req.body.affirmative,
                }
            }
        });
    } catch (err) {
        console.log('Could not store interaction to DB.');
        return res.sendStatus(400);
    }

    if (req.body.taskType === "pw") {
        await updateLastPwNotificationDate(req.body.email);
        await updateLastPwNotificationState(req.body.email, req.body.domain);
    }

    return res.sendStatus(201);
});

// Start the server and listen on the specified port
app.listen(port, async () => {
    await connectDb();
    console.log(`Server is running on http://localhost:${port}`);
});
