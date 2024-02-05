const express = require('express');
const cors = require('cors')
const axios = require('axios');
const {MongoClient} = require('mongodb');
const directory = require('./2fa_directory.json');

const dbUri = 'mongodb://mongodb:27017/';
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
        console.log(error);
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
                        content: {name: account.name, domain: account.domain},
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
    let taskExists = false;
    try {
        await collection.findOne({email: email, "tasks.type": "2fa", "tasks.content": url});
        taskExists = true;
    } catch (err) {
        console.log('No existing 2FA task found.');
    }
    if (taskExists) {
        return;
    }
    try {
        await collection.findOneAndUpdate({email: email}, {
            $push: {
                tasks: {
                    type: "2fa", content: url, state: "PENDING"
                }
            }
        });
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

const getNext2FATask = async (email) => {
    const collection = client.db("app").collection("users");
    let user;
    try {
        user = await collection.findOne({email: email});
    } catch (err) {
        console.log(`Could not find user ${email} in DB.`);
        return;
    }
    try {
        const tasks = user.tasks;
        for (const task of tasks) {
            if (task.type === "2fa" && task.state === "PENDING") {
                return task;
            }
        }
    } catch (err) {
        console.log(`Could not find 2FA task for user ${email}.`);
    }
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
    try {
        const tasks = user.tasks;
        for (const task of tasks) {
            if (task.type === "pw" && task.state === "PENDING") {
                return task;
            }
        }
    } catch (err) {
        console.log(`Could not find compromised password task for user ${email}.`);
    }
}

const updateLast2FaNotificationDate = async (email) => {
    const collection = client.db("app").collection("users");
    const now = new Date();
    try {
        await collection.updateOne({email: email}, {$set: {last2FaNotificationDate: now}});
    } catch (err) {
        console.log(`Could not update last 2FA notification date for user ${email}.`);
    }
}

const getNextSecurityTask = async (email) => {
    const collection = client.db("app").collection("users");
    let user;
    try {
        user = await collection.findOne({email: email});
    } catch (err) {
        console.log(`Could not find user ${email} in DB.`);
        return;
    }
    const now = new Date();
    if (!user.last2FaNotificationDate) {
        await updateLast2FaNotificationDate(email);
    }
    const last2FaNotificationDate = user.last2FaNotificationDate || now;
    const timeDiff2Fa = Math.abs(now - last2FaNotificationDate) / 1000;

    const lastPwNotificationDate = user.lastPwNotificationDate;
    const timeDiffPw = Math.abs(now - lastPwNotificationDate) / 1000;

    // 3 hours timeout for 2FA notifications, 24 hours for compromised password notifications
    const notification2FaPossible = timeDiff2Fa > 60 * 60 * 3;
    const notificationPwPossible = timeDiffPw > 60 * 60 * 24;

    // get the next possible security task
    if (notification2FaPossible && notificationPwPossible) {
        if (Math.random() >= 0.5) {
            return await getNext2FATask(email);
        }
        return await getNextCompromisedPwTask(email);
    } else if (notification2FaPossible) {
        return await getNext2FATask(email);
    } else if (notificationPwPossible) {
        return await getNextCompromisedPwTask(email);
    }
    return undefined;
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
        await create2FATask(userEmail, userUrl);
    }

    const securityTask = await getNextSecurityTask(userEmail);
    if (securityTask) {
        await updateLast2FaNotificationDate(userEmail);
        return res.send({
            type: securityTask.type,
            content: securityTask.content,
        });
    }

    return res.sendStatus(200);
});

// Start the server and listen on the specified port
app.listen(port, async () => {
    await connectDb();
    console.log(`Server is running on http://localhost:${port}`);
});
