const express = require('express');
const cors = require('cors')
const axios = require('axios');
const {MongoClient, ServerApiVersion} = require('mongodb');
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
        console.error(error);
        await client.close();
    }
}

const check2FA = (domain) => {
    let isAvailable = false;
    isAvailable = directory.some((entry) => {
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

// routes
app.post('/user', async (req, res) => {
    const userEmail = req.body.email;
    const userUrl = req.body.url;
    console.log(`User email: ${userEmail}, User URL: ${userUrl}`);
    const is2FAvailable = check2FA(userUrl);
    // const url = `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}`;
    // const headers = {
    //     headers: {
    //         'hibp-api-key': '70b84be5249249daa49a3afc49616a20',
    //     }
    // }
    // res.setHeader('Content-Type', 'application/json');
    // let compromised = false;
    // let accounts = [];
    //
    // try {
    //     const response = await axios.get(url, headers);
    //     if (response.status !== 404) {
    //         accounts = response.data;
    //         compromised = true;
    //     }
    //     return res.send({"accounts": accounts});
    // } catch (error) {
    //     if (error.response.statusCode === 404) {
    //         return res.send({"accounts": accounts});
    //     }
    // }
    // // todo: store information
    // console.log("Writing into DB...");
    // await collection.insertOne({email: email, compromised: compromised, accounts: accounts});
    // console.log("Done!");
    return res.send({"userEmail": userEmail, "userUrl": userUrl, "2fa": is2FAvailable});
});

// Start the server and listen on the specified port
app.listen(port, async () => {
    await connectDb();
    console.log(`Server is running on http://localhost:${port}`);
});
