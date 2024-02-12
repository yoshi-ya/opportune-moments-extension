const express = require('express');
const cors = require('cors')
const axios = require('axios');
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
        console.log(error);
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
        console.log('No breaches found for this email.');
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
                        service: account.name,
                        url: account.domain,
                        state: "PENDING",
                    }
                }
            });
        }
    } catch (err) {
        console.log('Could not create compromised password task.');
        console.log(err);
    }
}

const create2FATask = async (email, url) => {
    const collection = client.db("app").collection("users");
    let user;
    try {
        user = await collection.findOne({email: email});
    } catch (err) {
        console.log('Could not find user in DB.');
    }
    if (user.tasks) {
        const tasks = user.tasks.filter((task) => {
            return task.type === "2fa";
        });
        const taskExists = tasks.some((task) => {
            return url.includes(task.url);
        });
        if (taskExists) {
            return;
        }
    }
    try {
        await collection.findOneAndUpdate({email: email}, {
            $push: {
                tasks: {
                    type: "2fa", url: url, state: "PENDING"
                }
            }
        });
        return {type: "2fa", url: url, state: "PENDING"};
    } catch (err) {
        console.log('Could not create 2FA task.');
        console.log(err);
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
        console.log(`Could not find user ${email} in DB.`);
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
        console.log(`Could not find compromised password task for user ${email}.`);
    }
}

const updateLast2FaNotificationDate = async (email) => {
    const collection = client.db("app").collection("users");
    try {
        await collection.updateOne({email: email}, {$set: {last2FaNotificationDate: new Date()}});
    } catch (err) {
        console.log(`Could not update last 2FA notification date for user ${email}.`);
    }
}

const updateLastPwNotificationDate = async (email) => {
    const collection = client.db("app").collection("users");
    try {
        await collection.updateOne({email: email}, {$set: {lastPwNotificationDate: new Date()}});
    } catch (err) {
        console.log(`Could not update last compromised password notification date for user ${email}.`);
    }
}

async function get2FaInstructions(url) {
    console.log(`Getting 2FA instructions for ${url}`);
  const completion = await openai.chat.completions.create({
    messages: [{ role: "system", content: `Give a very short summary on how to enable 2FA for ${url}` }],
    model: "gpt-3.5-turbo",
  });
  console.log(completion);
  return completion.choices[0].message?.content;
}

async function getPwInstructions(url) {
  const completion = await openai.chat.completions.create({
    messages: [{ role: "system", content: `Give a very short summary on how to change your password for ${url}` }],
    model: "gpt-3.5-turbo",
  });

  return completion.choices[0].message?.content;
}

// routes
app.post('/user', async (req, res) => {
    const collection = client.db("app").collection("users");
    const userEmail = req.body.email;
    const userUrl = req.body.url;

    let user;
    try {
        user = await collection.findOne({email: userEmail});
    } catch (err) {
        console.log(`Could not find user ${userEmail} in DB.`);
    }

    if (!user) {
        await initializeUser(userEmail);
        return res.sendStatus(201);
    }

    const is2FAvailable = check2FA(userUrl);
    if (is2FAvailable) {
        const created2FaTask = await create2FATask(userEmail, userUrl);
        if (created2FaTask) {
            await updateLast2FaNotificationDate(userEmail);
            return res.send(created2FaTask);
        }
    }

    const createdCompromisedPwTask = await getNextCompromisedPwTask(userEmail);
    if (createdCompromisedPwTask) {
        await updateLastPwNotificationDate(userEmail);
        return res.send(createdCompromisedPwTask);
    }

    return res.sendStatus(200);
});

app.get("/instructions/:type/:url", async (req, res) => {
    const type = req.params.type;
    const url = req.params.url;
    let instructions;
    if (type === "2fa") {
        instructions = await get2FaInstructions(url);
    } else if (type === "pw") {
        instructions = await getPwInstructions(url);
    }
    res.send({data: instructions});
});

// Start the server and listen on the specified port
app.listen(port, async () => {
    await connectDb();
    console.log(`Server is running on http://localhost:${port}`);
});
