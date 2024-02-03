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
            'hibp-api-key': '70b84be5249249daa49a3afc49616a20',
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
    for (const account of accounts) {
        await collection.findOneAndUpdate({email: email}, {
            $push: {
                tasks: {
                    type: "pw",
                    content: { name: account.name, domain: account.domain },
                    state: "PENDING",
                }
            }
        });
    }
}

const create2FATask = async (email, url) => {
    const collection = client.db("app").collection("users");
    await collection.findOneAndUpdate({email: email}, {
        $push: {
            tasks: {
                type: "2fa", content: url, state: "PENDING"
            }
        }
    });
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
        console.log(`User ${userEmail} not found in DB.`);
        console.log("Creating new user...");
        await collection.insertOne({ email: userEmail });
        const compromisedAccounts = await getCompromisedAccounts(userEmail);
        await createCompromisedPwTask(userEmail, compromisedAccounts);
    }

    const is2FAvailable = check2FA(userUrl);
    return res.send({"userEmail": userEmail, "userUrl": userUrl, "2fa": is2FAvailable});
});

// Start the server and listen on the specified port
app.listen(port, async () => {
    await connectDb();
    console.log(`Server is running on http://localhost:${port}`);
});
