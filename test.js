async function sendData(userEmail, userUrl) {
    const body = {
        email: userEmail,
        url: userUrl,
    }
    const url = 'http://localhost:3000/user';

    return fetch(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });
}

chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
    if (request.message === "urlChanged") {
        await sendData(request.email, request.url);
    }
});
