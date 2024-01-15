const express = require('express');
const cors = require('cors')
const axios = require('axios');

const app = express();
const port = 3000;

// middleware
app.use(cors())

// routes
app.get('/breach/:email', async (req, res) => {
    const email = req.params?.email;
    const url = `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent(email)}`;
    const headers = {
        headers: {
            'hibp-api-key': '70b84be5249249daa49a3afc49616a20',
        }
    }
    res.setHeader('Content-Type', 'application/json');

    try {
        const response = await axios.get(url, headers);
        if (response.status === 404) {
            return res.send({"accounts": []});
        } else {
            return res.send({"accounts": response.data});
        }
    } catch (error) {
        if (error.response.statusCode === 404) {
            return res.send({"accounts": []});
        }
    }
    // todo: store information
});

// Start the server and listen on the specified port
app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
